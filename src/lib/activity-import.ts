import { strFromU8, Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import type { SavedSession, WorkoutCourse } from '../types';
import {
	ACTIVITY_FILE_FORMAT,
	type ActivityFileFormat,
	sessionImportFingerprint,
} from './activity-file';
import { errorMessage } from './errors';
import { parseFitSessions } from './fit-import';
import { listAllSavedSessions, saveSession } from './saved-sessions';
import { parseTcxSessions } from './tcx-import';
import { loadCustomWorkouts } from './workout-file';
import { WORKOUT_COURSES } from './workouts';

const ACTIVITY_FILE_EXTENSION = /\.(fit|tcx)$/i;
const ZIP_FILE_EXTENSION = /\.zip$/i;
const INPUT_CHUNK_BYTES = 64 * 1024;
const ZIP_END_RECORD_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xff_ff;

interface NamedActivityFile {
	contents: Uint8Array;
	format: ActivityFileFormat;
	name: string;
}

interface BufferedArchiveActivity {
	chunks: Uint8Array[];
	format: ActivityFileFormat;
	name: string;
	size: number;
}

interface ImportDependencies {
	listSessions: () => Promise<SavedSession[]>;
	listWorkoutCourses?: () => readonly WorkoutCourse[];
	saveSession: (session: SavedSession) => Promise<void>;
}

export interface ActivityImportFailure {
	fileName: string;
	message: string;
}

export interface ActivityImportResult {
	activityFileCount: number;
	duplicateCount: number;
	failures: ActivityImportFailure[];
	importedSessions: SavedSession[];
}

const DEFAULT_IMPORT_DEPENDENCIES: ImportDependencies = {
	listSessions: listAllSavedSessions,
	listWorkoutCourses: () => [...WORKOUT_COURSES, ...loadCustomWorkouts()],
	saveSession,
};

function formatForFilename(filename: string): ActivityFileFormat | undefined {
	const match = ACTIVITY_FILE_EXTENSION.exec(filename);
	const extension = match?.[1]?.toLowerCase();
	if (extension === ACTIVITY_FILE_FORMAT.FIT) {
		return ACTIVITY_FILE_FORMAT.FIT;
	}
	if (extension === ACTIVITY_FILE_FORMAT.TCX) {
		return ACTIVITY_FILE_FORMAT.TCX;
	}
}

function invalidArchive(): Error {
	return new Error('The ZIP is incomplete or invalid. Export it again and retry.');
}

async function archiveEntryCount(file: File): Promise<number> {
	// Unzip only reads local records and accepts a missing central directory.
	// Check the end record separately without loading the compressed archive.
	const tailOffset = Math.max(0, file.size - ZIP_END_RECORD_BYTES - ZIP_MAX_COMMENT_BYTES - 20);
	const tail = new DataView(await file.slice(tailOffset).arrayBuffer());
	let end = tail.byteLength - ZIP_END_RECORD_BYTES;
	for (; end >= 0; end -= 1) {
		if (
			tail.getUint32(end, true) === 0x06_05_4b_50 &&
			end + ZIP_END_RECORD_BYTES + tail.getUint16(end + 20, true) === tail.byteLength
		) {
			break;
		}
	}
	if (
		end < 0 ||
		tail.getUint16(end + 4, true) !== 0 ||
		tail.getUint16(end + 6, true) !== 0 ||
		tail.getUint16(end + 8, true) !== tail.getUint16(end + 10, true)
	) {
		throw invalidArchive();
	}
	let count = tail.getUint16(end + 10, true);
	let directorySize = tail.getUint32(end + 12, true);
	let directoryOffset = tail.getUint32(end + 16, true);
	let directoryEnd = tailOffset + end;
	if (end >= 20 && tail.getUint32(end - 20, true) === 0x07_06_4b_50) {
		const zip64Offset = Number(tail.getBigUint64(end - 12, true));
		if (
			!Number.isSafeInteger(zip64Offset) ||
			tail.getUint32(end - 16, true) !== 0 ||
			tail.getUint32(end - 4, true) !== 1 ||
			zip64Offset + 56 > directoryEnd - 20
		) {
			throw invalidArchive();
		}
		const zip64 = new DataView(await file.slice(zip64Offset, zip64Offset + 56).arrayBuffer());
		if (
			zip64.byteLength !== 56 ||
			zip64.getUint32(0, true) !== 0x06_06_4b_50 ||
			zip64.getUint32(16, true) !== 0 ||
			zip64.getUint32(20, true) !== 0 ||
			zip64.getBigUint64(24, true) !== zip64.getBigUint64(32, true)
		) {
			throw invalidArchive();
		}
		count = Number(zip64.getBigUint64(32, true));
		directorySize = Number(zip64.getBigUint64(40, true));
		directoryOffset = Number(zip64.getBigUint64(48, true));
		directoryEnd = zip64Offset;
	}
	if (
		!(
			Number.isSafeInteger(count) &&
			Number.isSafeInteger(directorySize) &&
			Number.isSafeInteger(directoryOffset)
		) ||
		directoryOffset + directorySize !== directoryEnd ||
		directorySize < count * 46
	) {
		throw invalidArchive();
	}
	return count;
}

function completeArchiveActivity(activity: BufferedArchiveActivity): NamedActivityFile {
	const [firstChunk] = activity.chunks;
	let contents: Uint8Array;
	if (activity.chunks.length === 1 && firstChunk) {
		contents = firstChunk;
	} else {
		contents = new Uint8Array(activity.size);
		let position = 0;
		for (const chunk of activity.chunks) {
			contents.set(chunk, position);
			position += chunk.byteLength;
		}
	}
	activity.chunks.length = 0;
	return { contents, format: activity.format, name: activity.name };
}

async function* uploadedActivityFiles(file: File): AsyncGenerator<NamedActivityFile> {
	const directFormat = formatForFilename(file.name);
	if (directFormat) {
		const contents = new Uint8Array(file.size);
		for (let offset = 0; offset < file.size; offset += INPUT_CHUNK_BYTES) {
			contents.set(
				new Uint8Array(await file.slice(offset, offset + INPUT_CHUNK_BYTES).arrayBuffer()),
				offset
			);
		}
		yield { contents, format: directFormat, name: file.name };
		return;
	}
	if (!ZIP_FILE_EXTENSION.test(file.name)) {
		throw new Error('Choose a .fit or .tcx file, or a .zip containing activity files.');
	}
	const expectedEntryCount = await archiveEntryCount(file);
	const completed: BufferedArchiveActivity[] = [];
	let entryCount = 0;
	let activityFileCount = 0;
	let unfinishedActivities = 0;
	let archiveError: unknown;
	class SkipZipEntry extends UnzipPassThrough {}
	const archive = new Unzip((entry) => {
		entryCount += 1;
		const format = formatForFilename(entry.name);
		if (!format) {
			// Not starting an entry makes fflate retain its compressed chunks.
			// Pass them straight to a discard callback instead of inflating them.
			SkipZipEntry.compression = entry.compression;
			archive.register(SkipZipEntry);
			entry.ondata = () => undefined;
			entry.start();
			return;
		}
		archive.register(UnzipPassThrough);
		archive.register(UnzipInflate);
		activityFileCount += 1;
		unfinishedActivities += 1;
		const activity: BufferedArchiveActivity = { chunks: [], format, name: entry.name, size: 0 };
		entry.ondata = (error, data, final) => {
			if (error) {
				archiveError ??= error;
			}
			if (archiveError) {
				activity.chunks.length = 0;
				return;
			}
			activity.chunks.push(data);
			activity.size += data.byteLength;
			if (final) {
				if (entry.originalSize !== undefined && activity.size !== entry.originalSize) {
					archiveError = invalidArchive();
					activity.chunks.length = 0;
					return;
				}
				unfinishedActivities -= 1;
				completed.push(activity);
			}
		};
		entry.start();
	});
	for (let offset = 0; offset < file.size; offset += INPUT_CHUNK_BYTES) {
		try {
			const chunk = new Uint8Array(
				await file.slice(offset, offset + INPUT_CHUNK_BYTES).arrayBuffer()
			);
			archive.push(chunk, offset + chunk.byteLength === file.size);
		} catch (error) {
			archiveError ??= error;
		}
		// Drain this input chunk before reading more. Only the entry currently
		// inflating and entries completed by this chunk retain their raw data.
		for (const activity of completed) {
			yield completeArchiveActivity(activity);
		}
		completed.length = 0;
		if (archiveError) {
			throw archiveError;
		}
	}
	if (entryCount !== expectedEntryCount || unfinishedActivities !== 0) {
		throw invalidArchive();
	}
	if (activityFileCount === 0) {
		throw new Error('The ZIP contains no FIT or TCX activity files.');
	}
}

function parseActivityFile(
	file: NamedActivityFile,
	workoutCourses: readonly WorkoutCourse[]
): Promise<SavedSession[]> | SavedSession[] {
	switch (file.format) {
		case ACTIVITY_FILE_FORMAT.FIT:
			return parseFitSessions(file.contents, workoutCourses);
		case ACTIVITY_FILE_FORMAT.TCX:
			return parseTcxSessions(strFromU8(file.contents));
		default:
			throw new Error('The activity file format is not supported.');
	}
}

export async function importActivityUpload(
	file: File,
	dependencies: ImportDependencies = DEFAULT_IMPORT_DEPENDENCIES
): Promise<ActivityImportResult> {
	const activityFiles = uploadedActivityFiles(file);
	let nextActivityFile = await activityFiles.next();
	const importedAt = Date.now();
	const savedSessions = await dependencies.listSessions();
	const workoutCourses = dependencies.listWorkoutCourses?.() ?? [];
	const savedIds = new Set(savedSessions.map((session) => session.id));
	const savedFingerprints = new Set(savedSessions.map(sessionImportFingerprint));
	const result: ActivityImportResult = {
		activityFileCount: 0,
		duplicateCount: 0,
		failures: [],
		importedSessions: [],
	};
	try {
		while (!nextActivityFile.done) {
			const activityFile = nextActivityFile.value;
			result.activityFileCount += 1;
			try {
				const sessions = await parseActivityFile(activityFile, workoutCourses);
				for (const session of sessions) {
					const fingerprint = sessionImportFingerprint(session);
					if (savedIds.has(session.id) || savedFingerprints.has(fingerprint)) {
						result.duplicateCount += 1;
						continue;
					}
					const importedSession = { ...session, importedAt };
					await dependencies.saveSession(importedSession);
					savedIds.add(session.id);
					savedFingerprints.add(fingerprint);
					result.importedSessions.push(importedSession);
				}
			} catch (error) {
				result.failures.push({ fileName: activityFile.name, message: errorMessage(error) });
			}
			nextActivityFile = await activityFiles.next();
		}
	} catch (error) {
		// A later ZIP read/decode failure must not hide sessions already saved.
		result.failures.push({ fileName: file.name, message: errorMessage(error) });
	}
	return result;
}

export function activityImportResultMessage(result: ActivityImportResult): string {
	const messages: string[] = [];
	const imported = result.importedSessions.length;
	if (imported > 0) {
		messages.push(`Imported ${imported} ${imported === 1 ? 'session' : 'sessions'}`);
	} else {
		messages.push('No new sessions imported');
	}
	if (result.duplicateCount > 0) {
		messages.push(
			`${result.duplicateCount} ${result.duplicateCount === 1 ? 'duplicate' : 'duplicates'} skipped`
		);
	}
	if (result.failures.length > 0) {
		messages.push(
			`${result.failures.length} ${result.failures.length === 1 ? 'file' : 'files'} could not be imported`
		);
	}
	return messages.join(' · ');
}
