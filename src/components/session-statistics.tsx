import { useMemo, useState } from 'react';
import type { RiderWeightEntry } from '../lib/profile';
import {
	SESSION_ANALYTICS_PEAK,
	SESSION_ANALYTICS_PERIOD,
	SESSION_TREND_METRIC,
	type SessionAnalyticsCache,
	type SessionAnalyticsPeriod,
	type SessionAnalyticsRollup,
	type SessionTrendMetric,
	sessionAnalyticsAverageSpeed,
	sessionAnalyticsCompleteTrendRollups,
	sessionAnalyticsMetricAverage,
	sessionAnalyticsPeriodLabel,
	sessionAnalyticsTrendRollups,
} from '../lib/session-analytics';
import {
	loadSessionTrendMetric,
	loadSessionTrendRange,
	SESSION_TREND_METRIC_SELECTION,
	SESSION_TREND_RANGE,
	type SessionTrendMetricSelection,
	type SessionTrendRange,
	saveSessionTrendMetric,
	saveSessionTrendRange,
} from '../lib/session-history-preferences';
import {
	convertDistance,
	convertElevation,
	convertSpeed,
	distanceUnitLabel,
	elevationUnitLabel,
	speedUnitLabel,
} from '../lib/units';
import type { SpeedUnit } from '../types';
import { InteractiveBarChart, type InteractiveBarDatum } from './interactive-chart';
import { RiderWeightChart } from './rider-weight-chart';
import { SelectMenu } from './select-menu';

const NUMBER_FORMATTER = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
});
const INTEGER_FORMATTER = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 0,
});
const PERIOD_OPTIONS: { label: string; value: SessionAnalyticsPeriod }[] = [
	{ label: 'Week', value: SESSION_TREND_RANGE.WEEK },
	{ label: 'Month', value: SESSION_TREND_RANGE.MONTH },
	{ label: 'Year', value: SESSION_TREND_RANGE.YEAR },
];
const TREND_RANGE_OPTIONS: { label: string; value: SessionTrendRange }[] = [
	...PERIOD_OPTIONS,
	{ label: 'All', value: SESSION_TREND_RANGE.ALL },
];
const ANALYTICS_CHART_VARIANTS = {
	detail: {
		className: 'h-36 border-slate-700/70 border-b',
		height: 144,
	},
	overview: {
		className: 'h-10 min-w-0 border-slate-800 border-b',
		height: 40,
	},
} as const;

interface ChartDatum {
	key: string;
	label: string;
	rollup: SessionAnalyticsRollup;
}

interface AnalyticsSeriesDefinition {
	color: string;
	formatValue: (value: number) => string;
	unit: string;
	value: (rollup: SessionAnalyticsRollup) => number;
}

interface AnalyticsChartProps extends AnalyticsSeriesDefinition {
	data: ChartDatum[];
	period: SessionAnalyticsPeriod;
	title: string;
}

interface TrendMetricDefinition extends AnalyticsSeriesDefinition {
	key: SessionTrendMetric;
	label: string;
}

interface AnalyticsChartSeries {
	activePeriods: number;
	latestValue: number;
	maximum: number;
	rows: InteractiveBarDatum[];
}

