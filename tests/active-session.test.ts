import { describe, expect, test } from 'bun:test';
import { emptySession } from '../src/constants';
import { loadInitialSession } from '../src/lib/active-session';
import { SESSION_STORAGE_KEY } from '../src/lib/session';
import type { StoredSession } from '../src/types';

function sessionWithSamples(sampleCount: number): StoredSession {
	return {
		...emptySession,
		history: Array.from({ length: sampleCount }, (_, elapsedSeconds) => ({
			cadence: 80,
			elapsedSeconds,
			heartRate: 140,
			power: 180,
			resistance: 40,
			speed: 30,
		})),
		startedAt: 1000,
	};
}

describe('active session IndexedDB migration', () => {
	test('moves the complete legacy localStorage ride and deletes it after the write', async () => {
		const legacy = sessionWithSamples(4001);
		const removed: string[] = [];
		let persisted: StoredSession | undefined;
		const loaded = await loadInitialSession(
			{
				getItem: (key) => (key === SESSION_STORAGE_KEY ? JSON.stringify(legacy) : null),
				removeItem: (key) => removed.push(key),
			},
			{
				load: () => Promise.resolve(undefined),
				persist: (session) => {
					persisted = session;
					return Promise.resolve();
				},
			}
		);

		expect(loaded.history).toHaveLength(4001);
		expect(persisted?.history).toHaveLength(4001);
		expect(removed).toEqual([SESSION_STORAGE_KEY]);
	});

	test('uses an existing IndexedDB recovery record and removes stale legacy data', async () => {
		const active = sessionWithSamples(12);
		const removed: string[] = [];
		let persisted = false;
		const loaded = await loadInitialSession(
			{
				getItem: () => JSON.stringify(sessionWithSamples(2)),
				removeItem: (key) => removed.push(key),
			},
			{
				load: () => Promise.resolve(active),
				persist: () => {
					persisted = true;
					return Promise.resolve();
				},
			}
		);

		expect(loaded).toBe(active);
		expect(persisted).toBe(false);
		expect(removed).toEqual([SESSION_STORAGE_KEY]);
	});

	test('keeps localStorage intact when IndexedDB is unavailable', async () => {
		const legacy = sessionWithSamples(3);
		const removed: string[] = [];
		const loaded = await loadInitialSession(
			{
				getItem: () => JSON.stringify(legacy),
				removeItem: (key) => removed.push(key),
			},
			{
				load: () => Promise.reject(new Error('IndexedDB unavailable')),
				persist: () => Promise.resolve(),
			}
		);

		expect(loaded.history).toHaveLength(3);
		expect(removed).toEqual([]);
	});
});
