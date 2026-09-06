import { describe, expect, test } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import { strToU8, Zip, ZipDeflate, zipSync } from 'fflate';
import { importActivityUpload } from '../src/lib/activity-import';
import { CONTROL_MODE } from '../src/lib/control-mode';
import { sessionToFit } from '../src/lib/fit';
import { sessionToTcx } from '../src/lib/tcx';
import { createSessionTcxArchive } from '../src/lib/tcx-archive';
import { parseTcxSessions } from '../src/lib/tcx-import';
import { WORKOUT_COURSES, workoutTerrainAtDistance } from '../src/lib/workouts';
import type { SavedSession } from '../src/types';
import { savedSessionFixture } from './fixtures/saved-session';

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: DOMParser });

const SESSION_ID_ELEMENT = /\s*<rc:SessionId>.*<\/rc:SessionId>/;
const session: SavedSession = {
	...savedSessionFixture,
	aggregates: {
		...savedSessionFixture.aggregates,
		gear: { count: 2, maximum: 10, sum: 19 },
		resistance: { count: 0, maximum: 0, sum: 0 },
	},
	comments: 'Imported ride notes',
	controlMode: CONTROL_MODE.GEAR,
	history: savedSessionFixture.history.map(({ resistance: _resistance, ...sample }, index) => ({
		...sample,
		gear: 9 + index,
	})),
	id: 'unique-session-id',
};

