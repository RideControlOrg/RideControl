import { describe, expect, test } from 'bun:test';
import {
	MAXIMUM_RENDERED_CHART_SAMPLES,
	sampleSessionChartHistory,
} from '../src/lib/session-chart-sampling';
import type { MetricSample } from '../src/types';

function sampleAt(elapsedSeconds: number, power = elapsedSeconds): MetricSample {
	return {
		cadence: 70 + (elapsedSeconds % 30),
		elapsedSeconds,
		elevation: elapsedSeconds % 100,
		gear: 8 + (elapsedSeconds % 12),
		grade: (elapsedSeconds % 20) - 10,
		heartRate: 110 + (elapsedSeconds % 50),
		power,
		resistance: elapsedSeconds % 100,
		speed: 20 + (elapsedSeconds % 15),
	};
}

function testPower(index: number): number {
	if (index === 728) {
		return 1200;
	}
	if (index === 729) {
		return 0;
	}
	return 180;
}

describe('session chart sampling', () => {
	test('keeps every metric extrema while bounding a long session', () => {
		const history = Array.from({ length: 3555 }, (_, index) =>
			sampleAt(index + 1, testPower(index))
		);
		const sampled = sampleSessionChartHistory(history);

		expect(sampled.length).toBeLessThanOrEqual(MAXIMUM_RENDERED_CHART_SAMPLES);
		expect(sampled[0]).toEqual(history[0]);
		expect(sampled.at(-1)).toEqual(history.at(-1));
		expect(Math.max(...sampled.map((sample) => sample.power))).toBe(1200);
		expect(Math.min(...sampled.map((sample) => sample.power))).toBe(0);
		expect(Math.max(...sampled.map((sample) => sample.cadence))).toBe(
			Math.max(...history.map((sample) => sample.cadence))
		);
		expect(Math.min(...sampled.map((sample) => sample.grade ?? 0))).toBe(
			Math.min(...history.map((sample) => sample.grade ?? 0))
		);
	});

	test('does not rewrite completed chart buckets as live samples arrive', () => {
		const history = Array.from({ length: 3600 }, (_, index) => sampleAt(index + 1));
		const nextHistory = [...history, sampleAt(3601, 950)];
		const before = sampleSessionChartHistory(history);
		const after = sampleSessionChartHistory(nextHistory);
		const activeBucketStart = 3585;

		expect(
			after
				.filter((sample) => sample.elapsedSeconds < activeBucketStart)
				.map((sample) => sample.elapsedSeconds)
		).toEqual(
			before
				.filter((sample) => sample.elapsedSeconds < activeBucketStart)
				.map((sample) => sample.elapsedSeconds)
		);
		expect(Math.max(...after.map((sample) => sample.power))).toBe(
			Math.max(...before.map((sample) => sample.power))
		);
		expect(after.at(-1)?.elapsedSeconds).toBe(3601);
	});
});