function analyticsDuration(seconds: number): string {
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) {
		return `${days}d ${hours}h`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

function StatisticsCard({ label, unit, value }: { label: string; unit?: string; value: string }) {
	return (
		<div className="minimal-stat-card min-w-0 py-3">
			<p className="font-bold text-[10px] text-slate-500 uppercase tracking-[.12em]">
				{label}
			</p>
			<p className="mt-1.5 flex min-w-0 flex-nowrap items-baseline gap-x-1.5 font-bold text-4xl text-white leading-none sm:text-5xl">
				<span className="whitespace-nowrap">{value}</span>
				{unit ? (
					<span className="font-semibold text-slate-400 text-sm sm:text-base">
						{unit}
					</span>
				) : null}
			</p>
		</div>
	);
}

function activePeriodLabel(count: number, period: SessionAnalyticsPeriod): string {
	const noun = count === 1 ? period : `${period}s`;
	return `${INTEGER_FORMATTER.format(count)} active ${noun}`;
}

function analyticsChartSeries(
	data: readonly ChartDatum[],
	definition: AnalyticsSeriesDefinition
): AnalyticsChartSeries {
	const values = data.map((item) => definition.value(item.rollup));
	return {
		activePeriods: values.filter((value) => value > 0).length,
		latestValue: values.at(-1) ?? 0,
		maximum: Math.max(...values, 0),
		rows: data.map((item, index) => {
			const value = values[index] ?? 0;
			return {
				key: item.key,
				label: `${item.label}: ${definition.formatValue(value)}${
					definition.unit ? ` ${definition.unit}` : ''
				}`,
				value,
			};
		}),
	};
}

function AnalyticsBarPlot({
	ariaLabel,
	color,
	maximum,
	rows,
	variant,
}: {
	ariaLabel: string;
	color: string;
	maximum: number;
	rows: readonly InteractiveBarDatum[];
	variant: 'detail' | 'overview';
}) {
	const configuration = ANALYTICS_CHART_VARIANTS[variant];
	return (
		<div className={configuration.className} data-analytics-chart={variant}>
			<InteractiveBarChart
				ariaLabel={ariaLabel}
				background="transparent"
				color={color}
				height={configuration.height}
				maximum={maximum}
				rows={rows}
			/>
		</div>
	);
}

function AnalyticsPeriodLabels({ data }: { data: readonly ChartDatum[] }) {
	const labelEvery = Math.max(1, Math.ceil(data.length / 6));
	return (
		<div aria-hidden="true" className="mt-1 flex min-w-0 gap-1">
			{data.map((item, index) => {
				const visible = index % labelEvery === 0 || index === data.length - 1;
				return (
					<span
						className={`block min-w-0 flex-1 truncate text-center text-[8px] ${
							visible ? 'text-slate-500' : 'text-transparent'
						}`}
						key={item.key}
					>
						{item.label}
					</span>
				);
			})}
		</div>
	);
}

function AnalyticsTrendChart({
	color,
	data,
	formatValue,
	period,
	title,
	unit,
	value,
}: AnalyticsChartProps) {
	const series = analyticsChartSeries(data, { color, formatValue, unit, value });
	const latest = data.at(-1);
	return (
		<section className="minimal-chart-panel min-w-0 py-3">
			<div className="flex items-start justify-between gap-6">
				<div className="min-w-0">
					<h4 className="font-bold text-base">{title}</h4>
					<p className="wrap-anywhere mt-2 font-bold text-3xl text-white tabular-nums">
						{formatValue(series.latestValue)}
						{unit ? (
							<span className="ml-1.5 font-semibold text-slate-400 text-sm">
								{unit}
							</span>
						) : null}
					</p>
					<p className="mt-0.5 text-slate-500 text-xs">{latest?.label}</p>
				</div>
				<div className="shrink-0 text-right">
					<p className="text-slate-500 text-xs">Best period</p>
					<p className="mt-1 font-bold text-slate-200 tabular-nums">
						{formatValue(series.maximum)}
						{unit ? ` ${unit}` : ''}
					</p>
				</div>
			</div>
			<div className="mt-5 min-w-0">
				<AnalyticsBarPlot
					ariaLabel={`${title} by selected period`}
					color={color}
					maximum={series.maximum}
					rows={series.rows}
					variant="detail"
				/>
				<AnalyticsPeriodLabels data={data} />
			</div>
			{data.length > 0 ? (
				<div className="mt-2 flex items-center justify-between gap-3 border-line border-t pt-2 text-[10px]">
					<span className="truncate text-slate-500">
						{data[0]?.label} – {data.at(-1)?.label}
					</span>
					<span className="shrink-0 text-slate-400">
						{activePeriodLabel(series.activePeriods, period)}
					</span>
				</div>
			) : null}
		</section>
	);
}

function AnalyticsTrendOverviewRow({
	data,
	metric,
}: {
	data: readonly ChartDatum[];
	metric: TrendMetricDefinition;
}) {
	const series = analyticsChartSeries(data, metric);
	return (
		<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_8rem] items-center gap-4 border-line border-b py-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
			<div className="min-w-0">
				<p className="flex items-center gap-2 font-semibold text-slate-400 text-xs">
					<span
						aria-hidden="true"
						className="size-2 shrink-0 rounded-full"
						style={{ backgroundColor: metric.color }}
					/>
					{metric.label}
				</p>
				<p className="wrap-anywhere mt-1 font-bold text-2xl text-white tabular-nums leading-none">
					{metric.formatValue(series.latestValue)}
					{metric.unit ? (
						<span className="ml-1 font-semibold text-slate-500 text-xs">
							{metric.unit}
						</span>
					) : null}
				</p>
			</div>
			<AnalyticsBarPlot
				ariaLabel={`${metric.label} trend`}
				color={metric.color}
				maximum={series.maximum}
				rows={series.rows}
				variant="overview"
			/>
		</div>
	);
}

