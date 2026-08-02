import {
	areaY,
	barY,
	type ChartDefinition,
	type ChartDefinitionOptions,
	type ChartPoint,
	type ChartTheme,
	type ChartValue,
	defineChart,
	dot,
	lineY,
	ruleX,
	ruleY,
} from '@tanstack/charts';
import { focusNearestX } from '@tanstack/charts/focus';
import { focusDisabled } from '@tanstack/charts/focus/disabled';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart, type ChartProps } from '@tanstack/react-charts';
import { scaleBand, scaleLinear } from 'd3-scale';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BASE_CHART_THEME: ChartTheme = {
	background: 'var(--chart-surface)',
	foreground: 'var(--color-slate-300)',
	grid: 'var(--chart-grid)',
	muted: 'var(--color-slate-500)',
	palette: [
		'var(--metric-speed)',
		'var(--metric-power)',
		'var(--metric-cadence)',
		'var(--metric-heart-rate)',
	],
};
const DEFAULT_RESPONSIVE_CHART_HEIGHT = 112;
const LINE_CHART_DOMAIN_PADDING = 0.16;
const GUIDE_STYLE = {
	stroke: BASE_CHART_THEME.grid,
	strokeDasharray: '2.5 2.5',
	strokeOpacity: 0.75,
	strokeWidth: 1,
} as const;

interface LabeledChartDatum {
	label: string;
}

function chartTheme(background: string): ChartTheme {
	return { ...BASE_CHART_THEME, background };
}

function interactionOptions<
	TDatum extends LabeledChartDatum,
	TXValue extends ChartValue,
	TYValue extends ChartValue,
>(interactive: boolean): ChartDefinitionOptions<TDatum, TXValue, TYValue> {
	return interactive
		? {
				animate: false,
				focus: focusNearestX,
				maxFocusDistance: Number.POSITIVE_INFINITY,
				tooltip: {
					className: 'ride-control-chart-tooltip',
					format: (point) => point.datum.label,
					use: tooltip,
				},
			}
		: {
				animate: false,
				focus: focusDisabled,
				keyboard: false,
				tooltip: false,
			};
}

function MeasuredChartFrame({
	children,
	height,
}: {
	children: (height: number) => ReactNode;
	height?: number;
}) {
	const frameRef = useRef<HTMLDivElement>(null);
	const [measuredHeight, setMeasuredHeight] = useState(DEFAULT_RESPONSIVE_CHART_HEIGHT);
	useEffect(() => {
		if (height !== undefined) {
			return;
		}
		const frame = frameRef.current;
		if (!frame) {
			return;
		}
		const updateHeight = () => {
			const nextHeight = Math.max(1, Math.round(frame.getBoundingClientRect().height));
			setMeasuredHeight((currentHeight) =>
				currentHeight === nextHeight ? currentHeight : nextHeight
			);
		};
		updateHeight();
		const ResizeObserverConstructor = frame.ownerDocument.defaultView?.ResizeObserver;
		if (!ResizeObserverConstructor) {
			return;
		}
		const observer = new ResizeObserverConstructor(updateHeight);
		observer.observe(frame);
		return () => observer.disconnect();
	}, [height]);
	return (
		<div className="h-full min-h-0 w-full" ref={frameRef}>
			{children(height ?? measuredHeight)}
		</div>
	);
}

export interface InteractiveChartDatum<TValue> extends LabeledChartDatum {
	key: string;
	value: TValue;
}

type InteractiveChartSurfaceProps<
	TDatum,
	TXValue extends ChartValue,
	TYValue extends ChartValue,
> = Pick<
	ChartProps<TDatum, TXValue, TYValue>,
	'ariaDescription' | 'ariaLabel' | 'className' | 'definition' | 'onFocusChange'
> & {
	height?: number;
};

