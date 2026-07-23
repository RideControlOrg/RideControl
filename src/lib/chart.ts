import { CHART_MODE, type ChartMode, isPersistedChartMode } from './chart-mode';
import { clamp } from './numbers';
import { MAX_RESISTANCE } from './resistance';
import { isFiniteNumber } from './type-guards';

export const CHART_MODE_STORAGE_KEY = 'trainer-chart-mode';
const RESISTANCE_CHART_INITIAL_MAXIMUM = 50;
const RESISTANCE_CHART_EXPANSION_THRESHOLD = 0.9;
const RESISTANCE_CHART_STEP = 10;

export function storedChartMode(storage: Pick<Storage, 'getItem'> = localStorage): ChartMode {
	const saved = storage.getItem(CHART_MODE_STORAGE_KEY);
	return isPersistedChartMode(saved) ? saved : CHART_MODE.ALL;
}

export function chartPath(
	values: (number | undefined)[],
	minimum: number,
	maximum: number,
	positions?: number[]
): string {
	if (values.length === 0) {
		return '';
	}
	const span = maximum - minimum || 1;
	const firstPosition = positions?.[0] ?? 0;
	const positionSpan = (positions?.at(-1) ?? 0) - firstPosition;
	let drawing = false;
	return values
		.map((value, index) => {
			if (!isFiniteNumber(value)) {
				drawing = false;
				return '';
			}
			let x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
			if (positions && positionSpan > 0) {
				x = (((positions[index] ?? firstPosition) - firstPosition) / positionSpan) * 100;
			}
			const normalized = clamp((value - minimum) / span, 0, 1);
			const y = 90 - normalized * 76;
			const command = drawing ? 'L' : 'M';
			drawing = true;
			return `${command} ${x} ${y}`;
		})
		.filter(Boolean)
		.join(' ');
}

export function roundedChartMaximum(value: number, minimum: number, step: number) {
	return Math.max(minimum, Math.ceil(value / step) * step);
}

export function resistanceChartMaximum(value: number): number {
	if (value < RESISTANCE_CHART_INITIAL_MAXIMUM * RESISTANCE_CHART_EXPANSION_THRESHOLD) {
		return RESISTANCE_CHART_INITIAL_MAXIMUM;
	}
	return Math.min(
		MAX_RESISTANCE,
		roundedChartMaximum(value, RESISTANCE_CHART_INITIAL_MAXIMUM, RESISTANCE_CHART_STEP) +
			RESISTANCE_CHART_STEP
	);
}