describe('TCX import', () => {
	test('round trips Ride Control session data and its unique identifier', () => {
		const [imported] = parseTcxSessions(sessionToTcx(session));
		expect(imported).toBeDefined();
		if (!imported) {
			return;
		}
		expect(imported.id).toBe(session.id);
		expect(imported.controlMode).toBe(CONTROL_MODE.GEAR);
		expect(imported.history).toHaveLength(2);
		expect(imported.history[1]).toMatchObject({
			cadence: 82,
			gear: 10,
			heartRate: 142,
			power: 210,
		});
		expect(imported.distance).toBe(1.5);
		expect(imported.calories).toBe(220);
		expect(imported.feeling).toBe('good');
		expect(imported.comments).toBe('Imported ride notes');
		expect(imported.aggregates.gear.maximum).toBe(10);
		expect(imported.profileSnapshot).toEqual(session.profileSnapshot);
	});

	test('keeps legacy Comments notes compatible with session descriptions', () => {
		const legacy = sessionToTcx(session).replace('Description:', 'Comments:');
		expect(parseTcxSessions(legacy)[0]?.comments).toBe(session.comments);
	});

	test('imports every TCX trackpoint from a ride longer than the former sample limit', () => {
		const [sample] = session.history;
		if (!sample) {
			throw new Error('Expected a recorded sample fixture.');
		}
		const history = Array.from({ length: 3601 }, (_, index) => ({
			...sample,
			elapsedSeconds: index + 1,
		}));
		const [imported] = parseTcxSessions(
			sessionToTcx({
				...session,
				elapsedSeconds: history.length,
				endedAt: session.startedAt + history.length * 1000,
				history,
			})
		);
		expect(imported?.history).toHaveLength(history.length);
	});

	test('recognizes Ride Control exports created under a previous repository owner', () => {
		const legacyExport = sessionToTcx(session).replace('RideControlOrg', 'previous-owner');
		const [imported] = parseTcxSessions(legacyExport);
		expect(imported?.id).toBe(session.id);
	});

	test('creates a stable fallback identifier for third-party TCX files', () => {
		const withoutSessionId = sessionToTcx(session).replace(SESSION_ID_ELEMENT, '');
		const [first] = parseTcxSessions(withoutSessionId);
		const [second] = parseTcxSessions(withoutSessionId);
		expect(first?.id).toStartWith('tcx:');
		expect(second?.id).toBe(first?.id);
	});

	test('round trips terrain workout definitions and progress samples', () => {
		const course = WORKOUT_COURSES.find((workout) => workout.id === 'highland-loop');
		expect(course).toBeDefined();
		if (!course) {
			return;
		}
		const publicSource = {
			collectionId: 'tour-de-france-2026',
			providerId: 'grand-tours',
			routeId: '4',
		};
		const publicCourse = {
			...course,
			id: 'tdf-2026-stage-4',
			publicSource,
		};
		const workoutSession: SavedSession = {
			...session,
			continuation: {
				journeyId: 'journey-1',
				previousSessionId: 'session-1',
				workoutStartDistance: 12.5,
			},
			elevationTotals: { ascent: 205.5, descent: 91.25 },
			history: session.history.map((sample, index) => {
				const terrain = workoutTerrainAtDistance(course, index + 1);
				return {
					...sample,
					elevation: terrain.elevation,
					grade: terrain.grade,
					workoutDistance: terrain.distance,
					workoutLap: terrain.lap,
				};
			}),
			workout: { course: publicCourse },
		};
		const [imported] = parseTcxSessions(sessionToTcx(workoutSession));
		expect(imported?.workout).toBeDefined();
		if (!imported?.workout) {
			return;
		}
		expect(imported.workout.course).toMatchObject({
			description: publicCourse.description,
			difficulty: publicCourse.difficulty,
			distance: publicCourse.distance,
			id: publicCourse.id,
			name: publicCourse.name,
			publicSource,
			routeType: publicCourse.routeType,
		});
		expect(imported.workout.course.points).toHaveLength(course.points.length);
		const importedPoint = imported.workout.course.points.at(1);
		const sourcePoint = course.points.at(1);
		expect(importedPoint?.latitude).toBeCloseTo(sourcePoint?.latitude ?? 0, 7);
		expect(imported.history[0]).toMatchObject({
			workoutDistance: 1,
			workoutLap: 1,
		});
		expect(imported.history[0]?.elevation).toBeNumber();
		expect(imported.history[0]?.grade).toBeNumber();
		expect(imported.elevationTotals).toEqual({ ascent: 205.5, descent: 91.25 });
		expect(imported.continuation).toEqual(workoutSession.continuation);
	});

	test('imports TCX files in nested ZIP folders and skips duplicate sessions', async () => {
		const tcx = strToU8(sessionToTcx(session));
		const archive = zipSync({
			'first/ride.tcx': tcx,
			'notes/readme.txt': strToU8('ignored'),
			'second/ride-copy.TCX': tcx,
		});
		const saved = new Map<string, SavedSession>();
		const result = await importActivityUpload(new File([archive], 'rides.zip'), {
			listSessions: () => Promise.resolve([...saved.values()]),
			saveSession: (imported) => {
				saved.set(imported.id, imported);
				return Promise.resolve();
			},
		});
		expect(result.activityFileCount).toBe(2);
		expect(result.importedSessions).toHaveLength(1);
		expect(result.importedSessions[0]?.importedAt).toBeNumber();
		expect(result.duplicateCount).toBe(1);
		expect(result.failures).toHaveLength(0);
	});

	test('reports malformed activities in streaming ZIP entries without losing valid sessions', async () => {
		const chunks: Uint8Array<ArrayBuffer>[] = [];
		const archive = new Zip((error, data) => {
			if (error) {
				throw error;
			}
			chunks.push(data);
		});
		for (const [name, contents] of [
			['notes/ignored.txt', 'Not an activity'],
			['broken.tcx', '<not-tcx />'],
			['nested/valid.tcx', sessionToTcx(session)],
		] as const) {
			const entry = new ZipDeflate(name);
			archive.add(entry);
			entry.push(strToU8(contents), true);
		}
		archive.end();
		const saved: SavedSession[] = [];
		const result = await importActivityUpload(new File(chunks, 'rides.zip'), {
			listSessions: () => Promise.resolve([]),
			saveSession: (imported) => {
				saved.push(imported);
				return Promise.resolve();
			},
		});
		expect(result.activityFileCount).toBe(2);
		expect(saved.map((imported) => imported.id)).toEqual([session.id]);
		expect(result.importedSessions).toEqual(saved);
		expect(result.failures.map((failure) => failure.fileName)).toEqual(['broken.tcx']);
	});

	test('restores a complete Ride Control export containing more than 500 sessions', async () => {
		const sessions = Array.from({ length: 501 }, (_, index) => ({
			...session,
			endedAt: session.endedAt + index * 86_400_000,
			id: `exported-session-${index}`,
			startedAt: session.startedAt + index * 86_400_000,
		}));
		const archive = await createSessionTcxArchive(sessions);
		const saved = new Map<string, SavedSession>();
		const result = await importActivityUpload(
			new File([new Uint8Array(archive)], 'full-export.zip'),
			{
				listSessions: () => Promise.resolve([]),
				saveSession: (imported) => {
					saved.set(imported.id, imported);
					return Promise.resolve();
				},
			}
		);
		expect([...saved.keys()]).toEqual(sessions.map((exported) => exported.id));
		expect(result.importedSessions).toEqual([...saved.values()]);
		expect(result.activityFileCount).toBe(501);
		expect(result.duplicateCount).toBe(0);
		expect(result.failures).toEqual([]);
	});

	test('rejects a ZIP missing its end record even when its activity data is complete', async () => {
		const archive = zipSync({ 'valid.tcx': strToU8(sessionToTcx(session)) });
		const saved: SavedSession[] = [];
		await expect(
			importActivityUpload(new File([archive.subarray(0, -22)], 'truncated.zip'), {
				listSessions: () => Promise.resolve([]),
				saveSession: (imported) => {
					saved.push(imported);
					return Promise.resolve();
				},
			})
		).rejects.toThrow();
		expect(saved).toEqual([]);
	});

	test('reports corrupt ZIP data without hiding earlier successfully saved entries', async () => {
		const tcx = strToU8(sessionToTcx(session));
		const archive = zipSync({
			'first-valid.tcx': [tcx, { level: 0 }],
			'second-broken.tcx': tcx,
		});
		const headers = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
		const secondHeader =
			30 + headers.getUint16(26, true) + headers.getUint16(28, true) + tcx.byteLength;
		const compressedData =
			secondHeader +
			30 +
			headers.getUint16(secondHeader + 26, true) +
			headers.getUint16(secondHeader + 28, true);
		// DEFLATE block type 3 is invalid; the surrounding ZIP remains intact.
		archive[compressedData] = 0b111;
		const saved: SavedSession[] = [];
		const result = await importActivityUpload(new File([archive], 'corrupt.zip'), {
			listSessions: () => Promise.resolve([]),
			saveSession: (imported) => {
				saved.push(imported);
				return Promise.resolve();
			},
		});
		expect(saved.map((imported) => imported.id)).toEqual([session.id]);
		expect(result.importedSessions).toEqual(saved);
		expect(result.failures.map((failure) => failure.fileName)).toEqual(['corrupt.zip']);
	});

	test('imports mixed FIT and TCX archives and detects cross-format duplicates', async () => {
		const archive = zipSync({
			'activities/ride.fit': await sessionToFit(session),
			'activities/ride.tcx': strToU8(sessionToTcx(session)),
		});
		const saved: SavedSession[] = [];
		const result = await importActivityUpload(new File([archive], 'mixed-rides.zip'), {
			listSessions: () => Promise.resolve(saved),
			saveSession: (imported) => {
				saved.push(imported);
				return Promise.resolve();
			},
		});
		expect(result.activityFileCount).toBe(2);
		expect(result.importedSessions).toHaveLength(1);
		expect(result.duplicateCount).toBe(1);
		expect(result.failures).toHaveLength(0);
	});

	test('skips a legacy Ride Control export without an embedded session id', async () => {
		const legacyTcx = sessionToTcx(savedSessionFixture).replace(SESSION_ID_ELEMENT, '');
		let saveCount = 0;
		const result = await importActivityUpload(new File([legacyTcx], 'legacy-ride.tcx'), {
			listSessions: () => Promise.resolve([savedSessionFixture]),
			saveSession: () => {
				saveCount += 1;
				return Promise.resolve();
			},
		});
		expect(result.importedSessions).toHaveLength(0);
		expect(result.duplicateCount).toBe(1);
		expect(saveCount).toBe(0);
	});

	test('rejects unsupported uploads and ZIP files without activity entries', async () => {
		await expect(importActivityUpload(new File(['no'], 'ride.gpx'))).rejects.toThrow();
		const archive = zipSync({ 'readme.txt': strToU8('nothing here') });
		await expect(importActivityUpload(new File([archive], 'rides.zip'))).rejects.toThrow();
	});
});