function AnalyticsTrendOverview({
	data,
	metrics,
}: {
	data: ChartDatum[];
	metrics: TrendMetricDefinition[];
}) {
	return (
		<section className="minimal-chart-panel min-w-0 py-3" data-testid="trend-overview">
			<div className="flex items-center justify-between gap-4">
				<h4 className="font-bold text-base">All trends</h4>
				<span className="text-slate-500 text-xs">{metrics.length} metrics</span>
			</div>
			<div className="statistics-trend-overview-grid mt-3 grid min-w-0 gap-x-8">
				{metrics.map((metric) => (
					<AnalyticsTrendOverviewRow data={data} key={metric.key} metric={metric} />
				))}
			</div>
		</section>
	);
}

function trendMetricDefinitions(speedUnit: SpeedUnit): TrendMetricDefinition[] {
	return [
		{
			color: 'var(--metric-distance)',
			formatValue: (value) => NUMBER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.DISTANCE,
			label: 'Distance',
			unit: distanceUnitLabel(speedUnit),
			value: (rollup) => convertDistance(rollup.distance, speedUnit),
		},
		{
			color: 'var(--metric-cadence)',
			formatValue: (value) => NUMBER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.RIDE_TIME,
			label: 'Ride time',
			unit: 'hours',
			value: (rollup) => rollup.elapsedSeconds / 3600,
		},
		{
			color: 'var(--metric-gear)',
			formatValue: (value) => INTEGER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.CLIMBING,
			label: 'Climbing',
			unit: elevationUnitLabel(speedUnit),
			value: (rollup) => convertElevation(rollup.ascent, speedUnit),
		},
		{
			color: 'var(--metric-downhill)',
			formatValue: (value) => INTEGER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.DOWNHILL,
			label: 'Downhill',
			unit: elevationUnitLabel(speedUnit),
			value: (rollup) => convertElevation(rollup.descent, speedUnit),
		},
		{
			color: 'var(--metric-elevation)',
			formatValue: (value) => INTEGER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.CALORIES,
			label: 'Calories',
			unit: 'kcal',
			value: (rollup) => rollup.calories,
		},
		{
			color: 'var(--metric-rides)',
			formatValue: (value) => INTEGER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.RIDES,
			label: 'Rides',
			unit: '',
			value: (rollup) => rollup.sessionCount,
		},
		{
			color: 'var(--metric-speed)',
			formatValue: (value) => NUMBER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.AVERAGE_SPEED,
			label: 'Average speed',
			unit: speedUnitLabel(speedUnit),
			value: (rollup) => convertSpeed(sessionAnalyticsAverageSpeed(rollup), speedUnit),
		},
		{
			color: 'var(--metric-power)',
			formatValue: (value) => INTEGER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.AVERAGE_POWER,
			label: 'Average power',
			unit: 'W',
			value: (rollup) => sessionAnalyticsMetricAverage(rollup.power),
		},
		{
			color: 'var(--metric-cadence)',
			formatValue: (value) => INTEGER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.AVERAGE_CADENCE,
			label: 'Average cadence',
			unit: 'rpm',
			value: (rollup) => sessionAnalyticsMetricAverage(rollup.cadence),
		},
		{
			color: 'var(--metric-heart-rate)',
			formatValue: (value) => INTEGER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.AVERAGE_HEART_RATE,
			label: 'Average heart rate',
			unit: 'bpm',
			value: (rollup) => sessionAnalyticsMetricAverage(rollup.heartRate),
		},
		{
			color: 'var(--metric-gear)',
			formatValue: (value) => NUMBER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.AVERAGE_GEAR,
			label: 'Average gear',
			unit: '',
			value: (rollup) => sessionAnalyticsMetricAverage(rollup.gear),
		},
		{
			color: 'var(--metric-resistance)',
			formatValue: (value) => NUMBER_FORMATTER.format(value),
			key: SESSION_TREND_METRIC.AVERAGE_RESISTANCE,
			label: 'Average resistance',
			unit: '%',
			value: (rollup) => sessionAnalyticsMetricAverage(rollup.resistance),
		},
	];
}