function InteractiveChartSurface<TDatum, TXValue extends ChartValue, TYValue extends ChartValue>({
	ariaDescription,
	ariaLabel,
	className,
	definition,
	height,
	onFocusChange,
}: InteractiveChartSurfaceProps<TDatum, TXValue, TYValue>) {
	return (
		<MeasuredChartFrame height={height}>
			{(chartHeight) => (
				<Chart<TDatum, TXValue, TYValue>
					ariaDescription={ariaDescription}
					ariaLabel={ariaLabel}
					className={className}
					definition={definition}
					height={chartHeight}
					onFocusChange={onFocusChange}
					style={{ height: '100%' }}
				/>
			)}
		</MeasuredChartFrame>
	);
}

export interface InteractiveLineDatum extends InteractiveChartDatum<number | undefined> {
	x: number;
}

interface InteractiveLineInput {
	area: boolean;
	background: string;
	color: string;
	focusedX?: number;
	maximum: number;
	minimum: number;
	rows: readonly InteractiveLineDatum[];
	xMaximum: number;
	xMinimum: number;
}

function interactiveLineDefinition(
	input: InteractiveLineInput,
	interactive: boolean
): ChartDefinition<InteractiveLineDatum, number, number> {
	const xSpan = input.xMaximum - input.xMinimum;
	const resolvedXMaximum = xSpan > 0 ? input.xMaximum : input.xMinimum + 1;
	const ySpan = input.maximum - input.minimum;
	const resolvedYMaximum = ySpan > 0 ? input.maximum : input.minimum + 1;
	const yPadding = (resolvedYMaximum - input.minimum) * LINE_CHART_DOMAIN_PADDING;
	const yDomainMinimum = input.minimum - yPadding;
	const yDomainMaximum = resolvedYMaximum + yPadding;
	const middleY = input.minimum + (resolvedYMaximum - input.minimum) / 2;
	const verticalGuides = [0.25, 0.5, 0.75].map((progress) => ({
		value: input.xMinimum + (resolvedXMaximum - input.xMinimum) * progress,
	}));
	const horizontalGuides = [
		{ dashed: false, value: yDomainMinimum },
		{ dashed: true, value: middleY },
		{ dashed: false, value: yDomainMaximum },
	];
	const focusedRows =
		input.focusedX === undefined
			? []
			: input.rows.filter((row) => row.x === input.focusedX && row.value !== undefined);
	return defineChart({
		...interactionOptions<InteractiveLineDatum, number, number>(interactive),
		marks: [
			...horizontalGuides.map((guide, index) =>
				ruleY([guide], {
					...GUIDE_STYLE,
					id: `horizontal-${index}`,
					strokeDasharray: guide.dashed ? GUIDE_STYLE.strokeDasharray : undefined,
					strokeOpacity: guide.dashed ? 0.75 : 1,
					strokeWidth: guide.dashed ? 1 : 0.75,
					y: 'value',
				})
			),
			ruleX(verticalGuides, {
				...GUIDE_STYLE,
				id: 'vertical-guides',
				x: 'value',
			}),
			...(input.area
				? [
						areaY(input.rows, {
							fill: input.color,
							fillOpacity: 0.1,
							id: 'area',
							key: 'key',
							x: 'x',
							y1: input.minimum,
							y2: 'value',
						}),
					]
				: []),
			lineY(input.rows, {
				id: 'line',
				key: 'key',
				stroke: input.color,
				strokeWidth: 2,
				x: 'x',
				y: 'value',
			}),
			...(focusedRows.length > 0
				? [
						dot(focusedRows, {
							fill: input.background,
							id: 'synchronized-focus',
							key: 'key',
							r: 5,
							stroke: input.color,
							strokeWidth: 2.5,
							x: 'x',
							y: 'value',
						}),
					]
				: []),
		],
		theme: chartTheme(input.background),
		x: {
			axis: false,
			scale: scaleLinear().domain([input.xMinimum, resolvedXMaximum]),
		},
		y: {
			axis: false,
			scale: scaleLinear().domain([yDomainMinimum, yDomainMaximum]),
		},
	});
}

