import { Icon } from './icon';

export function ConnectionControl({
	connected,
	deviceName,
	onClick,
	status,
}: {
	connected: boolean;
	deviceName?: string;
	onClick: () => void;
	status: string;
}) {
	const busy = !connected && status.endsWith('…');
	let buttonClass = 'border-lime bg-lime text-ink hover:bg-[#e4ff9c]';
	let dotClass = 'bg-ink/50';
	if (busy) {
		buttonClass = 'cursor-wait border-line bg-[#10151a] text-slate-300';
		dotClass = 'animate-pulse bg-lime';
	}
	if (connected) {
		buttonClass =
			'border-mint/30 bg-mint/5 text-slate-100 hover:border-rose-400/50 hover:bg-rose-400/5';
		dotClass = 'bg-mint shadow-[0_0_12px_#adf5bd]';
	}
	return (
		<button
			className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 font-semibold text-sm transition ${buttonClass}`}
			disabled={busy}
			onClick={onClick}
			type="button"
		>
			<span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
			{connected ? (
				<>
					<span className="max-w-36 truncate">{deviceName ?? 'Trainer'}</span>
					<span className="border-line border-l pl-2 text-slate-400 text-xs">
						Disconnect
					</span>
				</>
			) : (
				<>
					<Icon className="h-4 w-4" name="bluetooth" />
					{busy ? status : 'Connect trainer'}
				</>
			)}
		</button>
	);
}
