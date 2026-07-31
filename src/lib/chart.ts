import { CHART_MODE, type ChartMode, isPersistedChartMode } from './chart-mode';
import { MAX_RESISTANCE } from './resistance';

export const CHART_MODE_STORAGE_KEY = 'trainer-chart-mode';
export const CHART_PLOT_MIDDLE = 50;
const RESISTANCE_CHART_INITIAL_MAXIMUM = 50;
const RESISTANCE_CHART_EXPANSION_THRESHOLD = 0.9;
const RESISTANCE_CHART_STEP = 10;

export function sessionChartInspectionEnabled({
	elapsedSeconds,
	ended,
	isRiding,
}: {
	elapsedSeconds: number;
	ended: boolean;
	isRiding: boolean;
}): boolean {
	return ended || (elapsedSeconds > 0 && !isRiding);
}

export function storedChartMode(storage: Pick<Storage, 'getItem'> = localStorage): ChartMode {
	const saved = storage.getItem(CHART_MODE_STORAGE_KEY);
	return isPersistedChartMode(saved) ? saved : CHART_MODE.ALL;
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