export function InteractiveLineChart({
	area = false,
	ariaLabel,
	background = 'var(--chart-surface)',
	className,
	color,
	focusedX,
	height,
	interactive = true,
	maximum,
	minimum,
	onFocusXChange,
	rows,
}: {
	area?: boolean;
	ariaLabel: string;
	background?: string;
	className?: string;
	color: string;
	focusedX?: number;
	height?: number;
	interactive?: boolean;
	maximum: number;
	minimum: number;
	onFocusXChange?: (x: number | undefined) => void;
	rows: readonly InteractiveLineDatum[];
}) {
	const xMinimum = rows[0]?.x ?? 0;
	const xMaximum = rows.at(-1)?.x ?? xMinimum;
	const definition = useMemo(
		() =>
			interactiveLineDefinition(
				{
					area,
					background,
					color,
					focusedX: interactive ? focusedX : undefined,
					maximum,
					minimum,
					rows,
					xMaximum,
					xMinimum,
				},
				interactive
			),
		[area, background, color, focusedX, interactive, maximum, minimum, rows, xMaximum, xMinimum]
	);
	const handleFocusChange = useCallback(
		(point: ChartPoint<InteractiveLineDatum, number, number> | null) =>
			onFocusXChange?.(point === null ? undefined : point.datum.x),
		[onFocusXChange]
	);
	return (
		<InteractiveChartSurface<InteractiveLineDatum, number, number>
			ariaDescription={
				interactive
					? 'Hover over the plot or use the arrow keys to inspect exact values.'
					: 'Live chart updates while the session is running.'
			}
			ariaLabel={ariaLabel}
			className={className}
			definition={definition}
			height={height}
			onFocusChange={interactive && onFocusXChange ? handleFocusChange : undefined}
		/>
	);
}

export type InteractiveBarDatum = InteractiveChartDatum<number>;

interface InteractiveBarInput {
	background: string;
	color: string;
	maximum: number;
	rows: readonly InteractiveBarDatum[];
}

function interactiveBarDefinition(
	input: InteractiveBarInput
): ChartDefinition<InteractiveBarDatum, string, number> {
	const maximum = input.maximum > 0 ? input.maximum : 1;
	return defineChart({
		...interactionOptions<InteractiveBarDatum, string, number>(true),
		marks: [
			ruleY([{ value: maximum / 2 }], {
				...GUIDE_STYLE,
				id: 'middle-guide',
				strokeOpacity: 0.7,
				y: 'value',
			}),
			barY(input.rows, {
				fill: input.color,
				fillOpacity: 0.82,
				id: 'bars',
				inset: 1,
				key: 'key',
				radius: 4,
				x: 'key',
				y: 'value',
			}),
		],
		theme: chartTheme(input.background),
		x: {
			axis: false,
			scale: scaleBand<string>()
				.domain(input.rows.map((row) => row.key))
				.padding(0.12),
		},
		y: {
			axis: false,
			scale: scaleLinear().domain([0, maximum]),
		},
	});
}

export function InteractiveBarChart({
	ariaLabel,
	background = 'var(--chart-surface)',
	className,
	color,
	height,
	maximum,
	rows,
}: {
	ariaLabel: string;
	background?: string;
	className?: string;
	color: string;
	height?: number;
	maximum: number;
	rows: readonly InteractiveBarDatum[];
}) {
	const definition = useMemo(
		() => interactiveBarDefinition({ background, color, maximum, rows }),
		[background, color, maximum, rows]
	);
	return (
		<InteractiveChartSurface<InteractiveBarDatum, string, number>
			ariaDescription="Hover over a bar or use the arrow keys to inspect exact values."
			ariaLabel={ariaLabel}
			className={className}
			definition={definition}
			height={height}
		/>
	);
}
