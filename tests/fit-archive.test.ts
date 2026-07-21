import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { sessionFitFilename } from '../src/lib/fit';
import {
	createSessionFitArchive,
	downloadSessionFitArchive,
	sessionFitArchiveEntries,
	sessionFitArchiveFilename,
} from '../src/lib/fit-archive';
import { parseFitSessions } from '../src/lib/fit-import';
import { savedSessionFixture } from './fixtures/saved-session';

const FIRST_ARCHIVE_PATH = `ride-control-fit/${sessionFitFilename(savedSessionFixture)}`;

function archiveFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
	const file = files[path];
	if (!file) {
		throw new Error(`Missing archive file: ${path}`);
	}
	return file;
}

describe('FIT archive export', () => {
	test('places every session in one folder with collision-safe valid FIT files', async () => {
		const secondSession = { ...savedSessionFixture, id: 'second-session' };
		const secondArchivePath = `ride-control-fit/${sessionFitFilename(secondSession)}`;
		const entries = await sessionFitArchiveEntries([savedSessionFixture, secondSession]);
		expect(Object.keys(entries)).toEqual([FIRST_ARCHIVE_PATH, secondArchivePath]);

		const files = unzipSync(
			await createSessionFitArchive([savedSessionFixture, secondSession])
		);
		expect(Object.keys(files)).toEqual([FIRST_ARCHIVE_PATH, secondArchivePath]);
		expect(await parseFitSessions(archiveFile(files, FIRST_ARCHIVE_PATH))).toHaveLength(1);
		expect(await parseFitSessions(archiveFile(files, secondArchivePath))).toHaveLength(1);
	});

	test('creates a dated ZIP filename', () => {
		expect(sessionFitArchiveFilename(Date.UTC(2026, 6, 19, 12))).toBe(
			'ride-control-fit-2026-07-19.zip'
		);
	});

	test('does not download an empty session archive', async () => {
		await expect(downloadSessionFitArchive([])).rejects.toThrow(
			'There are no saved sessions to download.'
		);
	});
});
