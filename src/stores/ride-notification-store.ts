import { createStore } from '@tanstack/react-store';
import {
	DEFAULT_RIDE_NOTIFICATION_SETTINGS,
	RIDE_NOTIFICATION_STORAGE_KEY,
	type RideNotificationSettings,
	storedRideNotificationSettings,
} from '../lib/ride-notifications';

export const rideNotificationStore = createStore(
	globalThis.localStorage
		? storedRideNotificationSettings(globalThis.localStorage)
		: { ...DEFAULT_RIDE_NOTIFICATION_SETTINGS },
	({ setState }) => ({
		update: (settings: RideNotificationSettings) => {
			localStorage.setItem(RIDE_NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
			setState(() => settings);
		},
	})
);
