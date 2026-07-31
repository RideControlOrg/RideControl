import { Icon } from './icon';

export function SessionControls({
	ended,
	isRiding,
	manuallyPaused,
	onEnd,
	onOpenWorkouts,
	onRequestNew,
	onSave,
	onTogglePause,
	saveResolved,
	workoutName,
	workoutSelectionLocked,
}: {
	ended: boolean;
	isRiding: boolean;
	manuallyPaused: boolean;
	onEnd: () => void;
	onOpenWorkouts: () => void;
	onRequestNew: () => void;
	onSave: () => void;
	onTogglePause: () => void;
	saveResolved: boolean;
	workoutName?: string;
	workoutSelectionLocked: boolean;
}) {
	const workoutButton = (
		<button
			className={`h-10 rounded-lg border bg-[#12171d] px-3 font-semibold text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${workoutName ? 'border-mint/30 text-mint' : 'border-line text-slate-300 hover:border-slate-500 hover:text-white'}`}
			disabled={workoutSelectionLocked}
			onClick={onOpenWorkouts}
			title={
				workoutSelectionLocked
					? 'End the current session before changing the workout'
					: undefined
			}
			type="button"
		>
			{workoutName ?? 'Workouts'}
		</button>
	);
	if (ended) {
		return (
			<div className="flex flex-wrap items-center gap-2">
				{saveResolved ? null : (
					<button
						className="h-10 rounded-lg border border-mint/40 bg-mint/10 px-3 font-semibold text-mint text-xs hover:bg-mint/15"
						onClick={onSave}
						type="button"
					>
						Save session
					</button>
				)}
				<button
					className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
					onClick={onRequestNew}
					title={
						workoutName
							? 'Start a fresh linked session from this course position'
							: undefined
					}
					type="button"
				>
					Start new session
				</button>
				{workoutButton}
			</div>
		);
	}

	let controlLabel = 'Auto paused';
	let controlIcon = 'stop';
	let sessionState = 'auto-paused';
	if (isRiding) {
		controlLabel = 'Pause';
		controlIcon = 'pause';
		sessionState = 'riding';
	}
	if (manuallyPaused) {
		controlLabel = 'Resume';
		controlIcon = 'play';
		sessionState = 'paused';
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			<button
				className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 font-semibold text-xs transition ${isRiding ? 'border-mint/40 bg-mint/10 text-mint' : 'border-amber-300/50 bg-amber-300/10 text-amber-300 hover:bg-amber-300/15'}`}
				data-session-state={sessionState}
				onClick={onTogglePause}
				type="button"
			>
				<Icon className="h-4 w-4" name={controlIcon} />
				{controlLabel}
			</button>
			<button
				className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-400 text-xs hover:border-rose-400/50 hover:text-rose-300"
				onClick={onEnd}
				type="button"
			>
				End session
			</button>
			{workoutButton}
		</div>
	);
}
