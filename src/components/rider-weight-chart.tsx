import { useMemo } from 'react';
import { poundsForKilograms, type RiderWeightEntry } from '../lib/profile';
import { profileWeightUnit } from '../lib/profile-form';
import type { SpeedUnit } from '../types';
import { InteractiveLineChart, type InteractiveLineDatum } from './interactive-chart';

const WEIGHT_FORMATTER = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
	minimumFractionDigits: 1,
});
const WEIGHT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
});
const WEIGHT_CHART_VARIANTS = {
	compact: { className: 'h-28', height: 112 },
	full: { className: 'h-44', height: 176 },
} as const;
interface WeightChartDatum extends InteractiveLineDatum {
	date: string;
	recordedAt: number;
	value: number;
}

function displayedWeight(weightKg: number, speedUnit: SpeedUnit): number {
	return speedUnit === 'mph' ? poundsForKilograms(weightKg) : weightKg;
}

function weightChartData(
	entries: readonly RiderWeightEntry[],
	speedUnit: SpeedUnit
): { maximum: number; minimum: number; rows: WeightChartDatum[] } | undefined {
	const sorted = [...entries].sort((left, right) => left.recordedAt - right.recordedAt);
	if (sorted.length === 0) {
		return;
	}
	const values = sorted.map((entry) => displayedWeight(entry.weightKg, speedUnit));
	const minimumValue = Math.min(...values);
	const maximumValue = Math.max(...values);
	const valueRange = maximumValue - minimumValue;
	const padding = Math.max(0.5, valueRange * 0.2);
	const rows = sorted.map((entry, index) => {
		const date = WEIGHT_DATE_FORMATTER.format(entry.recordedAt);
		const value = values[index] ?? 0;
		return {
			date,
			key: String(entry.recordedAt),
			label: `${date}: ${WEIGHT_FORMATTER.format(value)} ${profileWeightUnit(speedUnit)}`,
			recordedAt: entry.recordedAt,
			value,
			x: entry.recordedAt,
		};
	});
	return {
		maximum: maximumValue + padding,
		minimum: minimumValue - padding,
		rows,
	};
}

function formattedWeightChange(change: number): string {
	const normalizedChange = Math.abs(change) < 0.05 ? 0 : change;
	if (normalizedChange === 0) {
		return WEIGHT_FORMATTER.format(0);
	}
	return `${normalizedChange > 0 ? '+' : '−'}${WEIGHT_FORMATTER.format(
		Math.abs(normalizedChange)
	)}`;
}

export function RiderWeightChart({
	compact = false,
	entries,
	speedUnit,
}: {
	compact?: boolean;
	entries: readonly RiderWeightEntry[];
	speedUnit: SpeedUnit;
}) {
	const chartData = useMemo(() => weightChartData(entries, speedUnit), [entries, speedUnit]);
	if (!chartData) {
		return null;
	}
	const [first] = chartData.rows;
	const latest = chartData.rows.at(-1);
	if (!(first && latest)) {
		return null;
	}
	const unit = profileWeightUnit(speedUnit);
	const weightChange = latest.value - first.value;
	const chartVariant = compact ? WEIGHT_CHART_VARIANTS.compact : WEIGHT_CHART_VARIANTS.full;
	return (
		<figure
			aria-label={`Weight over time from ${first.date} to ${latest.date}`}
			className={`minimal-weight-chart min-w-0 overflow-hidden ${
				compact ? 'mt-2 py-3' : 'mt-2 py-4'
			}`}
			data-testid="rider-weight-chart"
			data-weight-chart-size={compact ? 'compact' : 'full'}
		>
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
				<div>
					<p className="font-bold text-[10px] text-slate-500 uppercase tracking-[0.16em]">
						Current
					</p>
					<p className="mt-1 font-bold text-3xl text-slate-100 leading-none">
						{WEIGHT_FORMATTER.format(latest.value)}{' '}
						<span className="font-normal text-slate-500 text-sm">{unit}</span>
					</p>
				</div>
				<div className="text-right">
					<p className="font-bold text-[10px] text-slate-500 uppercase tracking-[0.16em]">
						Change
					</p>
					<p className="mt-1 font-bold text-lg text-mint leading-none">
						{formattedWeightChange(weightChange)}{' '}
						<span className="font-normal text-slate-500 text-xs">{unit}</span>
					</p>
					<p className="mt-1 text-[10px] text-slate-600">since {first.date}</p>
				</div>
			</div>
			{chartData.rows.length > 1 ? (
				<div
					className={`relative mt-5 overflow-hidden ${chartVariant.className}`}
					data-weight-plot="true"
				>
					<InteractiveLineChart
						area
						ariaLabel={`Weight over time from ${first.date} to ${latest.date}`}
						background="transparent"
						color="var(--metric-gear)"
						height={chartVariant.height}
						maximum={chartData.maximum}
						minimum={chartData.minimum}
						rows={chartData.rows}
					/>
				</div>
			) : (
				<div className="mt-5 grid min-h-24 place-items-center px-4 text-center">
					<p className="whitespace-nowrap text-slate-500 text-sm">
						Save another weight to see your trend.
					</p>
				</div>
			)}
			<figcaption className="mt-3 flex items-center justify-between gap-3 text-[10px] text-slate-500">
				<time dateTime={new Date(first.recordedAt).toISOString()}>{first.date}</time>
				{latest.recordedAt === first.recordedAt ? (
					<span>1 measurement</span>
				) : (
					<>
						<span>{chartData.rows.length} measurements</span>
						<time dateTime={new Date(latest.recordedAt).toISOString()}>
							{latest.date}
						</time>
					</>
				)}
			</figcaption>
		</figure>
	);
}
