import { describe, expect, test } from 'bun:test';
import {
	NOTICE_AUTO_DISMISS_MS,
	noticeSecondsRemaining,
	scheduleNoticeDismissal,
} from '../src/lib/notification';

describe('notification utilities', () => {
	test('dismisses a visible notice after 15 seconds', () => {
		let callback: (() => void) | undefined;
		let delay = 0;
		let dismissed = false;
		const cleanup = scheduleNoticeDismissal(
			'Trainer connected.',
			() => {
				dismissed = true;
			},
			{
				clearTimeout: () => undefined,
				setTimeout: (scheduledCallback, scheduledDelay) => {
					callback = scheduledCallback;
					delay = scheduledDelay;
					return 12;
				},
			}
		);

		expect(delay).toBe(NOTICE_AUTO_DISMISS_MS);
		expect(delay).toBe(15_000);
		expect(dismissed).toBe(false);
		callback?.();
		expect(dismissed).toBe(true);
		expect(cleanup).toBeFunction();
	});

	test('cancels the prior timer when the notice changes', () => {
		let clearedTimeout: number | undefined;
		const cleanup = scheduleNoticeDismissal('First notice', () => undefined, {
			clearTimeout: (timeout) => {
				clearedTimeout = timeout;
			},
			setTimeout: () => 27,
		});

		cleanup?.();
		expect(clearedTimeout).toBe(27);
		expect(
			scheduleNoticeDismissal('', () => undefined, {
				clearTimeout: () => undefined,
				setTimeout: () => 1,
			})
		).toBeUndefined();
	});

	test('calculates the visible countdown without going below zero', () => {
		expect(noticeSecondsRemaining(-100)).toBe(15);
		expect(noticeSecondsRemaining(1)).toBe(15);
		expect(noticeSecondsRemaining(1000)).toBe(14);
		expect(noticeSecondsRemaining(14_999)).toBe(1);
		expect(noticeSecondsRemaining(15_000)).toBe(0);
		expect(noticeSecondsRemaining(20_000)).toBe(0);
	});
});
