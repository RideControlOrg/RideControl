import { BUILD_PR_URL, BUILD_TIMESTAMP_UTC, formatBuildTimestamp } from '../lib/build-info';
import { formatAggregateAverage, formatDuration } from '../lib/format';
import type {
	ControlMode,
	MetricSample,
	Metrics,
	ResistanceAdjustmentDirection,
	ResistanceRamp,
	SessionAggregates,
	SpeedUnit,
} from '../types';
import { DevicePairingButton } from './device-pairing';
import { GearControl } from './gear-control';
import { Icon } from './icon';
import { Metric, SmallMetric } from './metrics';
import { ResistanceControl } from './resistance-control';
import { SessionChart } from './session-chart';

interface DashboardSession {
	aggregates: SessionAggregates;
	controlMode: ControlMode;
	elapsedSeconds: number;
	ended: boolean;
	history: MetricSample[];
	isRiding: boolean;
	manuallyPaused: boolean;
	maximums: Metrics;
	rideCalories: number;
	rideDistance: number;
}

interface RideDashboardProps {
	clickPaired: boolean;
	connected: boolean;
	connectedDeviceCount: number;
	dashboardKeyboardEnabled: boolean;
	devicesConnecting: boolean;
	gear: number;
	liveMetrics: Metrics;
	onEndSession: () => void;
	onOpenDevices: () => void;
	onOpenHistory: () => void;
	onOpenShortcuts: () => void;
	onRequestNewSession: () => void;
	onSaveSession: () => void;
	onSelectSpeedUnit: (unit: SpeedUnit) => void;
	onShiftGear: (change: number) => void;
	onTogglePause: () => void;
	onUpdateResistance: (resistance: number) => void;
	pairedDeviceCount: number;
	resistance: number;
	resistanceKeyFlash?: ResistanceAdjustmentDirection;
	resistanceRamp: ResistanceRamp;
	session: DashboardSession;
	sessionIsSaved: boolean;
	shiftFlash?: ResistanceAdjustmentDirection;
	speedUnit: SpeedUnit;
}

