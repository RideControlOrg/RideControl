import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_ROUTE } from '../constants';
import { usePersistentScrollPosition } from '../hooks/use-persistent-scroll-position';
import { CONTROL_MODE } from '../lib/control-mode';
import { downloadSessionFit } from '../lib/fit';
import { aggregateMaximum, formatAggregateAverage, formatWholeNumber } from '../lib/format';
import { METRIC_PRESENTATION, STANDARD_METRIC_KEYS } from '../lib/metric-presentation';
import { poundsForKilograms } from '../lib/profile';
import {
	feelingLabel,
	formatSessionDateRange,
	formatSessionImportLabel,
	formatSessionTimeRange,
	isImportedSession,
} from '../lib/saved-sessions';
import { type CombinedSessionJourney, sessionWorkoutDistance } from '../lib/session-continuation';
import { sessionDetailScrollPositionStorageKey } from '../lib/session-history-preferences';
import { shareSessionOnX } from '../lib/session-sharing';
import { downloadSessionTcx } from '../lib/tcx';
import { workoutTerrainAtDistance } from '../lib/workouts';
import type { ChartMode, MetricSample, SavedSession, SpeedUnit } from '../types';
import { SessionMetric } from './metrics';
import { SessionChart } from './session-chart';
import { SessionSummary } from './session-summary';
import { WorkoutProgress } from './workout-progress';

function SessionMetadataDetails({
	session,
	speedUnit,
}: {
	session: SavedSession;
	speedUnit: SpeedUnit;
}) {
	const recordedRiderWeight = session.profileSnapshot
		? {
				unit: speedUnit === 'mph' ? 'lb' : 'kg',
				value: (speedUnit === 'mph'
					? poundsForKilograms(session.profileSnapshot.riderWeightKg)
					: session.profileSnapshot.riderWeightKg
				).toFixed(1),
			}
		: undefined;

	return (
		<div
			className={`session-metadata-grid mt-3 grid gap-3 ${
				recordedRiderWeight ? 'session-metadata-grid-with-weight' : ''
			}`}
		>
			{recordedRiderWeight ? (
				<div className="session-metadata-item session-metadata-weight px-2 py-3 sm:px-3">
					<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">
						RIDER WEIGHT
					</p>
					<p className="mt-1 flex items-baseline gap-1 font-semibold text-slate-300 text-xl tabular-nums">
						{recordedRiderWeight.value}
						<span className="font-medium text-slate-400 text-xs">
							{recordedRiderWeight.unit}
						</span>
					</p>
				</div>
			) : null}
			<div className="session-metadata-item session-metadata-feeling px-2 py-3 sm:px-3">
				<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">FELT</p>
				<p className="mt-1 whitespace-pre-wrap text-slate-300 text-sm">
					{feelingLabel(session.feeling)}
				</p>
			</div>
			<div className="session-metadata-description session-metadata-item px-2 py-3 sm:px-3">
				<p className="font-bold text-[10px] text-slate-500 tracking-[.12em]">DESCRIPTION</p>
				<p className="mt-1 whitespace-pre-wrap text-slate-300 text-sm">
					{session.comments || 'No description'}
				</p>
			</div>
		</div>
	);
}

