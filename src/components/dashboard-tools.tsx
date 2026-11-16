import { DevicePairingButton } from './device-pairing';

export function DashboardTools({
	connectedDeviceCount,
	devicesConnecting,
	onOpenDevices,
	onOpenHistory,
	onOpenProfile,
	onOpenShortcuts,
	pairedDeviceCount,
}: {
	connectedDeviceCount: number;
	devicesConnecting: boolean;
	onOpenDevices: () => void;
	onOpenHistory: () => void;
	onOpenProfile: () => void;
	onOpenShortcuts: () => void;
	pairedDeviceCount: number;
}) {
	return (
		<div className="flex max-w-full flex-wrap items-center justify-end gap-2">
			<button
				className="border-line h-10 rounded-lg border bg-[#12171d] px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
				onClick={onOpenHistory}
				type="button"
			>
				Sessions
			</button>
			<button
				className="border-line h-10 rounded-lg border bg-[#12171d] px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
				onClick={onOpenProfile}
				type="button"
			>
				Profile
			</button>
			<button
				aria-label="Show keyboard controls"
				className="border-line grid h-10 w-10 place-items-center rounded-lg border bg-[#12171d] text-sm font-bold text-slate-400 hover:border-slate-500 hover:text-white"
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
	);
}
