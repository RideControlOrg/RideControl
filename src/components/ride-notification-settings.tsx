import { useSelector } from '@tanstack/react-store';
import { useEffect, useRef, useState } from 'react';
import {
	type RideNotificationSettings,
	rideNotificationBody,
	rideNotificationSupported,
	showRideNotification,
} from '../lib/ride-notifications';
import { rideNotificationStore } from '../stores/ride-notification-store';
import type { SpeedUnit } from '../types';

export function RideNotificationSettingsPanel({ speedUnit }: { speedUnit: SpeedUnit }) {
	const settings = useSelector(rideNotificationStore);
	const supported = rideNotificationSupported();
	const [permission, setPermission] = useState(supported ? Notification.permission : 'default');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const closePreview = useRef<(() => void) | undefined>(undefined);
	useEffect(() => {
		const refresh = () => setPermission(supported ? Notification.permission : 'default');
		window.addEventListener('focus', refresh);
		return () => {
			window.removeEventListener('focus', refresh);
			closePreview.current?.();
		};
	}, [supported]);

	function save(next: RideNotificationSettings) {
		try {
			rideNotificationStore.actions.update(next);
			setError('');
		} catch {
			setError('Notification settings could not be saved in this browser.');
		}
	}

	async function toggle() {
		if (settings.enabled) {
			closePreview.current?.();
			save({ ...settings, enabled: false });
			return;
		}
		setBusy(true);
		setError('');
		try {
			const result = await Notification.requestPermission();
			setPermission(result);
			if (result === 'granted') {
				save({ ...rideNotificationStore.get(), enabled: true });
			}
		} catch {
			setError('The browser could not enable notifications. Check its site permissions.');
		} finally {
			setBusy(false);
		}
	}

	const preview = rideNotificationBody(
		settings.intervalMinutes * 60,
		settings.intervalMinutes / 3,
		speedUnit,
		settings
	);
	return (
		<fieldset className="mt-6 space-y-4 border-line border-t pt-5">
			<legend className="font-bold text-base">Desktop notifications</legend>
			<p className="text-slate-400 text-sm">
				Short ride updates while you pedal. Changes save immediately in this browser.
			</p>
			<label className="flex items-center gap-3 text-sm">
				<input
					checked={settings.enabled}
					disabled={
						busy || (!settings.enabled && (!supported || permission === 'denied'))
					}
					onChange={toggle}
					type="checkbox"
				/>
				Enable ride notifications
			</label>
			{supported ? null : (
				<p className="text-slate-400 text-sm">
					Desktop notifications require a supported browser and HTTPS.
				</p>
			)}
			{permission === 'denied' ? (
				<p className="text-slate-400 text-sm">
					Notifications are blocked. Allow notifications in your browser’s site settings,
					then enable them here.
				</p>
			) : null}
			<label className="block text-sm">
				Notify me every
				<select
					className="ml-3 border border-line bg-[#10151a] px-3 py-2"
					onChange={(event) =>
						save({ ...settings, intervalMinutes: Number(event.target.value) })
					}
					value={settings.intervalMinutes}
				>
					{[1, 2, 5, 10, 15, 30, 60].map((minutes) => (
						<option key={minutes} value={minutes}>
							{minutes} {minutes === 1 ? 'minute' : 'minutes'}
						</option>
					))}
				</select>
			</label>
			<label className="flex items-center gap-3 text-sm">
				<input
					checked={settings.motivational}
					onChange={(event) => save({ ...settings, motivational: event.target.checked })}
					type="checkbox"
				/>
				Include a little encouragement
			</label>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block text-sm">
					Event name (optional)
					<input
						className="mt-2 w-full border border-line bg-[#10151a] px-3 py-2"
						disabled={!settings.motivational}
						maxLength={40}
						onChange={(event) => save({ ...settings, eventName: event.target.value })}
						placeholder="Tour de Tucson"
						type="text"
						value={settings.eventName}
					/>
				</label>
				<label className="block text-sm">
					Event date (optional)
					<input
						className="mt-2 w-full border border-line bg-[#10151a] px-3 py-2"
						disabled={!settings.motivational}
						max="9999-12-31"
						onChange={(event) => {
							if (event.target.validity.valid) {
								save({ ...settings, eventDate: event.target.value });
							}
						}}
						type="date"
						value={settings.eventDate}
					/>
				</label>
			</div>
			<p className="text-slate-500 text-xs leading-5">
				Add a date to count down in your encouragement. Uses local calendar days; past
				events return to regular encouragement. Clear the date to remove the countdown.
			</p>
			<div className="border border-line p-3">
				<p className="font-semibold text-sm">Example update</p>
				<p className="mt-1 whitespace-pre-line text-slate-300 text-sm">{preview}</p>
			</div>
			<button
				className="border border-line px-3 py-2 font-semibold text-sm disabled:opacity-50"
				disabled={!supported || permission !== 'granted' || !settings.enabled}
				onClick={() => {
					try {
						closePreview.current?.();
						closePreview.current = showRideNotification(preview);
						setError('');
					} catch {
						setError(
							'The browser could not show the notification. Check browser and system notification settings.'
						);
					}
				}}
				type="button"
			>
				Send test notification
			</button>
			<p className="text-slate-500 text-xs leading-5">
				Uses recorded riding time and your display units; pauses do not count. Keep this
				page open. Notifications close after about 10 seconds; browser and system settings
				may affect timing or delivery.
			</p>
			{error ? (
				<p className="text-rose-300 text-sm" role="alert">
					{error}
				</p>
			) : null}
		</fieldset>
	);
}