export function DeleteSessionDialog({
	deleting,
	onCancel,
	onConfirm,
	open,
}: {
	deleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}) {
	const confirmButton = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (open) {
			confirmButton.current?.focus();
		}
	}, [open]);

	if (!open) {
		return null;
	}

	return (
		<section
			aria-describedby="delete-session-description"
			aria-labelledby="delete-session-title"
			aria-modal="true"
			className="absolute top-0 right-0 z-30 w-full max-w-sm rounded-xl border border-rose-400/40 bg-panel/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-sm"
			role="alertdialog"
		>
			<h2 className="font-bold text-lg" id="delete-session-title">
				Delete this session?
			</h2>
			<p className="mt-1 text-slate-400 text-sm" id="delete-session-description">
				This cannot be undone.
			</p>
			<div className="mt-4 flex justify-end gap-2">
				<button
					className="rounded-lg px-3 py-2 font-semibold text-slate-400 text-xs hover:bg-slate-800 hover:text-white"
					disabled={deleting}
					onClick={onCancel}
					type="button"
				>
					Cancel
				</button>
				<button
					className="rounded-lg bg-rose-700 px-3 py-2 font-bold text-white text-xs hover:bg-rose-600 disabled:opacity-50"
					disabled={deleting}
					onClick={onConfirm}
					ref={confirmButton}
					type="button"
				>
					{deleting ? 'Deleting…' : 'Delete permanently'}
				</button>
			</div>
		</section>
	);
}

function JourneyMetricScope({
	journey,
	onChange,
	onSelectSession,
	showCombined,
}: {
	journey: CombinedSessionJourney;
	onChange: (showCombined: boolean) => void;
	onSelectSession?: (sessionId: string) => void;
	showCombined: boolean;
}) {
	const selectSession = (sessionId: string | undefined) => {
		if (sessionId) {
			onSelectSession?.(sessionId);
		}
	};
	const canSelectPrevious = Boolean(journey.previousSessionId && onSelectSession);
	const canSelectNext = Boolean(journey.nextSessionId && onSelectSession);
	return (
		<div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<p className="text-xs">
					<span className="text-slate-500">Journey </span>
					<strong className="text-slate-200">
						{journey.partNumber}/{journey.partCount}
					</strong>
				</p>
				<nav aria-label="Connected journey sessions" className="flex items-center gap-3">
					{canSelectPrevious ? (
						<button
							className="py-1 font-semibold text-slate-400 text-xs hover:text-white"
							onClick={() => selectSession(journey.previousSessionId)}
							type="button"
						>
							← Part {journey.partNumber - 1}
						</button>
					) : null}
					{canSelectNext ? (
						<button
							className="py-1 font-semibold text-slate-400 text-xs hover:text-white"
							onClick={() => selectSession(journey.nextSessionId)}
							type="button"
						>
							Part {journey.partNumber + 1} →
						</button>
					) : null}
				</nav>
			</div>
			<button
				aria-pressed={showCombined}
				className={`px-2 py-1 font-semibold text-xs ${
					showCombined ? 'bg-mint/10 text-mint' : 'text-slate-400 hover:text-white'
				}`}
				onClick={() => onChange(!showCombined)}
				type="button"
			>
				All parts
			</button>
		</div>
	);
}

