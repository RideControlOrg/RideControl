import { formatGradeValue } from '../lib/format';
import {
	GRADE_METRIC_PRESENTATION,
	RESISTANCE_METRIC_PRESENTATION,
} from '../lib/metric-presentation';
import {
	distanceUnitLabel,
	elevationUnitLabel,
	formatDistanceProgressValue,
	formatElevationValue,
} from '../lib/units';
import { WORKOUT_ROUTE_TYPE, WORKOUT_VIEW, type WorkoutRouteType } from '../lib/workout-schema';
import type { ElevationTotals, SessionWorkout, SpeedUnit, WorkoutTerrain } from '../types';
import { WorkoutRouteVisualization } from './workout-route-visualization';

interface WorkoutStat {
	color?: string;
	label: string;
	unit?: string;
	value: string;
	valueAriaLabel?: string;
	valueClassName?: string;
}

interface WorkoutCompletionLabels {
	completed: string;
	unit: string;
}

const WORKOUT_MAP_PANEL_CLASS = 'px-3 pt-3 pb-1.5 sm:px-5 sm:pt-5 sm:pb-2';
const WORKOUT_MAP_VISUALIZATION_CLASS = 'mt-1 h-36 sm:h-44';
const WORKOUT_PROFILE_VISUALIZATION_CLASS = 'mt-auto h-36 sm:h-44';

function workoutCompletionLabels(routeType: WorkoutRouteType): WorkoutCompletionLabels {
	switch (routeType) {
		case WORKOUT_ROUTE_TYPE.LOOP:
			return { completed: 'Laps', unit: 'lap' };
		case WORKOUT_ROUTE_TYPE.OUT_AND_BACK:
			return { completed: 'Trips', unit: 'trip' };
		case WORKOUT_ROUTE_TYPE.POINT_TO_POINT:
			return { completed: 'Laps', unit: 'lap' };
		default:
			return { completed: '', unit: '' };
	}
}

function WorkoutStats({
	className,
	compact = false,
	highlighted = false,
	stats,
}: {
	className?: string;
	compact?: boolean;
	highlighted?: boolean;
	stats: WorkoutStat[];
}) {
	const columnClass = stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
	const labelSize = highlighted ? 'text-[10px]' : 'text-[9px]';
	const valueSize = highlighted ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl';
	const defaultValueColor = highlighted ? 'text-mint' : 'text-white';
	const gridClassName = compact
		? `grid w-full gap-2 text-center tabular-nums lg:gap-5 ${columnClass} ${className ?? ''}`
		: 'grid grid-cols-3 gap-5 text-center tabular-nums';
	return (
		<div className={gridClassName}>
			{stats.map((stat) => {
				const valueClassName = `mt-1 block whitespace-nowrap font-bold leading-none ${valueSize} ${stat.color ? '' : (stat.valueClassName ?? defaultValueColor)}`;
				return (
					<div className={compact ? 'min-w-0' : undefined} key={stat.label}>
						<p
							className={`whitespace-nowrap font-bold text-slate-500 uppercase ${compact ? 'tracking-[.14em]' : 'tracking-widest'} ${labelSize}`}
						>
							{stat.label}
							{stat.unit ? (
								<span className="ml-1 font-semibold text-slate-400 normal-case tracking-normal">
									{stat.unit}
								</span>
							) : null}
						</p>
						{stat.valueAriaLabel ? (
							<output
								aria-label={stat.valueAriaLabel}
								className={valueClassName}
								style={{ color: stat.color }}
							>
								{stat.value}
							</output>
						) : (
							<p className={valueClassName} style={{ color: stat.color }}>
								{stat.value}
							</p>
						)}
					</div>
				);
			})}
		</div>
	);
}

