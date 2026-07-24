import { useEffect } from 'react';

export interface SessionRecoveryConnections {
	clickConnectedCount: number;
	clickPairedCount: number;
	heartRateConnected: boolean;
	heartRatePaired: boolean;
	rememberedDevicesFailed: boolean;
	rememberedDevicesLoaded: boolean;
	rememberedDevicesSupported: boolean;
	trainerConnected: boolean;
}

export function sessionRecoveryConnectionsReady({
	clickConnectedCount,
	clickPairedCount,
	heartRateConnected,
	heartRatePaired,
	rememberedDevicesFailed,
	rememberedDevicesLoaded,
	rememberedDevicesSupported,
	trainerConnected,
}: SessionRecoveryConnections): boolean {
	const rememberedDevicesReady =
		!rememberedDevicesSupported || rememberedDevicesLoaded || rememberedDevicesFailed;
	return (
		rememberedDevicesReady &&
		trainerConnected &&
		(!heartRatePaired || heartRateConnected) &&
		clickConnectedCount >= clickPairedCount
	);
}

export function useAutoDismissSessionRecoveryNotice(
	visible: boolean,
	connectionsReady: boolean,
	onDismiss: () => void
) {
	useEffect(() => {
		if (visible && connectionsReady) {
			onDismiss();
		}
	}, [connectionsReady, onDismiss, visible]);
}

export function SessionRecoveryNotice({ onDismiss }: { onDismiss: () => void }) {
	return (
		<section
			className="mb-4 flex items-start gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-slate-200 text-sm"
			role="status"
		>
			<p className="min-w-0 flex-1 leading-6">
				Your ride data is safe and has been restored. Bluetooth connections may need to be
				re-established after a reload, so please wait for your devices to reconnect before
				continuing.
			</p>
			<button
				aria-label="Dismiss restored session notice"
				className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-lg text-slate-400 hover:bg-white/5 hover:text-white"
				onClick={onDismiss}
				type="button"
			>
				×
			</button>
		</section>
	);
}
