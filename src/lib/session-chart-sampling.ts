import type { MetricSample } from '../types';

export const MAXIMUM_RENDERED_CHART_SAMPLES = 2000;

const CHART_SAMPLE_FIELDS = [
	'speed',
	'power',
	'cadence',
	'heartRate',
	'gear',
	'resistance',
	'grade',
	'elevation',
] as const satisfies readonly (keyof MetricSample)[];
const MAXIMUM_POINTS_PER_BUCKET = 2 + CHART_SAMPLE_FIELDS.length * 2;

type ChartSampleField = (typeof CHART_SAMPLE_FIELDS)[number];

interface NumericExtrema {
	maximumIndex: number;
	maximumValue: number;
	minimumIndex: number;
	minimumValue: number;
}

function nextPowerOfTwo(value: number): number {
	return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

function chartSampleBucketSize(length: number): number {
	if (length <= MAXIMUM_RENDERED_CHART_SAMPLES) {
		return 1;
	}
	let bucketSize = nextPowerOfTwo(
		Math.ceil((length * MAXIMUM_POINTS_PER_BUCKET) / MAXIMUM_RENDERED_CHART_SAMPLES)
	);
	while (
		Math.ceil(length / bucketSize) * MAXIMUM_POINTS_PER_BUCKET >
		MAXIMUM_RENDERED_CHART_SAMPLES
	) {
		bucketSize *= 2;
	}
	return bucketSize;
}

function updateExtrema(
	extrema: Map<ChartSampleField, NumericExtrema>,
	field: ChartSampleField,
	index: number,
	value: number
): void {
	const current = extrema.get(field);
	if (!current) {
		extrema.set(field, {
			maximumIndex: index,
			maximumValue: value,
			minimumIndex: index,
			minimumValue: value,
		});
		return;
	}
	if (value < current.minimumValue) {
		current.minimumIndex = index;
		current.minimumValue = value;
	}
	if (value > current.maximumValue) {
		current.maximumIndex = index;
		current.maximumValue = value;
	}
}

function bucketSampleIndices(
	history: readonly MetricSample[],
	bucketStart: number,
	bucketEnd: number
): number[] {
	const selectedIndices = new Set<number>([bucketStart, bucketEnd - 1]);
	const extrema = new Map<ChartSampleField, NumericExtrema>();
	for (let index = bucketStart; index < bucketEnd; index += 1) {
		const sample = history[index];
		if (!sample) {
			continue;
		}
		for (const field of CHART_SAMPLE_FIELDS) {
			const value = sample[field];
			if (value !== undefined) {
				updateExtrema(extrema, field, index, value);
			}
		}
	}
	for (const { maximumIndex, minimumIndex } of extrema.values()) {
		selectedIndices.add(minimumIndex);
		selectedIndices.add(maximumIndex);
	}
	return [...selectedIndices].sort((left, right) => left - right);
}

/**
 * Produces a bounded first/min/max/last envelope for a streaming session.
 *
 * Fixed power-of-two buckets keep every completed bucket immutable as a live
 * session grows. That gives the chart stable path geometry while retaining the
 * extrema that determine each metric's useful scale.
 */
export function sampleSessionChartHistory(history: readonly MetricSample[]): MetricSample[] {
	if (history.length <= MAXIMUM_RENDERED_CHART_SAMPLES) {
		return [...history];
	}
	const bucketSize = chartSampleBucketSize(history.length);
	const sampled: MetricSample[] = [];
	for (let bucketStart = 0; bucketStart < history.length; bucketStart += bucketSize) {
		const bucketEnd = Math.min(history.length, bucketStart + bucketSize);
		for (const index of bucketSampleIndices(history, bucketStart, bucketEnd)) {
			const sample = history[index];
			if (sample) {
				sampled.push(sample);
			}
		}
	}
	return sampled;
}