function selectedTrendMetric(
	definitions: TrendMetricDefinition[],
	key: SessionTrendMetric
): TrendMetricDefinition {
	const definition = definitions.find((candidate) => candidate.key === key);
	if (!definition) {
		throw new Error('Unsupported session trend metric.');
	}
	return definition;
}

function PeakCard({
	label,
	onSelect,
	value,
}: {
	label: string;
	onSelect?: () => void;
	value: string;
}) {
	const className = 'minimal-peak-card min-w-0 py-2.5 text-left transition';
	if (!onSelect) {
		return (
			<div className={className}>
				<p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
				<p className="wrap-anywhere mt-2 font-bold text-xl leading-none sm:text-2xl">
					{value}
				</p>
			</div>
		);
	}
	return (
		<button
			className={`${className} hover:text-cyan-300`}
			onClick={onSelect}
			title="Open this session"
			type="button"
		>
			<p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
			<p className="wrap-anywhere mt-2 font-bold text-xl leading-none sm:text-2xl">{value}</p>
		</button>
	);
}

export function SessionStatistics({
	analytics,
	error,
	initialTrendMetric,
	initialTrendRange,
	loading,
	onSelectSession,
	speedUnit,
	trendEndTimestamp,
	weightHistory = [],
}: {
	analytics: SessionAnalyticsCache;
	error: string;
	initialTrendMetric?: SessionTrendMetricSelection;
	initialTrendRange?: SessionTrendRange;
	loading: boolean;
	onSelectSession: (id: string) => void;
	speedUnit: SpeedUnit;
	trendEndTimestamp?: number;
	weightHistory?: readonly RiderWeightEntry[];
}) {
	const [trendRange, setTrendRange] = useState<SessionTrendRange>(
		() => initialTrendRange ?? loadSessionTrendRange()
	);
	const [trendMetricKey, setTrendMetricKey] = useState<SessionTrendMetricSelection>(
		() => initialTrendMetric ?? loadSessionTrendMetric()
	);
	const [trendEnd] = useState(() => trendEndTimestamp ?? Date.now());
	const trendMetrics = useMemo(() => trendMetricDefinitions(speedUnit), [speedUnit]);
	const trendMetricOptions = useMemo(
		() => [
			{ label: 'All', value: SESSION_TREND_METRIC_SELECTION.ALL },
			...trendMetrics.map((definition) => ({
				label: definition.label,
				value: definition.key,
			})),
		],
		[trendMetrics]
	);
	const activeTrendMetric =
		trendMetricKey === SESSION_TREND_METRIC_SELECTION.ALL
			? undefined
			: selectedTrendMetric(trendMetrics, trendMetricKey);
	const chartPeriod =
		trendRange === SESSION_TREND_RANGE.ALL ? SESSION_ANALYTICS_PERIOD.YEAR : trendRange;
	const chartData = useMemo<ChartDatum[]>(
		() =>
			(trendRange === SESSION_TREND_RANGE.ALL
				? sessionAnalyticsCompleteTrendRollups(analytics)
				: sessionAnalyticsTrendRollups(analytics, trendRange, trendEnd)
			).map(([key, rollup]) => ({
				key,
				label: sessionAnalyticsPeriodLabel(key, chartPeriod),
				rollup,
			})),
		[analytics, chartPeriod, trendEnd, trendRange]
	);
	const { totals } = analytics;
	const averagePower = sessionAnalyticsMetricAverage(totals.power);
	const averageCadence = sessionAnalyticsMetricAverage(totals.cadence);
	const averageGear = sessionAnalyticsMetricAverage(totals.gear);
	const averageHeartRate = sessionAnalyticsMetricAverage(totals.heartRate);
	const averageResistance = sessionAnalyticsMetricAverage(totals.resistance);
	const averageRideDistance = totals.sessionCount > 0 ? totals.distance / totals.sessionCount : 0;
	const averageRideDuration =
		totals.sessionCount > 0 ? totals.elapsedSeconds / totals.sessionCount : 0;
	const peakDefinitions = [
		{
			key: SESSION_ANALYTICS_PEAK.DISTANCE,
			label: 'Longest distance',
			value: (value: number) =>
				`${NUMBER_FORMATTER.format(convertDistance(value, speedUnit))} ${distanceUnitLabel(speedUnit)}`,
		},
		{
			key: SESSION_ANALYTICS_PEAK.DURATION,
			label: 'Longest time',
			value: analyticsDuration,
		},
		{
			key: SESSION_ANALYTICS_PEAK.CLIMB,
			label: 'Most climbing',
			value: (value: number) =>
				`${INTEGER_FORMATTER.format(convertElevation(value, speedUnit))} ${elevationUnitLabel(speedUnit)}`,
		},
		{
			key: SESSION_ANALYTICS_PEAK.DESCENT,
			label: 'Most downhill',
			value: (value: number) =>
				`${INTEGER_FORMATTER.format(convertElevation(value, speedUnit))} ${elevationUnitLabel(speedUnit)}`,
		},
		{
			key: SESSION_ANALYTICS_PEAK.CALORIES,
			label: 'Most calories',
			value: (value: number) => `${INTEGER_FORMATTER.format(value)} kcal`,
		},
		{
			key: SESSION_ANALYTICS_PEAK.SPEED,
			label: 'Top speed',
			value: (value: number) =>
				`${NUMBER_FORMATTER.format(convertSpeed(value, speedUnit))} ${speedUnitLabel(speedUnit)}`,
		},
		{
			key: SESSION_ANALYTICS_PEAK.POWER,
			label: 'Peak power',
			value: (value: number) => `${INTEGER_FORMATTER.format(value)} W`,
		},
		{
			key: SESSION_ANALYTICS_PEAK.CADENCE,
			label: 'Peak cadence',
			value: (value: number) => `${INTEGER_FORMATTER.format(value)} rpm`,
		},
		{
			key: SESSION_ANALYTICS_PEAK.HEART_RATE,
			label: 'Peak heart rate',
			value: (value: number) => `${INTEGER_FORMATTER.format(value)} bpm`,
		},
	];

	if (totals.sessionCount === 0 && !loading) {
		return (
			<div className="grid min-h-64 flex-1 place-items-center p-6 text-center">
				<div>
					<p className="font-bold text-lg">No ride statistics yet</p>
					<p className="mt-1 text-slate-500 text-sm">
						Complete or import a session to start building your history.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className="session-statistics min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-6"
			data-testid="session-statistics"
		>
			<div className="session-statistics-content mx-auto w-full max-w-5xl">
				{error ? (
					<p className="mb-4 rounded-lg bg-rose-400/10 p-3 text-rose-300 text-sm">
						{error}
					</p>
				) : null}
				<section data-testid="all-time-totals">
					<div className="flex items-center justify-between gap-3">
						<h3 className="font-bold text-xl">All-time totals</h3>
						{loading ? <span className="text-cyan-300 text-xs">Updating…</span> : null}
					</div>
					<div className="minimal-stat-grid mt-2 grid gap-x-8 gap-y-1">
						<StatisticsCard
							label="Rides"
							value={INTEGER_FORMATTER.format(totals.sessionCount)}
						/>
						<StatisticsCard
							label="Distance"
							unit={distanceUnitLabel(speedUnit)}
							value={NUMBER_FORMATTER.format(
								convertDistance(totals.distance, speedUnit)
							)}
						/>
						<StatisticsCard
							label="Ride time"
							value={analyticsDuration(totals.elapsedSeconds)}
						/>
						<StatisticsCard
							label="Climbed"
							unit={elevationUnitLabel(speedUnit)}
							value={INTEGER_FORMATTER.format(
								convertElevation(totals.ascent, speedUnit)
							)}
						/>
						<StatisticsCard
							label="Downhill"
							unit={elevationUnitLabel(speedUnit)}
							value={INTEGER_FORMATTER.format(
								convertElevation(totals.descent, speedUnit)
							)}
						/>
						<StatisticsCard
							label="Calories"
							unit="kcal"
							value={INTEGER_FORMATTER.format(totals.calories)}
						/>
						<StatisticsCard
							label="Average speed"
							unit={speedUnitLabel(speedUnit)}
							value={NUMBER_FORMATTER.format(
								convertSpeed(sessionAnalyticsAverageSpeed(totals), speedUnit)
							)}
						/>
						<StatisticsCard
							label="Average power"
							unit="W"
							value={INTEGER_FORMATTER.format(averagePower)}
						/>
						<StatisticsCard
							label="Average cadence"
							unit="rpm"
							value={INTEGER_FORMATTER.format(averageCadence)}
						/>
						<StatisticsCard
							label="Average heart rate"
							unit="bpm"
							value={INTEGER_FORMATTER.format(averageHeartRate)}
						/>
						<StatisticsCard
							label="Average gear"
							value={
								totals.gear.count > 0 ? NUMBER_FORMATTER.format(averageGear) : '—'
							}
						/>
						<StatisticsCard
							label="Average resistance"
							unit="%"
							value={
								totals.resistance.count > 0
									? NUMBER_FORMATTER.format(averageResistance)
									: '—'
							}
						/>
						<StatisticsCard
							label="Average ride"
							unit={distanceUnitLabel(speedUnit)}
							value={NUMBER_FORMATTER.format(
								convertDistance(averageRideDistance, speedUnit)
							)}
						/>
						<StatisticsCard
							label="Average duration"
							value={analyticsDuration(averageRideDuration)}
						/>
						<StatisticsCard
							label="Active days"
							value={INTEGER_FORMATTER.format(
								Object.keys(analytics.periods.days).length
							)}
						/>
						<StatisticsCard
							label="Active weeks"
							value={INTEGER_FORMATTER.format(
								Object.keys(analytics.periods.weeks).length
							)}
						/>
						<StatisticsCard
							label="Active months"
							value={INTEGER_FORMATTER.format(
								Object.keys(analytics.periods.months).length
							)}
						/>
						<StatisticsCard
							label="Active years"
							value={INTEGER_FORMATTER.format(
								Object.keys(analytics.periods.years).length
							)}
						/>
					</div>
				</section>
				<section className="mt-6" data-testid="personal-bests">
					<h3 className="font-bold text-xl">Personal bests</h3>
					<div className="minimal-peak-grid mt-2 grid gap-x-8 gap-y-1">
						{peakDefinitions.map((definition) => {
							const peak = analytics.peaks[definition.key];
							return (
								<PeakCard
									key={definition.key}
									label={definition.label}
									onSelect={
										peak ? () => onSelectSession(peak.sessionId) : undefined
									}
									value={definition.value(peak?.value ?? 0)}
								/>
							);
						})}
					</div>
				</section>
				<section className="mt-6">
					<h3 className="font-bold text-xl">Weight over time</h3>
					{weightHistory.length > 0 ? (
						<RiderWeightChart entries={weightHistory} speedUnit={speedUnit} />
					) : (
						<p className="mt-3 text-slate-500 text-sm">
							Save your weight in Profile to begin tracking it here.
						</p>
					)}
				</section>
				<div className="mt-6 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h3 className="font-bold text-xl">Trends</h3>
						<p className="mt-1 text-slate-500 text-xs">
							{trendRange === SESSION_TREND_RANGE.ALL
								? 'Complete ride history'
								: `The latest ${
										trendRange === SESSION_ANALYTICS_PERIOD.YEAR
											? '10 years'
											: `12 ${trendRange}s`
									}`}
						</p>
					</div>
					<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
						<SelectMenu
							ariaLabel="Trend metric"
							onChange={(selectedMetric) => {
								setTrendMetricKey(selectedMetric);
								saveSessionTrendMetric(selectedMetric);
							}}
							options={trendMetricOptions}
							value={trendMetricKey}
						/>
						<div className="isolate inline-flex h-10 rounded-lg border border-line p-1">
							{TREND_RANGE_OPTIONS.map((option) => (
								<button
									aria-pressed={trendRange === option.value}
									className={`rounded-md px-3 py-1.5 font-semibold text-xs transition ${
										trendRange === option.value
											? 'bg-slate-700 text-white'
											: 'text-slate-400 hover:text-white'
									}`}
									key={option.value}
									onClick={() => {
										setTrendRange(option.value);
										saveSessionTrendRange(option.value);
									}}
									type="button"
								>
									{option.label}
								</button>
							))}
						</div>
					</div>
				</div>
				<div className="mt-4 min-w-0">
					{activeTrendMetric ? (
						<AnalyticsTrendChart
							color={activeTrendMetric.color}
							data={chartData}
							formatValue={activeTrendMetric.formatValue}
							period={chartPeriod}
							title={activeTrendMetric.label}
							unit={activeTrendMetric.unit}
							value={activeTrendMetric.value}
						/>
					) : (
						<AnalyticsTrendOverview data={chartData} metrics={trendMetrics} />
					)}
				</div>
			</div>
		</div>
	);
}