export function SessionDetail({
	chartKeyboardEnabled = true,
	combinedJourney,
	deleteConfirmationOpen = false,
	deleting = false,
	onCancelDelete,
	onConfirmDelete,
	onDelete,
	onSelectChartMode,
	onSelectLinkedSession,
	onStartNew,
	selectedChartMode,
	session,
	speedUnit,
}: {
	chartKeyboardEnabled?: boolean;
	combinedJourney?: CombinedSessionJourney;
	deleteConfirmationOpen?: boolean;
	deleting?: boolean;
	onCancelDelete?: () => void;
	onConfirmDelete?: () => void;
	onDelete?: () => void;
	onSelectChartMode?: (mode: ChartMode) => void;
	onSelectLinkedSession?: (sessionId: string) => void;
	onStartNew?: () => void;
	selectedChartMode?: ChartMode;
	session: SavedSession;
	speedUnit: SpeedUnit;
}) {
	const [shareError, setShareError] = useState('');
	const [sharing, setSharing] = useState(false);
	const [showCombinedJourney, setShowCombinedJourney] = useState(false);
	const [previewWorkoutDistance, setPreviewWorkoutDistance] = useState<number>();
	const displayedSession =
		showCombinedJourney && combinedJourney ? combinedJourney.session : session;
	const detailScroll = usePersistentScrollPosition(
		sessionDetailScrollPositionStorageKey(session.id),
		true
	);
	const usesGear = displayedSession.controlMode === CONTROL_MODE.GEAR;
	const imported = isImportedSession(session);
	const workoutTerrain = useMemo(
		() =>
			displayedSession.workout
				? workoutTerrainAtDistance(
						displayedSession.workout.course,
						sessionWorkoutDistance(displayedSession)
					)
				: undefined,
		[displayedSession]
	);
	const previewWorkoutTerrain = useMemo(
		() =>
			displayedSession.workout && previewWorkoutDistance !== undefined
				? workoutTerrainAtDistance(displayedSession.workout.course, previewWorkoutDistance)
				: undefined,
		[displayedSession.workout, previewWorkoutDistance]
	);
	const inspectSample = useCallback(
		(sample: MetricSample | undefined) => setPreviewWorkoutDistance(sample?.workoutDistance),
		[]
	);
	const metrics = useMemo(
		() => [
			...STANDARD_METRIC_KEYS.map((key) => {
				const presentation = METRIC_PRESENTATION[key];
				return {
					accent: presentation.accent,
					average: formatAggregateAverage(displayedSession.aggregates[key], 0),
					icon: presentation.icon,
					label: presentation.label.toUpperCase(),
					maximum: formatWholeNumber(displayedSession.maximums[key]),
					unit: presentation.unit,
				};
			}),
			...(usesGear
				? [
						{
							accent: 'mint',
							average: formatAggregateAverage(displayedSession.aggregates.gear, 0),
							icon: 'controls',
							label: 'GEAR',
							maximum: formatWholeNumber(
								aggregateMaximum(displayedSession.aggregates.gear)
							),
							unit: '',
						},
					]
				: []),
			{
				accent: 'mint',
				average: formatAggregateAverage(displayedSession.aggregates.resistance, 0),
				icon: 'resistance',
				label: 'RESISTANCE',
				maximum: formatWholeNumber(
					aggregateMaximum(displayedSession.aggregates.resistance)
				),
				unit: '%',
			},
		],
		[displayedSession.aggregates, displayedSession.maximums, usesGear]
	);
	const shareOnX = useCallback(async () => {
		setShareError('');
		setSharing(true);
		try {
			await shareSessionOnX(session, speedUnit);
		} catch (error) {
			setShareError(
				error instanceof Error
					? error.message
					: 'Ride Control could not share this workout. Please try again.'
			);
		} finally {
			setSharing(false);
		}
	}, [session, speedUnit]);
	return (
		<div
			className="session-detail-container min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-0 pb-3 sm:px-6 sm:pb-6"
			data-testid="session-detail"
			onScroll={detailScroll.onScroll}
			ref={detailScroll.ref}
		>
			<div className="relative">
				<div
					className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
					data-session-date-time="true"
				>
					<div className="flex items-center gap-2">
						<p className="font-bold text-base text-mint tracking-widest">
							{formatSessionDateRange(session)}
						</p>
						{imported ? (
							<span
								className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 font-bold text-[9px] text-cyan-300 uppercase tracking-wide"
								title={formatSessionImportLabel(session)}
							>
								Imported
							</span>
						) : null}
					</div>
					<h3 className="whitespace-nowrap font-bold text-base tabular-nums">
						{formatSessionTimeRange(session)}
					</h3>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
					<div
						className="contents sm:flex sm:flex-wrap sm:gap-2"
						data-session-file-downloads="true"
					>
						<button
							className="w-full rounded-lg border border-slate-500/40 px-3 py-2 font-semibold text-slate-300 text-xs transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
							disabled={session.history.length === 0}
							onClick={() => downloadSessionFit(session)}
							title={
								session.history.length === 0
									? 'No recorded samples to export'
									: 'Download a FIT activity for Strava and other bike services'
							}
							type="button"
						>
							Download FIT
						</button>
						<button
							className="w-full rounded-lg border border-slate-500/40 px-3 py-2 font-semibold text-slate-300 text-xs transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
							disabled={session.history.length === 0}
							onClick={() => downloadSessionTcx(session)}
							title={
								session.history.length === 0
									? 'No recorded samples to export'
									: 'Download a TCX file for Strava and other bike services'
							}
							type="button"
						>
							Download TCX
						</button>
						<button
							className="w-full rounded-lg border border-cyan-500/40 px-3 py-2 font-semibold text-cyan-300 text-xs transition hover:border-cyan-400 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
							disabled={sharing}
							onClick={shareOnX}
							title="Create a public workout card and share it on X"
							type="button"
						>
							{sharing ? 'Preparing…' : 'Share on X'}
						</button>
					</div>
					{onStartNew || onDelete ? (
						<div
							className="contents sm:ml-auto sm:flex sm:flex-wrap sm:justify-end sm:gap-2"
							data-session-actions="true"
						>
							{onStartNew ? (
								<button
									className="w-full rounded-lg border border-mint/30 px-3 py-2 font-semibold text-mint text-xs transition hover:border-mint/60 hover:bg-mint/5 sm:w-auto"
									onClick={onStartNew}
									title="Start a fresh linked session from this saved course position"
									type="button"
								>
									Start new session
								</button>
							) : null}
							{onDelete ? (
								<button
									className="w-full rounded-lg border border-rose-400/30 px-3 py-2 font-semibold text-rose-300 text-xs transition hover:border-rose-400/60 hover:bg-rose-400/5 sm:w-auto"
									onClick={onDelete}
									type="button"
								>
									Delete session
								</button>
							) : null}
						</div>
					) : null}
				</div>
				{shareError ? (
					<p className="mt-2 text-rose-300 text-xs" role="alert">
						{shareError}
					</p>
				) : null}
				{onCancelDelete && onConfirmDelete ? (
					<DeleteSessionDialog
						deleting={deleting}
						onCancel={onCancelDelete}
						onConfirm={onConfirmDelete}
						open={deleteConfirmationOpen}
					/>
				) : null}
			</div>
			{combinedJourney ? (
				<JourneyMetricScope
					journey={combinedJourney}
					onChange={setShowCombinedJourney}
					onSelectSession={onSelectLinkedSession}
					showCombined={showCombinedJourney}
				/>
			) : null}
			<div className="minimal-summary-grid mt-3 grid">
				<SessionSummary
					calories={displayedSession.calories}
					distance={displayedSession.distance}
					elapsedSeconds={displayedSession.elapsedSeconds}
					speedUnit={speedUnit}
					timeLabel="RECORDED"
				/>
			</div>
			<div className="minimal-session-metric-grid mt-2 grid gap-x-5 gap-y-1">
				{metrics.map((metric) => (
					<SessionMetric key={metric.label} {...metric} />
				))}
			</div>
			{displayedSession.workout && workoutTerrain ? (
				<WorkoutProgress
					elevationTotals={displayedSession.elevationTotals}
					isRiding={false}
					previewTerrain={previewWorkoutTerrain}
					speedUnit={speedUnit}
					terrain={workoutTerrain}
					variant="session"
					workout={displayedSession.workout}
				/>
			) : null}
			<SessionMetadataDetails session={session} speedUnit={speedUnit} />
			<SessionChart
				controlMode={displayedSession.controlMode}
				history={displayedSession.history}
				keyboardEnabled={chartKeyboardEnabled}
				onInspectSample={inspectSample}
				onSelectChartMode={onSelectChartMode}
				route={
					displayedSession.workout ? displayedSession.workout.course.points : EMPTY_ROUTE
				}
				selectedChartMode={selectedChartMode}
				speedUnit={speedUnit}
				variant="session"
			/>
		</div>
	);
}
