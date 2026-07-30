import { useSelector } from '@tanstack/react-store';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evenlySample, valueRange } from '../lib/arrays';
import { CHART_PLOT_MIDDLE, resistanceChartMaximum, roundedChartMaximum } from '../lib/chart';
import { CHART_MODE } from '../lib/chart-mode';
import { CONTROL_MODE } from '../lib/control-mode';
import { eventTargetsEditableControl, keyboardEventHasModifiers } from '../lib/dom';
import { formatChartSeconds } from '../lib/format';
import { MAX_GEAR, MIN_GEAR } from '../lib/gears';
import {
	ELEVATION_METRIC_PRESENTATION,
	GEAR_METRIC_PRESENTATION,
	GRADE_METRIC_PRESENTATION,
	METRIC_PRESENTATION,
	RESISTANCE_METRIC_PRESENTATION,
	STANDARD_METRIC_KEYS,
} from '../lib/metric-presentation';
import { MIN_RESISTANCE } from '../lib/resistance';
import {
	convertElevation,
	convertSpeed,
	elevationUnitLabel,
	minimumSpeedChartMaximum,
	speedUnitLabel,
} from '../lib/units';
import { preferencesStore } from '../stores/preferences-store';
import type { ChartMode, ControlMode, MetricSample, RoutePoint, SpeedUnit } from '../types';
import { InteractiveLineChart, type InteractiveLineDatum } from './interactive-chart';

const MAXIMUM_RENDERED_CHART_SAMPLES = 2000;

function chartControlsEdgeBackground(
	direction: 'left' | 'right',
	sessionControls: boolean
): string {
	const surface = sessionControls ? 'panel' : 'ink';
	return `linear-gradient(to ${direction}, var(--color-${surface}) 45%, transparent)`;
}

function maximumValue<T>(values: readonly T[], numericValue: (value: T) => number): number {
	return values.reduce((maximum, value) => Math.max(maximum, numericValue(value)), 0);
}

interface PlotProps {
	color: string;
	decimals: number;
	heightClass: string;
	interactive: boolean;
	label: string;
	maximum: number;
	minimum?: number;
	onFocusXChange?: (x: number | undefined) => void;
	positions: number[];
	showLabel?: boolean;
	synchronizedFocusX?: number;
	title: string;
	unit: string;
	values: (number | undefined)[];
}

