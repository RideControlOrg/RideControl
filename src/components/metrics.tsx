import { memo } from 'react';
import { metricAccentClass, metricIconClass } from '../lib/metric-presentation';
import { Icon } from './icon';

function MetricSummary({
	label,
	rightAligned = false,
	value,
}: {
	label: string;
	rightAligned?: boolean;
	value: string;
}) {
	return (
		<div className={rightAligned ? 'text-right' : undefined}>
			<p className="text-[10px] font-bold tracking-[.12em] text-slate-500">{label}</p>
			<p className="mt-1 text-2xl font-semibold tracking-tight text-white tabular-nums sm:text-3xl">
				{value}
			</p>
		</div>
	);
}

export const Metric = memo(function MetricComponent({
	average,
	label,
	maximum,
	value,
	unit,
	accent,
	icon,
}: {
	average: string;
	label: string;
	maximum: string;
	value: string;
	unit: string;
	accent: string;
	icon?: string;
}) {
	return (
		<div className="bg-ink min-w-0 p-3 sm:p-4">
			<div className="flex items-center justify-between">
				<span className="text-xs font-bold tracking-[.14em] text-slate-500">{label}</span>
				{icon ? (
					<Icon className={`h-5 w-5 ${metricIconClass(accent)}`} name={icon} />
				) : null}
			</div>
			<div className="mt-3 flex items-baseline gap-2">
				<span className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl xl:text-6xl">
					{value}
				</span>
				<span className="text-sm text-slate-400">{unit}</span>
			</div>
			<div className={`mt-3 grid grid-cols-2 gap-3 border-t pt-3 ${metricIconClass(accent)}`}>
				<MetricSummary label="AVG" value={average} />
				<MetricSummary label="MAX" rightAligned value={maximum} />
			</div>
		</div>
	);
});

export const SmallMetric = memo(function SmallMetricComponent({
	large = false,
	label,
	unit,
	value,
}: {
	large?: boolean;
	label: string;
	unit?: string;
	value: string;
}) {
	return (
		<div
			className={
				large
					? 'flex h-full min-w-0 flex-col justify-center px-3 py-3 sm:px-5'
					: 'min-w-0 p-4 sm:p-5'
			}
		>
			<p className="text-[11px] font-bold tracking-[.12em] text-slate-500">{label}</p>
			<p
				className={`mt-1 flex min-w-0 items-baseline gap-1 font-semibold tracking-[-.045em] sm:gap-2 ${large ? 'text-xl min-[420px]:text-2xl sm:text-4xl lg:text-5xl xl:text-6xl' : 'text-lg sm:text-2xl'}`}
			>
				<span className="min-w-0">{value}</span>
				{unit ? (
					<span
						className={`shrink-0 font-medium tracking-normal text-slate-400 ${large ? 'text-xs sm:text-lg lg:text-xl' : 'text-xs sm:text-sm'}`}
					>
						{unit}
					</span>
				) : null}
			</p>
		</div>
	);
});

export const SessionMetric = memo(function SessionMetricComponent({
	accent,
	average,
	icon,
	label,
	maximum,
	unit,
}: {
	accent: string;
	average: string;
	icon: string;
	label: string;
	maximum?: string;
	unit: string;
}) {
	return (
		<div className="session-detail-metric min-w-0 p-3 sm:p-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-[9px] font-bold tracking-widest whitespace-nowrap text-slate-500">
					{label}
				</p>
				<Icon className={`h-4 w-4 shrink-0 ${metricIconClass(accent)}`} name={icon} />
			</div>
			<div className="mt-3 flex items-baseline gap-2">
				<span className="text-3xl font-semibold tracking-tight sm:text-4xl">{average}</span>
				<span className="text-xs text-slate-400">{unit}</span>
			</div>
			<div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
				<span className="font-bold tracking-[.08em] text-slate-600">AVG</span>
				{maximum === undefined ? null : (
					<span className="pr-1 text-right text-slate-400">
						<strong className="mr-1 font-bold tracking-[.08em] text-slate-600">
							MAX
						</strong>
						{maximum}
					</span>
				)}
			</div>
			<div className={`mt-3 h-px ${metricAccentClass(accent)}`} />
		</div>
	);
});
