import { useSelector } from '@tanstack/react-store';
import { useEffect, useRef } from 'react';
import {
	createRideNotificationSchedule,
	type NotificationRide,
	rideNotificationBody,
	showRideNotification,
} from '../lib/ride-notifications';
import { preferencesStore } from '../stores/preferences-store';
import { rideNotificationStore } from '../stores/ride-notification-store';

export function useRideNotifications(ride: NotificationRide) {
	const settings = useSelector(rideNotificationStore);
	const unit = useSelector(preferencesStore, (state) => state.speedUnit);
	const schedule = useRef(createRideNotificationSchedule());
	const close = useRef<(() => void) | undefined>(undefined);
	const { startedAt, elapsedSeconds, rideDistance, isRiding, ended } = ride;
	const activeSession = useRef(startedAt);

	useEffect(() => {
		if (activeSession.current !== startedAt || !settings.enabled || ended) {
			close.current?.();
			close.current = undefined;
		}
		activeSession.current = startedAt;
		if (
			schedule.current({ elapsedSeconds, ended, isRiding, rideDistance, startedAt }, settings)
		) {
			close.current?.();
			try {
				close.current = showRideNotification(
					rideNotificationBody(elapsedSeconds, rideDistance, unit, settings)
				);
			} catch {
				// Browser/OS notification failure must never interrupt ride recording.
				close.current = undefined;
			}
		}
	}, [startedAt, elapsedSeconds, rideDistance, isRiding, ended, settings, unit]);

	useEffect(() => () => close.current?.(), []);
}