function sessionChartRows({
	decimals,
	label,
	positions,
	unit,
	values,
}: Pick<PlotProps, 'decimals' | 'label' | 'positions' | 'unit' | 'values'>) {
	return values.map<InteractiveLineDatum>((value, index) => {
		const x = positions[index] ?? index;
		const formattedValue =
			value === undefined
				? 'No reading'
				: `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
		return {
			key: `${x}-${index}`,
			label: `${formatChartSeconds(x)} · ${label}: ${formattedValue}`,
			value,
			x,
		};
	});
}

function ChartScale({
	decimals,
	maximum,
	minimum,
	unit,
}: Pick<PlotProps, 'decimals' | 'maximum' | 'unit'> & { minimum: number }) {
	const labels = [maximum, (maximum + minimum) / 2, minimum];
	const positions = [12, CHART_PLOT_MIDDLE, 88];
	return (
		<div className="pointer-events-none relative h-full w-16 shrink-0 font-semibold text-[11px] text-slate-300 sm:w-20 sm:text-xs">
			{labels.map((scaleLabel, index) => (
				<span
					className="absolute right-2 -translate-y-1/2 whitespace-nowrap leading-none"
					key={scaleLabel}
					style={{ top: `${positions[index]}%` }}
				>
					{scaleLabel.toFixed(decimals)} {unit}
				</span>
			))}
		</div>
	);
}

export function ChartPlot({
	color,
	decimals,
	heightClass,
	interactive,
	label,
	maximum,
	minimum = 0,
	onFocusXChange,
	positions,
	synchronizedFocusX,
	showLabel = false,
	title,
	unit,
	values,
}: PlotProps) {
	const rows = useMemo(
		() => sessionChartRows({ decimals, label, positions, unit, values }),
		[decimals, label, positions, unit, values]
	);
	return (
		<div className={`flex w-full ${heightClass}`}>
			<ChartScale decimals={decimals} maximum={maximum} minimum={minimum} unit={unit} />
			<div className="relative h-full min-w-0 flex-1 overflow-hidden">
				{showLabel ? (
					<span
						className="pointer-events-none absolute top-[12%] right-2 z-10 -translate-y-1/2 font-semibold text-[10px] text-slate-300 leading-none sm:text-[11px]"
						data-chart-series-label="true"
					>
						{label}
					</span>
				) : null}
				<div className="h-full w-full" data-chart-surface="true">
					<InteractiveLineChart
						ariaLabel={title}
						color={color}
						focusedX={synchronizedFocusX}
						interactive={interactive}
						maximum={maximum}
						minimum={minimum}
						onFocusXChange={onFocusXChange}
						rows={rows}
					/>
				</div>
			</div>
		</div>
	);
}

export function SessionChart({
	controlMode,
	history,
	inspectionEnabled = true,
	keyboardEnabled = true,
	onSelectChartMode,
	onInspectSample,
	route,
	selectedChartMode,
	speedUnit,
	variant = 'dashboard',
}: {
	controlMode?: ControlMode;
	history: MetricSample[];
	inspectionEnabled?: boolean;
	keyboardEnabled?: boolean;
	onSelectChartMode?: (mode: ChartMode) => void;
	onInspectSample?: (sample: MetricSample | undefined) => void;
	route: readonly RoutePoint[];
	selectedChartMode?: ChartMode;
	speedUnit: SpeedUnit;
	variant?: 'dashboard' | 'session';
}) {
	const preferredChartMode = useSelector(
		preferencesStore,
		(preferences) => preferences.chartMode
	);
	const selectedMode = selectedChartMode ?? preferredChartMode;
	const [focusedElapsedSecond, setFocusedElapsedSecond] = useState<number>();
	const resolvedControlMode =
		controlMode ??
		(history.some((sample) => sample.gear !== undefined)
			? CONTROL_MODE.GEAR
			: CONTROL_MODE.RESISTANCE);
	const chartHistory = useMemo(
		() => evenlySample(history, MAXIMUM_RENDERED_CHART_SAMPLES),
		[history]
	);
	const series = useMemo(() => {
		const speedValues = chartHistory.map((sample) => convertSpeed(sample.speed, speedUnit));
		const routeElevations = route.map((point) => convertElevation(point.elevation, speedUnit));
		const recordedElevations = chartHistory.flatMap((sample) =>
			sample.elevation === undefined ? [] : [convertElevation(sample.elevation, speedUnit)]
		);
		const elevationRange = valueRange(
			[...routeElevations, ...recordedElevations],
			(elevation) => elevation
		);
		const gradeValues = chartHistory.map((sample) => sample.grade);
		const hasRecordedGear = history.some((sample) => sample.gear !== undefined);
		const standardSeries = STANDARD_METRIC_KEYS.map((key) => {
			const presentation = METRIC_PRESENTATION[key];
			const values = chartHistory.map((sample) => sample[key]);
			return {
				chartMaximum: roundedChartMaximum(
					maximumValue(values, (value) => value ?? 0),
					presentation.chartMinimumMaximum,
					presentation.chartStep
				),
				color: presentation.chartColor,
				decimals: 0,
				key,
				label: presentation.label,
				minimum: 0,
				unit: presentation.unit,
				values,
			};
		});
		const controlSeries = [
			...(resolvedControlMode === CONTROL_MODE.GEAR || hasRecordedGear
				? [
						{
							chartMaximum: MAX_GEAR,
							color: GEAR_METRIC_PRESENTATION.chartColor,
							decimals: 0,
							key: CONTROL_MODE.GEAR,
							label: GEAR_METRIC_PRESENTATION.label,
							minimum: MIN_GEAR,
							unit: '',
							values: chartHistory.map((sample) => sample.gear),
						},
					]
				: []),
			{
				chartMaximum: resistanceChartMaximum(
					maximumValue(
						chartHistory.map((sample) => sample.resistance),
						(resistance) => resistance ?? 0
					)
				),
				color: RESISTANCE_METRIC_PRESENTATION.chartColor,
				decimals: 0,
				key: CONTROL_MODE.RESISTANCE,
				label: RESISTANCE_METRIC_PRESENTATION.label,
				minimum: MIN_RESISTANCE,
				unit: RESISTANCE_METRIC_PRESENTATION.unit,
				values: chartHistory.map((sample) => sample.resistance),
			},
		];
		const maximumAbsoluteGrade = maximumValue(gradeValues, (grade) => Math.abs(grade ?? 0));
		const gradeMaximum = roundedChartMaximum(maximumAbsoluteGrade, 5, 5);
		const gradeSeries = gradeValues.some((grade) => grade !== undefined)
			? [
					{
						chartMaximum: gradeMaximum,
						color: GRADE_METRIC_PRESENTATION.chartColor,
						decimals: 1,
						key: CHART_MODE.GRADE,
						label: GRADE_METRIC_PRESENTATION.label,
						minimum: -gradeMaximum,
						unit: GRADE_METRIC_PRESENTATION.unit,
						values: gradeValues,
					},
				]
			: [];
		const elevationSeries = elevationRange
			? [
					{
						chartMaximum: elevationRange.maximum,
						color: ELEVATION_METRIC_PRESENTATION.chartColor,
						decimals: 0,
						key: CHART_MODE.ELEVATION,
						label: ELEVATION_METRIC_PRESENTATION.label,
						minimum: elevationRange.minimum,
						unit: elevationUnitLabel(speedUnit),
						values: chartHistory.map((sample) =>
							sample.elevation === undefined
								? undefined
								: convertElevation(sample.elevation, speedUnit)
						),
					},
				]
			: [];
		return [
			{
				chartMaximum: roundedChartMaximum(
					maximumValue(speedValues, (speed) => speed),
					minimumSpeedChartMaximum(speedUnit),
					5
				),
				color: METRIC_PRESENTATION.speed.chartColor,
				decimals: 1,
				key: CHART_MODE.SPEED,
				label: METRIC_PRESENTATION.speed.label,
				minimum: 0,
				unit: speedUnitLabel(speedUnit),
				values: speedValues,
			},
			...standardSeries,
			...controlSeries,
			...gradeSeries,
			...elevationSeries,
		];
	}, [chartHistory, history, resolvedControlMode, route, speedUnit]);
	const effectiveMode =
		selectedMode === CHART_MODE.ALL || series.some((item) => item.key === selectedMode)
			? selectedMode
			: CHART_MODE.ALL;
	const focusedMode = useRef(effectiveMode);
	const visibleSeries = useMemo(
		() =>
			effectiveMode === CHART_MODE.ALL
				? series
				: series.filter((item) => item.key === effectiveMode),
		[effectiveMode, series]
	);
	const availableModes = useMemo(
		() => [
			{ label: 'All', value: CHART_MODE.ALL },
			...series.map(({ key, label }) => ({ label, value: key })),
		],
		[series]
	);
	const historyPositions = useMemo(
		() => chartHistory.map((sample) => sample.elapsedSeconds),
		[chartHistory]
	);
	const samplesByElapsedSecond = useMemo(
		() => new Map(chartHistory.map((sample) => [sample.elapsedSeconds, sample])),
		[chartHistory]
	);
	const inspectElapsedSecond = useCallback(
		(elapsedSecond: number | undefined) =>
			onInspectSample?.(
				elapsedSecond === undefined ? undefined : samplesByElapsedSecond.get(elapsedSecond)
			),
		[onInspectSample, samplesByElapsedSecond]
	);
	const focusElapsedSecond = useCallback(
		(elapsedSecond: number | undefined) => {
			setFocusedElapsedSecond((current) =>
				current === elapsedSecond ? current : elapsedSecond
			);
			inspectElapsedSecond(elapsedSecond);
		},
		[inspectElapsedSecond]
	);
	const historyStart = chartHistory.at(0)?.elapsedSeconds ?? 0;
	const historySeconds =
		chartHistory.length > 1 ? (chartHistory.at(-1)?.elapsedSeconds ?? 0) - historyStart : 0;
	const sessionControls = variant === 'session';
	const containerSpacing = sessionControls ? 'mt-3' : '';
	const controlsClassName = sessionControls
		? 'session-chart-controls scrollbar-hidden flex w-full gap-1 overflow-x-auto rounded-lg bg-inherit p-1'
		: 'scrollbar-hidden flex w-full gap-1 overflow-x-auto rounded-lg bg-inherit p-1';
	const controlClassName = sessionControls
		? 'session-chart-control inline-flex min-w-max flex-none items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 py-2 font-semibold text-[11px] transition'
		: 'inline-flex min-w-max flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-2 font-semibold text-[11px] transition sm:text-[13px]';
	const controlsRef = useRef<HTMLDivElement>(null);
	const [controlOverflow, setControlOverflow] = useState({ left: false, right: false });
	const updateControlOverflow = useCallback(() => {
		const controls = controlsRef.current;
		if (!controls) {
			return;
		}
		const next = {
			left: controls.scrollLeft > 2,
			right: controls.scrollLeft + controls.clientWidth < controls.scrollWidth - 2,
		};
		setControlOverflow((current) =>
			current.left === next.left && current.right === next.right ? current : next
		);
	}, []);

	const selectMode = useCallback(
		(mode: ChartMode) => (onSelectChartMode ?? preferencesStore.actions.selectChartMode)(mode),
		[onSelectChartMode]
	);

	useEffect(() => {
		if (inspectionEnabled) {
			return;
		}
		setFocusedElapsedSecond(undefined);
		onInspectSample?.(undefined);
	}, [inspectionEnabled, onInspectSample]);

	useEffect(() => {
		if (focusedMode.current === effectiveMode) {
			return;
		}
		focusedMode.current = effectiveMode;
		setFocusedElapsedSecond(undefined);
		onInspectSample?.(undefined);
	}, [effectiveMode, onInspectSample]);

	useEffect(() => {
		if (!keyboardEnabled) {
			return;
		}
		const handleKeys = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				keyboardEventHasModifiers(event) ||
				eventTargetsEditableControl(event) ||
				!['ArrowLeft', 'ArrowRight'].includes(event.key)
			) {
				return;
			}
			event.preventDefault();
			const current = Math.max(
				0,
				availableModes.findIndex((mode) => mode.value === effectiveMode)
			);
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const nextMode =
				availableModes[
					(current + direction + availableModes.length) % availableModes.length
				];
			if (nextMode) {
				selectMode(nextMode.value);
			}
		};
		window.addEventListener('keydown', handleKeys);
		return () => window.removeEventListener('keydown', handleKeys);
	}, [availableModes, effectiveMode, keyboardEnabled, selectMode]);

	useEffect(() => {
		const controls = controlsRef.current;
		const selectedControl = controls?.querySelector<HTMLElement>(
			`[data-chart-mode="${effectiveMode}"]`
		);
		if (!(controls && selectedControl)) {
			return;
		}
		const controlStart = selectedControl.offsetLeft;
		const controlEnd = controlStart + selectedControl.offsetWidth;
		if (controlStart < controls.scrollLeft) {
			controls.scrollLeft = controlStart;
		} else if (controlEnd > controls.scrollLeft + controls.clientWidth) {
			controls.scrollLeft = controlEnd - controls.clientWidth;
		}
		updateControlOverflow();
	}, [effectiveMode, updateControlOverflow]);

	useEffect(() => {
		const controls = controlsRef.current;
		if (!controls) {
			return;
		}
		const frame = window.requestAnimationFrame(updateControlOverflow);
		controls.addEventListener('scroll', updateControlOverflow, { passive: true });
		window.addEventListener('resize', updateControlOverflow);
		return () => {
			window.cancelAnimationFrame(frame);
			controls.removeEventListener('scroll', updateControlOverflow);
			window.removeEventListener('resize', updateControlOverflow);
		};
	}, [updateControlOverflow]);

	return (
		<div
			className={`${containerSpacing} session-chart min-w-0 overflow-hidden rounded-xl p-2 sm:p-3`}
			data-variant={variant}
		>
			<div className="relative">
				<div
					className={controlsClassName}
					ref={controlsRef}
					style={
						sessionControls
							? ({
									'--session-chart-mode-count': availableModes.length,
								} as CSSProperties)
							: undefined
					}
				>
					{availableModes.map((mode) => (
						<button
							className={`${controlClassName} ${effectiveMode === mode.value ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-200'}`}
							data-chart-mode={mode.value}
							key={mode.value}
							onClick={() => selectMode(mode.value)}
							onPointerUp={(event) => event.currentTarget.blur()}
							type="button"
						>
							{mode.value === CHART_MODE.ALL ? null : (
								<span
									className="h-1.5 w-1.5 shrink-0 rounded-full"
									style={{
										backgroundColor:
											series.find((item) => item.key === mode.value)?.color ??
											'var(--metric-gear)',
									}}
								/>
							)}
							{mode.label}
						</button>
					))}
				</div>
				{controlOverflow.left ? (
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-1 left-0 z-10 grid w-7 place-items-center font-bold text-base text-slate-300"
						style={{
							background: chartControlsEdgeBackground('right', sessionControls),
						}}
					>
						‹
					</span>
				) : null}
				{controlOverflow.right ? (
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-1 right-0 z-10 grid w-7 place-items-center font-bold text-base text-slate-300"
						style={{
							background: chartControlsEdgeBackground('left', sessionControls),
						}}
					>
						›
					</span>
				) : null}
			</div>
			<div className="mt-3">
				<div className="relative w-full">
					{history.length === 0 && !sessionControls ? (
						<div className="absolute inset-y-0 right-0 left-16 z-20 grid place-items-center px-4 text-center text-slate-500 text-sm sm:left-20">
							Connect and pedal to graph live session data
						</div>
					) : null}
					{visibleSeries.map((item) => (
						<ChartPlot
							color={item.color}
							decimals={item.decimals}
							heightClass={
								effectiveMode === CHART_MODE.ALL
									? 'h-[88px] sm:h-[104px]'
									: 'h-40 sm:h-52'
							}
							interactive={inspectionEnabled}
							key={item.key}
							label={item.label}
							maximum={item.chartMaximum}
							minimum={item.minimum}
							onFocusXChange={
								inspectionEnabled &&
								(effectiveMode === CHART_MODE.ALL || onInspectSample)
									? focusElapsedSecond
									: undefined
							}
							positions={historyPositions}
							showLabel
							synchronizedFocusX={
								inspectionEnabled && effectiveMode === CHART_MODE.ALL
									? focusedElapsedSecond
									: undefined
							}
							title={`${item.label} over time`}
							unit={item.unit}
							values={item.values}
						/>
					))}
				</div>
				<div className="mt-1 grid grid-cols-[4rem_minmax(0,1fr)] font-medium text-[10px] text-slate-400 sm:grid-cols-[5rem_minmax(0,1fr)] sm:text-xs">
					<span aria-hidden="true" />
					<div className="flex justify-between">
						{[0, 0.25, 0.5, 0.75, 1].map((position) => (
							<span key={position}>
								{formatChartSeconds(historyStart + historySeconds * position)}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
