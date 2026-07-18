import { useEffect, useState } from 'react';
import { CHROME_BLUETOOTH_FLAGS_URL, CHROME_BLUETOOTH_PERMISSION_MESSAGE } from '../constants';
import { NOTICE_AUTO_DISMISS_SECONDS, noticeSecondsRemaining } from '../lib/notification';

const COUNTDOWN_RADIUS = 14;
const COUNTDOWN_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RADIUS;

export function NotificationCountdown({ connected }: { connected: boolean }) {
	const [secondsRemaining, setSecondsRemaining] = useState(NOTICE_AUTO_DISMISS_SECONDS);

	useEffect(() => {
		const startedAt = Date.now();
		const interval = window.setInterval(() => {
			setSecondsRemaining(noticeSecondsRemaining(Date.now() - startedAt));
		}, 250);
		return () => window.clearInterval(interval);
	}, []);

	const progress = secondsRemaining / NOTICE_AUTO_DISMISS_SECONDS;
	return (
		<span
			aria-label={`${secondsRemaining} seconds remaining`}
			aria-live="off"
			className="relative grid h-9 w-9 shrink-0 place-items-center"
			role="timer"
		>
			<svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 36 38">
				<path d="M15 3h6M18 3v3" fill="none" stroke="currentColor" strokeWidth="2" />
				<circle
					className="stroke-slate-600"
					cx="18"
					cy="21"
					fill="none"
					r={COUNTDOWN_RADIUS}
					strokeWidth="2.5"
				/>
				<circle
					className={`transition-[stroke-dashoffset] duration-200 ${connected ? 'stroke-mint' : 'stroke-lime'}`}
					cx="18"
					cy="21"
					fill="none"
					r={COUNTDOWN_RADIUS}
					strokeDasharray={COUNTDOWN_CIRCUMFERENCE}
					strokeDashoffset={COUNTDOWN_CIRCUMFERENCE * (1 - progress)}
					strokeLinecap="round"
					strokeWidth="2.5"
					transform="rotate(-90 18 21)"
				/>
			</svg>
			<span className="pt-1 font-bold font-mono text-[9px] text-slate-200">
				{secondsRemaining}
			</span>
		</span>
	);
}

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
				<NotificationCountdown connected={connected} key={notice} />
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
