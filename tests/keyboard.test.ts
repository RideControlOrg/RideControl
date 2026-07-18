import { describe, expect, test } from 'bun:test';
import { appShortcutForKey } from '../src/lib/keyboard';

describe('keyboard shortcuts', () => {
	test('maps history, help, and pause keys', () => {
		expect(appShortcutForKey({ code: 'KeyH', key: 'h' })).toBe('history');
		expect(appShortcutForKey({ code: 'KeyH', key: 'H' })).toBe('history');
		expect(appShortcutForKey({ code: 'Slash', key: '?' })).toBe('shortcuts');
		expect(appShortcutForKey({ code: 'Space', key: ' ' })).toBe('pause');
	});

	test('ignores keys without an application shortcut', () => {
		expect(appShortcutForKey({ code: 'KeyR', key: 'r' })).toBeUndefined();
	});
});
