import { CHROME_BLUETOOTH_FLAGS_URL, CHROME_BLUETOOTH_PERMISSION_MESSAGE } from '../constants';

export function Notification({
	connected,
	notice,
	onDismiss,
}: {
	connected: boolean;
	notice: string;
	onDismiss: () => void;
}) {
	if (!notice) {
		return null;
	}
	return (
		<div
			className="fixed bottom-5 left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-600 bg-[#20262e]/95 p-3 text-slate-100 text-sm shadow-2xl"
			role="status"
		>
			<div className="flex items-center gap-3">
				<span
					className={`h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-mint' : 'bg-lime'}`}
				/>
				<div className="min-w-0 flex-1 leading-5">
					{notice === CHROME_BLUETOOTH_PERMISSION_MESSAGE ? (
						<div>
							<p>Chrome has not enabled persistent Bluetooth permissions.</p>
							<a
								className="mt-1 block break-all font-semibold text-mint underline"
								href={CHROME_BLUETOOTH_FLAGS_URL}
								rel="noreferrer"
								target="_blank"
							>
								{CHROME_BLUETOOTH_FLAGS_URL}
							</a>
							<p className="mt-1 text-slate-300">
								Enable the setting, relaunch Chrome, then pair once.
							</p>
						</div>
					) : (
						<p>{notice}</p>
					)}
				</div>
				<button
					aria-label="Dismiss notification"
					className="grid h-7 w-7 place-items-center rounded-md text-lg text-slate-400"
					onClick={onDismiss}
					type="button"
				>
					×
				</button>
			</div>
		</div>
	);
}
