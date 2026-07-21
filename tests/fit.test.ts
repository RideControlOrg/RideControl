import { describe, expect, test } from 'bun:test';
import { Decoder, Stream } from '@garmin/fitsdk';
import { sessionFitFilename, sessionToFit } from '../src/lib/fit';
import { parseFitSessions } from '../src/lib/fit-import';
import { savedSessionFixture as session } from './fixtures/saved-session';

const FIT_FILENAME = /^ride-control-2026-07-18T16-00-00\.000Z-[a-z0-9]+\.fit$/;

describe('FIT activity files', () => {
	test('exports a valid indoor cycling activity with Strava-compatible records', async () => {
		const fit = await sessionToFit(session);
		const decoder = new Decoder(Stream.fromArrayBuffer(fit.slice().buffer));
		expect(decoder.isFIT()).toBe(true);
		expect(decoder.checkIntegrity()).toBe(true);
		const { errors, messages } = decoder.read();
		expect(errors).toHaveLength(0);
		expect(messages.fileIdMesgs?.[0]).toMatchObject({
			manufacturer: 'development',
			productName: 'Ride Control',
			type: 'activity',
		});
		expect(messages.deviceInfoMesgs?.[0]).toMatchObject({
			deviceIndex: 'creator',
			manufacturer: 'development',
			productName: 'Ride Control',
		});
		expect(messages.sessionMesgs?.[0]).toMatchObject({
			numLaps: 1,
			sport: 'cycling',
			subSport: 'indoorCycling',
			totalCalories: 220,
			totalCycles: 3,
			totalDistance: 1500,
			totalElapsedTime: 2,
		});
		expect(messages.recordMesgs).toHaveLength(2);
		expect(messages.recordMesgs?.[1]).toMatchObject({
			cadence: 82,
			distance: 1500,
			heartRate: 142,
			power: 210,
			resistance: 45,
		});
		expect(messages.eventMesgs?.map((message) => message.eventType)).toEqual([
			'start',
			'stopAll',
		]);
		const activity = messages.activityMesgs?.[0];
		expect(activity?.timestamp).toBeInstanceOf(Date);
		expect(activity?.localTimestamp).toBeNumber();
		if (!(activity?.timestamp instanceof Date) || typeof activity.localTimestamp !== 'number') {
			throw new Error('Expected decoded activity timestamps');
		}
		const utcFitTimestamp = Math.floor((activity.timestamp.getTime() - 631_065_600_000) / 1000);
		const expectedTimezoneOffset =
			-new Date(session.startedAt + 2000).getTimezoneOffset() * 60 || 0;
		expect(activity.localTimestamp - utcFitTimestamp).toBe(expectedTimezoneOffset);
	});

	test('imports exported FIT metrics and detects a stable activity identity', async () => {
		const fit = await sessionToFit(session);
		const [first] = await parseFitSessions(fit);
		const [second] = await parseFitSessions(fit);
		expect(first?.id).toStartWith('fit:');
		expect(second?.id).toBe(first?.id);
		expect(first).toMatchObject({
			calories: 220,
			distance: 1.5,
			elapsedSeconds: 2,
		});
		expect(first?.history).toHaveLength(2);
		expect(first?.history[1]).toMatchObject({
			cadence: 82,
			heartRate: 142,
			power: 210,
			resistance: 45,
		});
		expect(first?.history[1]?.speed).toBeCloseTo(30, 2);
	});

	test('creates a filesystem-safe FIT filename', () => {
		expect(sessionFitFilename(session)).toMatch(FIT_FILENAME);
		expect(sessionFitFilename({ ...session, id: 'another-session' })).not.toBe(
			sessionFitFilename(session)
		);
	});

	test('rejects empty exports and malformed FIT data', async () => {
		await expect(sessionToFit({ ...session, history: [] })).rejects.toThrow(
			'The session has no recorded samples to export.'
		);
		await expect(parseFitSessions(new Uint8Array([1, 2, 3]))).rejects.toThrow(
			'The file is not a FIT document.'
		);
	});
});