export function RideDashboard({
	clickPaired,
	connected,
	connectedDeviceCount,
	dashboardKeyboardEnabled,
	devicesConnecting,
	gear,
	liveMetrics,
	onEndSession,
	onOpenDevices,
	onOpenHistory,
	onOpenShortcuts,
	onRequestNewSession,
	onSaveSession,
	onSelectSpeedUnit,
	onShiftGear,
	onTogglePause,
	onUpdateResistance,
	pairedDeviceCount,
	resistance,
	resistanceKeyFlash,
	resistanceRamp,
	session,
	sessionIsSaved,
	shiftFlash,
	speedUnit,
}: RideDashboardProps) {
	const unitFactor = speedUnit === 'mph' ? 0.621_371 : 1;
	const distanceUnit = speedUnit === 'mph' ? 'mi' : 'km';
	const displayedSpeed = liveMetrics.speed * unitFactor;
	const displayedDistance = session.rideDistance * unitFactor;
	const displayedMaximumSpeed = session.maximums.speed * unitFactor;
	const averageSpeed =
		session.elapsedSeconds > 0 ? session.rideDistance / (session.elapsedSeconds / 3600) : 0;
	const displayedAverageSpeed = averageSpeed * unitFactor;
	const controlValue = clickPaired ? gear : resistance;
	let sessionControlLabel = 'Auto paused';
	let sessionControlIcon = 'stop';
	if (session.isRiding) {
		sessionControlLabel = 'Pause';
		sessionControlIcon = 'pause';
	}
	if (session.manuallyPaused) {
		sessionControlLabel = 'Resume';
		sessionControlIcon = 'play';
	}

	return (
		<div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					{session.ended ? (
						<>
							{sessionIsSaved ? null : (
								<button
									className="h-10 rounded-lg border border-mint/40 bg-mint/10 px-3 font-semibold text-mint text-xs hover:bg-mint/15"
									onClick={onSaveSession}
									type="button"
								>
									Save session
								</button>
							)}
							<button
								className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
								onClick={onRequestNewSession}
								type="button"
							>
								Start new session
							</button>
						</>
					) : (
						<>
							<button
								className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 font-semibold text-xs transition ${session.isRiding ? 'border-mint/40 bg-mint/10 text-mint' : 'border-line bg-[#12171d] text-slate-400'}`}
								onClick={onTogglePause}
								type="button"
							>
								<Icon className="h-4 w-4" name={sessionControlIcon} />
								{sessionControlLabel}
							</button>
							<button
								className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-400 text-xs hover:border-rose-400/50 hover:text-rose-300"
								onClick={onEndSession}
								type="button"
							>
								End session
							</button>
						</>
					)}
				</div>
				<div className="flex items-center gap-3">
					<button
						className="h-10 rounded-lg border border-line bg-[#12171d] px-3 font-semibold text-slate-300 text-xs hover:border-slate-500 hover:text-white"
						onClick={onOpenHistory}
						type="button"
					>
						History
					</button>
					<div className="flex h-10 rounded-lg border border-line bg-[#10151a] p-1">
						{(['kmh', 'mph'] as const).map((unit) => (
							<button
								className={`rounded px-2.5 py-1 font-bold text-[11px] ${speedUnit === unit ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
								key={unit}
								onClick={() => onSelectSpeedUnit(unit)}
								type="button"
							>
								{unit === 'kmh' ? 'KM/H' : 'MPH'}
							</button>
						))}
					</div>
					<button
						aria-label="Show keyboard controls"
						className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-[#12171d] font-bold text-slate-400 text-sm hover:border-slate-500 hover:text-white"
						onClick={onOpenShortcuts}
						type="button"
					>
						?
					</button>
					<DevicePairingButton
						connectedCount={connectedDeviceCount}
						connecting={devicesConnecting}
						onClick={onOpenDevices}
						pairedCount={pairedDeviceCount}
					/>
				</div>
			</div>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Metric
					accent="sky"
					average={displayedAverageSpeed.toFixed(1)}
					icon="speed"
					label="SPEED"
					maximum={displayedMaximumSpeed.toFixed(1)}
					unit={speedUnit === 'mph' ? 'mph' : 'km/h'}
					value={displayedSpeed.toFixed(1)}
				/>
				<Metric
					accent="yellow"
					average={formatAggregateAverage(session.aggregates.power, 0)}
					icon="bolt"
					label="POWER"
					maximum={String(Math.round(session.maximums.power))}
					unit="watts"
					value={String(liveMetrics.power)}
				/>
				<Metric
					accent="violet"
					average={formatAggregateAverage(session.aggregates.cadence, 0)}
					icon="cadence"
					label="CADENCE"
					maximum={String(Math.round(session.maximums.cadence))}
					unit="rpm"
					value={String(Math.round(liveMetrics.cadence))}
				/>
				<Metric
					accent="rose"
					average={formatAggregateAverage(session.aggregates.heartRate, 0)}
					icon="heart"
					label="HEART RATE"
					maximum={String(Math.round(session.maximums.heartRate))}
					unit="bpm"
					value={String(liveMetrics.heartRate || '—')}
				/>
			</section>

			<section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.55fr]">
				<div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
					<div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-slate-500 bg-[#12171d]">
						<SmallMetric label="TIME" value={formatDuration(session.elapsedSeconds)} />
						<SmallMetric
							label="DISTANCE"
							value={`${displayedDistance.toFixed(2)} ${distanceUnit}`}
						/>
						<SmallMetric
							label="CALORIES"
							value={`${Math.round(session.rideCalories)} kcal`}
						/>
					</div>
					<SessionChart
						controlMode={session.controlMode}
						history={session.history}
						keyboardEnabled={dashboardKeyboardEnabled}
						route={[]}
						speedUnit={speedUnit}
					/>
				</div>
				<div className="self-start rounded-2xl border border-line bg-panel p-4 sm:p-5">
					<div className="flex items-center justify-between gap-4">
						<h2 className="font-bold text-lg">
							{clickPaired ? 'Virtual shifting' : 'Resistance control'}
						</h2>
						<div className="text-right">
							<output className="font-bold text-3xl text-mint tabular-nums tracking-tight">
								{controlValue}
								<span className="ml-1 text-slate-500 text-xs">
									{clickPaired ? 'of 24' : '%'}
								</span>
							</output>
						</div>
					</div>
					{clickPaired ? (
						<GearControl
							disabled={!connected}
							gear={gear}
							onChange={onShiftGear}
							shiftFlash={shiftFlash}
						/>
					) : (
						<ResistanceControl
							disabled={!connected}
							keyboardFlash={resistanceKeyFlash}
							max={100}
							min={0}
							onChange={onUpdateResistance}
							ramp={resistanceRamp}
							step={1}
							value={resistance}
						/>
					)}
				</div>
			</section>
		</div>
	);
}

export function AppFooter({ onOpenWelcome }: { onOpenWelcome: () => void }) {
	return (
		<footer className="fixed right-4 bottom-3 left-4 z-20 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-600">
			<button
				className="font-semibold tracking-wide transition hover:text-slate-400"
				onClick={onOpenWelcome}
				type="button"
			>
				Ride Control
			</button>
			<span aria-hidden="true">·</span>
			<a
				className="transition hover:text-slate-400"
				href="https://github.com/lookfirst"
				rel="noreferrer"
				target="_blank"
			>
				GitHub
			</a>
			<span aria-hidden="true">·</span>
			<a
				className="transition hover:text-slate-400"
				href="https://github.com/sponsors/lookfirst"
				rel="noreferrer"
				target="_blank"
			>
				Sponsor
			</a>
			<span aria-hidden="true">·</span>
			<a
				className="transition hover:text-slate-400"
				href={BUILD_PR_URL}
				rel="noreferrer"
				target="_blank"
				title={`Built from UTC timestamp ${BUILD_TIMESTAMP_UTC}`}
			>
				<time dateTime={BUILD_TIMESTAMP_UTC}>
					{formatBuildTimestamp(BUILD_TIMESTAMP_UTC)}
				</time>
			</a>
		</footer>
	);
}
