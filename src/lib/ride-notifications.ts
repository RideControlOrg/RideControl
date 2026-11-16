import { z } from 'zod';
import type { SpeedUnit } from '../types';
import { formatDistance, SECONDS_PER_MINUTE } from './units';

export const RIDE_NOTIFICATION_STORAGE_KEY = 'ride-notifications';
export const RIDE_NOTIFICATION_LIFETIME_MS = 10_000;
export const rideNotificationSettingsSchema = z.object({
	enabled: z.boolean(),
	eventDate: z.union([z.literal(''), z.iso.date()]).default(''),
	eventName: z.string().max(40).default(''),
	intervalMinutes: z.number().int().min(1).max(60),
	motivational: z.boolean(),
});
export type RideNotificationSettings = z.infer<typeof rideNotificationSettingsSchema>;
export const DEFAULT_RIDE_NOTIFICATION_SETTINGS: RideNotificationSettings = {
	enabled: false,
	eventDate: '',
	eventName: '',
	intervalMinutes: 5,
	motivational: true,
};
const encouragements = [
	'Keep it rolling!',
	'One pedal stroke at a time.',
	'You’re making progress.',
	'Your effort adds up.',
];

export function storedRideNotificationSettings(
	storage: Pick<Storage, 'getItem'>
): RideNotificationSettings {
	try {
		const parsed = rideNotificationSettingsSchema.safeParse(
			JSON.parse(storage.getItem(RIDE_NOTIFICATION_STORAGE_KEY) ?? 'null')
		);
		return parsed.success ? parsed.data : { ...DEFAULT_RIDE_NOTIFICATION_SETTINGS };
	} catch {
		return { ...DEFAULT_RIDE_NOTIFICATION_SETTINGS };
	}
}

export function rideNotificationSupported(): boolean {
	return globalThis.isSecureContext && typeof globalThis.Notification === 'function';
}

export function rideNotificationBody(
	elapsedSeconds: number,
	distance: number,
	unit: SpeedUnit,
	settings: RideNotificationSettings,
	now = new Date()
): string {
	const minutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
	const progress = `${minutes} min ridden · ${formatDistance(distance, unit, 1)}`;
	if (!settings.motivational) {
		return progress;
	}
	if (settings.eventDate) {
		// Compare calendar-day indices, not local instants: DST days aren't always 24 hours.
		const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
		const days = Math.round((Date.parse(settings.eventDate) - today) / 86_400_000);
		const event = settings.eventName.trim() || 'your event';
		if (days === 0) {
			return `${progress}\n${event} is today. You’ve got this!`;
		}
		if (days > 0) {
			return `${progress}\n${days} ${days === 1 ? 'day' : 'days'} until ${event}. Keep it rolling!`;
		}
	}
	return `${progress}\n${encouragements[minutes % encouragements.length]}`;
}

export interface NotificationRide {
	elapsedSeconds: number;
	ended: boolean;
	isRiding: boolean;
	rideDistance: number;
	startedAt: number;
}

// Recorded ride time excludes manual pauses, inactivity, and the end-session dialog.
export function createRideNotificationSchedule() {
	let startedAt: number | undefined;
	let interval = 0;
	let previousElapsed = 0;
	let nextAt = 0;
	let enabled = false;
	return (ride: NotificationRide, settings: RideNotificationSettings): boolean => {
		const seconds = settings.intervalMinutes * SECONDS_PER_MINUTE;
		const reset =
			startedAt !== ride.startedAt ||
			interval !== seconds ||
			enabled !== settings.enabled ||
			ride.elapsedSeconds < previousElapsed;
		({ startedAt } = ride);
		interval = seconds;
		({ enabled } = settings);
		previousElapsed = ride.elapsedSeconds;
		if (reset) {
			nextAt = ride.elapsedSeconds + seconds;
		}
		if (!(enabled && ride.isRiding) || ride.ended || ride.elapsedSeconds < nextAt) {
			return false;
		}
		// A delayed background update sends one current summary, never a backlog.
		nextAt = ride.elapsedSeconds + seconds;
		return true;
	};
}

export function showRideNotification(body: string): () => void {
	if (!rideNotificationSupported() || Notification.permission !== 'granted') {
		return () => undefined;
	}
	const notification = new Notification('Ride Control', {
		body,
		requireInteraction: false,
		silent: true,
		tag: 'ride-progress',
	});
	const timer = setTimeout(() => notification.close(), RIDE_NOTIFICATION_LIFETIME_MS);
	return () => {
		clearTimeout(timer);
		notification.close();
	};
}
