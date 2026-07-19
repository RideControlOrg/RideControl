import { describe, expect, test } from 'bun:test';
import {
	rememberWelcomeDismissal,
	shouldShowWelcome,
	WELCOME_DISMISSED_STORAGE_KEY,
} from '../src/lib/welcome';

describe('welcome preferences', () => {
	test('shows the welcome message until its dismissal is remembered', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};

		expect(shouldShowWelcome(storage)).toBe(true);
		expect(rememberWelcomeDismissal(storage)).toBe(true);
		expect(values.get(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');
		expect(shouldShowWelcome(storage)).toBe(false);
	});

	test('keeps showing the welcome message when storage is unavailable', () => {
		const unavailableStorage = {
			getItem: () => {
				throw new Error('Unavailable');
			},
			setItem: () => {
				throw new Error('Unavailable');
			},
		};

		expect(shouldShowWelcome(unavailableStorage)).toBe(true);
		expect(rememberWelcomeDismissal(unavailableStorage)).toBe(false);
	});
});
