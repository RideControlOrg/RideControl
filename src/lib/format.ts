import type { MetricAggregate } from '../types';

export function formatDuration(totalSeconds: number) {
	const seconds = Math.floor(totalSeconds);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return [hours, minutes, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

export function formatChartSeconds(totalSeconds: number) {
	const seconds = Math.max(0, Math.round(totalSeconds));
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatAggregateAverage(aggregate: MetricAggregate, decimals: number) {
	const average = aggregate.count > 0 ? aggregate.sum / aggregate.count : 0;
	return average.toFixed(decimals);
}