export function WorkoutProgress({
	elevationTotals,
	isRiding,
	previewTerrain,
	speedUnit,
	targetResistance,
	terrain,
	variant = 'dashboard',
	workout,
}: {
	elevationTotals: ElevationTotals;
	isRiding: boolean;
	previewTerrain?: WorkoutTerrain;
	speedUnit: SpeedUnit;
	targetResistance?: number;
	terrain: WorkoutTerrain;
	variant?: 'dashboard' | 'session';
	workout: SessionWorkout;
}) {
	const { course } = workout;
	const sessionSummary = variant === 'session';
	const panelBackgroundClass = sessionSummary ? 'bg-transparent' : 'bg-ink';
	const completion = workoutCompletionLabels(course.routeType);
	const distanceUnit = distanceUnitLabel(speedUnit);
	const elevationUnit = elevationUnitLabel(speedUnit);
	const elevationStats = [
		{
			label: 'Course climb',
			unit: elevationUnit,
			value: formatElevationValue(course.elevationGain, speedUnit),
		},
		{
			label: 'Climbed',
			unit: elevationUnit,
			value: formatElevationValue(elevationTotals.ascent, speedUnit),
		},
		{
			label: 'Downhill',
			unit: elevationUnit,
			value: formatElevationValue(elevationTotals.descent, speedUnit),
		},
	];
	const summaryStats = [
		{
			label: 'Distance',
			unit: distanceUnit,
			value: formatDistanceProgressValue(terrain.distance, course.distance, speedUnit),
		},
		{
			label: completion.completed,
			value: String(terrain.completedLaps),
			valueAriaLabel: `${terrain.completedLaps} ${completion.unit}${terrain.completedLaps === 1 ? '' : 's'} completed`,
		},
	];
	const mapStats = [
		{
			label: 'Progress',
			unit: '%',
			value: String(Math.round(terrain.progress * 100)),
			valueClassName: 'text-mint',
		},
		{
			color: GRADE_METRIC_PRESENTATION.chartColor,
			label: 'Grade',
			unit: '%',
			value: formatGradeValue(terrain.grade),
		},
		...(sessionSummary
			? []
			: [
					{
						color: RESISTANCE_METRIC_PRESENTATION.chartColor,
						label: 'Resistance',
						unit: '%',
						value: String(Math.round(targetResistance ?? terrain.resistance)),
					},
				]),
	];
	return (
		<section className={`mt-3 overflow-hidden ${panelBackgroundClass}`}>
			<div
				className={
					sessionSummary
						? 'session-workout-progress-grid grid'
						: 'dashboard-workout-grid grid md:grid-cols-2'
				}
			>
				<div
					className={`${WORKOUT_MAP_PANEL_CLASS} workout-map-pane flex flex-col ${panelBackgroundClass} ${
						sessionSummary ? '' : 'dashboard-workout-pane'
					}`}
				>
					<div
						className={`workout-map-summary grid ${
							sessionSummary
								? 'workout-map-summary-session'
								: 'workout-map-summary-dashboard'
						}`}
					>
						<WorkoutStats
							className="workout-distance-laps-stats"
							compact
							highlighted={!sessionSummary}
							stats={summaryStats}
						/>
						<WorkoutStats
							className="workout-state-stats"
							compact
							highlighted={!sessionSummary}
							stats={mapStats}
						/>
					</div>
					<WorkoutRouteVisualization
						className={WORKOUT_MAP_VISUALIZATION_CLASS}
						course={course}
						isRiding={isRiding}
						markerTerrain={previewTerrain}
						terrain={terrain}
						view={WORKOUT_VIEW.MAP}
					/>
				</div>
				<div
					className={`${WORKOUT_MAP_PANEL_CLASS} flex flex-col ${panelBackgroundClass} ${
						sessionSummary ? '' : 'dashboard-workout-pane'
					}`}
				>
					<div className="min-h-16">
						<WorkoutStats
							compact
							highlighted={!sessionSummary}
							stats={elevationStats}
						/>
					</div>
					<WorkoutRouteVisualization
						className={WORKOUT_PROFILE_VISUALIZATION_CLASS}
						course={course}
						isRiding={isRiding}
						markerTerrain={previewTerrain}
						terrain={terrain}
						view={WORKOUT_VIEW.PROFILE}
					/>
				</div>
			</div>
		</section>
	);
}
