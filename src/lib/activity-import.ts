import { strFromU8, unzip } from 'fflate';
import type { SavedSession } from '../types';
import {
	ACTIVITY_FILE_FORMAT,
	type ActivityFileFormat,
	sessionImportFingerprint,
} from './activity-file';
import { errorMessage } from './errors';
import { parseFitSessions } from './fit-import';
import { listAllSavedSessions, saveSession } from './saved-sessions';
import { parseTcxSessions } from './tcx-import';

const ACTIVITY_FILE_EXTENSION = /\.(fit|tcx)$/i;
const ZIP_FILE_EXTENSION = /\.zip$/i;
const MAX_ACTIVITY_FILES_PER_IMPORT = 500;
const MAX_ACTIVITY_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ACTIVITY_ARCHIVE_BYTES = 100 * 1024 * 1024;

interface NamedActivityFile {
	contents: Uint8Array;
	format: ActivityFileFormat;
	name: string;
}

interface ImportDependencies {
	listSessions: () => Promise<SavedSession[]>;
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

function unzipArchive(data: Uint8Array): Promise<Record<string, Uint8Array>> {
	let activityFileCount = 0;
	let totalBytes = 0;
	let limitExceeded = false;
	return new Promise((resolve, reject) => {
		unzip(
			data,
			{
				filter: (file) => {
					if (!formatForFilename(file.name)) {
						return false;
					}
					activityFileCount += 1;
					totalBytes += file.originalSize;
					limitExceeded =
						activityFileCount > MAX_ACTIVITY_FILES_PER_IMPORT ||
						file.originalSize > MAX_ACTIVITY_FILE_BYTES ||
						totalBytes > MAX_ACTIVITY_ARCHIVE_BYTES;
					return !limitExceeded;
				},
			},
			(error, files) => {
				if (error) {
					reject(error);
					return;
				}
				if (limitExceeded) {
					reject(
						new Error('The ZIP contains too many or excessively large activity files.')
					);
					return;
				}
				resolve(files);
			}
		);
	});
}

async function uploadedActivityFiles(file: File): Promise<NamedActivityFile[]> {
	const directFormat = formatForFilename(file.name);
	if (directFormat) {
		if (file.size > MAX_ACTIVITY_FILE_BYTES) {
			throw new Error('The activity file is too large to import.');
		}
		return [
			{
				contents: new Uint8Array(await file.arrayBuffer()),
				format: directFormat,
				name: file.name,
			},
		];
	}
	if (!ZIP_FILE_EXTENSION.test(file.name)) {
		throw new Error('Choose a .fit or .tcx file, or a .zip containing activity files.');
	}
	const files = await unzipArchive(new Uint8Array(await file.arrayBuffer()));
	const entries = Object.entries(files).flatMap<NamedActivityFile>(([name, contents]) => {
		const format = formatForFilename(name);
		return format ? [{ contents, format, name }] : [];
	});
	if (entries.length === 0) {
		throw new Error('The ZIP contains no FIT or TCX activity files.');
	}
	return entries;
}

function parseActivityFile(file: NamedActivityFile): Promise<SavedSession[]> | SavedSession[] {
	switch (file.format) {
		case ACTIVITY_FILE_FORMAT.FIT:
			return parseFitSessions(file.contents);
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
	const activityFiles = await uploadedActivityFiles(file);
	const importedAt = Date.now();
	const savedSessions = await dependencies.listSessions();
	const savedIds = new Set(savedSessions.map((session) => session.id));
	const savedFingerprints = new Set(savedSessions.map(sessionImportFingerprint));
	const result: ActivityImportResult = {
		activityFileCount: activityFiles.length,
		duplicateCount: 0,
		failures: [],
		importedSessions: [],
	};
	for (const activityFile of activityFiles) {
		try {
			const sessions = await parseActivityFile(activityFile);
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
