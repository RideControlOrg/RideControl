import { zip } from 'fflate';
import type { SavedSession } from '../types';
import { downloadBrowserFile } from './download';
import { sessionFitFilename, sessionToFit } from './fit';

const FIT_ARCHIVE_FOLDER = 'ride-control-fit';
const FIT_EXTENSION_LENGTH = '.fit'.length;
const FIT_ARCHIVE_MIME_TYPE = 'application/zip';

function numberedFitFilename(filename: string, number: number): string {
	if (number === 1) {
		return filename;
	}
	return `${filename.slice(0, -FIT_EXTENSION_LENGTH)}-${number}.fit`;
}

export async function sessionFitArchiveEntries(
	sessions: SavedSession[]
): Promise<Record<string, Uint8Array>> {
	const filenameCounts = new Map<string, number>();
	const entries: [string, Uint8Array][] = [];
	for (const session of sessions) {
		const filename = sessionFitFilename(session);
		const count = (filenameCounts.get(filename) ?? 0) + 1;
		filenameCounts.set(filename, count);
		entries.push([
			`${FIT_ARCHIVE_FOLDER}/${numberedFitFilename(filename, count)}`,
			await sessionToFit(session),
		]);
	}
	return Object.fromEntries(entries);
}

export async function createSessionFitArchive(sessions: SavedSession[]): Promise<Uint8Array> {
	const entries = await sessionFitArchiveEntries(sessions);
	return new Promise((resolve, reject) => {
		zip(entries, { level: 6 }, (error, archive) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(archive);
		});
	});
}

export function sessionFitArchiveFilename(timestamp = Date.now()): string {
	return `ride-control-fit-${new Date(timestamp).toISOString().slice(0, 10)}.zip`;
}

export async function downloadSessionFitArchive(sessions: SavedSession[]): Promise<void> {
	if (sessions.length === 0) {
		throw new Error('There are no saved sessions to download.');
	}
	const archive = await createSessionFitArchive(sessions);
	const archiveBuffer = new ArrayBuffer(archive.byteLength);
	new Uint8Array(archiveBuffer).set(archive);
	downloadBrowserFile(archiveBuffer, sessionFitArchiveFilename(), FIT_ARCHIVE_MIME_TYPE);
}
