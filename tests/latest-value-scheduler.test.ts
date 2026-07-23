import { describe, expect, test } from 'bun:test';
import { createLatestValueScheduler } from '../src/lib/latest-value-scheduler';

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('latest-value scheduler', () => {
	test('keeps only the newest value while a command is in flight', async () => {
		let now = 0;
		const timers: Array<{ callback: () => void; delay: number }> = [];
		const sent: number[] = [];
		const releases: Array<() => void> = [];
		const scheduler = createLatestValueScheduler({
			minimumIntervalMs: 500,
			now: () => now,
			send: (value: number) => {
				sent.push(value);
				return new Promise<void>((resolve) => releases.push(resolve));
			},
			setTimer: ((callback: () => void, delay: number) => {
				timers.push({ callback, delay });
				return timers.length;
			}) as typeof setTimeout,
		});

		scheduler.push(10);
		scheduler.push(20);
		scheduler.push(30);
		expect(sent).toEqual([10]);

		releases.shift()?.();
		await flushPromises();
		expect(timers.map(({ delay }) => delay)).toEqual([500]);

		now = 500;
		timers.shift()?.callback();
		expect(sent).toEqual([10, 30]);
	});

	test('clears delayed work and lets a new connection send immediately', async () => {
		let now = 0;
		const cleared: unknown[] = [];
		const timers: Array<() => void> = [];
		const sent: number[] = [];
		const scheduler = createLatestValueScheduler({
			clearTimer: (timer) => cleared.push(timer),
			minimumIntervalMs: 500,
			now: () => now,
			send: (value: number) => {
				sent.push(value);
				return Promise.resolve();
			},
			setTimer: ((callback: () => void) => {
				timers.push(callback);
				return timers.length;
			}) as typeof setTimeout,
		});

		scheduler.push(10);
		await flushPromises();
		now = 100;
		scheduler.push(20);
		expect(timers).toHaveLength(1);

		scheduler.clear();
		scheduler.push(30);
		expect(cleared).toEqual([1]);
		expect(sent).toEqual([10, 30]);
	});
});
