import { Icon } from './icon';

export function ConnectionControl({
	busy,
	connected,
	deviceName,
	onCancel,
	onConnect,
	onDisconnect,
	status,
}: {
	busy: boolean;
	connected: boolean;
	deviceName?: string;
	onCancel: () => void;
	onConnect: () => void;
	onDisconnect: () => void;
	status: string;
}) {
	if (busy && !connected) {
		return (
			<div className="flex items-center gap-2">
				<div
					aria-live="polite"
					className="inline-flex h-10 items-center gap-2 px-1 text-sm font-medium text-slate-400"
					role="status"
				>
					<span className="functional-status-pulse bg-lime h-2 w-2 shrink-0 rounded-full" />
					{status}
				</div>
				<button
					className="border-line h-10 rounded-lg border px-3 text-sm font-semibold text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
					onClick={onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
		);
	}

	if (connected) {
		return (
			<button
				className="border-mint/30 bg-mint/5 inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold text-slate-100 transition hover:border-rose-400/50 hover:bg-rose-400/5"
				onClick={onDisconnect}
				type="button"
			>
				<span className="bg-mint h-2 w-2 shrink-0 rounded-full shadow-[0_0_12px_#adf5bd]" />
				<span className="max-w-36 truncate">{deviceName ?? 'Trainer'}</span>
				<span className="border-line border-l pl-2 text-xs text-slate-400">Disconnect</span>
			</button>
		);
	}

	return (
		<button
			className="border-lime bg-lime text-ink inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold transition hover:bg-[#e4ff9c]"
			onClick={onConnect}
			type="button"
		>
			<Icon className="h-4 w-4" name="bluetooth" />
			Connect trainer
		</button>
	);
}
