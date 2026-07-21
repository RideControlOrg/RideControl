import { describe, expect, test } from 'bun:test';
import { loadScrollPosition, saveScrollPosition } from '../src/lib/scroll-position';

describe('stored scroll positions', () => {
	test('persists and restores a safe rounded position', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(loadScrollPosition('workouts', storage)).toBe(0);
		expect(saveScrollPosition('workouts', 314.6, storage)).toBe(true);
		expect(loadScrollPosition('workouts', storage)).toBe(315);
	});

	test('falls back safely for invalid values and unavailable storage', () => {
		const invalidStorage = { getItem: () => 'not-a-position' };
		expect(loadScrollPosition('workouts', invalidStorage)).toBe(0);

		const unavailableStorage = {
			getItem: () => {
				throw new Error('Unavailable');
			},
			setItem: () => {
				throw new Error('Unavailable');
			},
		};
		expect(loadScrollPosition('workouts', unavailableStorage)).toBe(0);
		expect(saveScrollPosition('workouts', 200, unavailableStorage)).toBe(false);
	});
});
