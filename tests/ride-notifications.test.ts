import { describe, expect, test } from 'bun:test';
import {
	createRideNotificationSchedule,
	DEFAULT_RIDE_NOTIFICATION_SETTINGS,
	rideNotificationBody,
	storedRideNotificationSettings,
} from '../src/lib/ride-notifications';

const settings = { ...DEFAULT_RIDE_NOTIFICATION_SETTINGS, enabled: true };
const ride = { elapsedSeconds: 0, ended: false, isRiding: true, rideDistance: 0, startedAt: 1 };

describe('ride notifications', () => {
	test('counts recorded time, skips paused and ended rides, and never repeats a milestone', () => {
		const due = createRideNotificationSchedule();
		expect(due(ride, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 299 }, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 300, isRiding: false }, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 300 }, settings)).toBe(true);
		expect(due({ ...ride, elapsedSeconds: 300 }, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 600, ended: true }, settings)).toBe(false);
	});

	test('resets for new rides, interval changes and enabling without replaying old milestones', () => {
		const due = createRideNotificationSchedule();
		expect(due({ ...ride, elapsedSeconds: 900 }, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 1200 }, settings)).toBe(true);
		expect(due({ ...ride, startedAt: 2 }, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 300, startedAt: 2 }, settings)).toBe(true);
		expect(
			due({ ...ride, elapsedSeconds: 300, startedAt: 2 }, { ...settings, intervalMinutes: 1 })
		).toBe(false);
		expect(
			due({ ...ride, elapsedSeconds: 360, startedAt: 2 }, { ...settings, intervalMinutes: 1 })
		).toBe(true);
		expect(due(ride, { ...settings, enabled: false })).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 500 }, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 800 }, settings)).toBe(true);
	});

	test('coalesces delayed ticks into one current update', () => {
		const due = createRideNotificationSchedule();
		due(ride, settings);
		expect(due({ ...ride, elapsedSeconds: 1800 }, settings)).toBe(true);
		expect(due({ ...ride, elapsedSeconds: 1801 }, settings)).toBe(false);
		expect(due({ ...ride, elapsedSeconds: 2100 }, settings)).toBe(true);
	});

	test('formats concise summaries in the chosen units with optional encouragement', () => {
		expect(
			rideNotificationBody(300, 1.609_344, 'mph', { ...settings, motivational: false })
		).toBe('5 min ridden · 1.0 mi');
		expect(
			rideNotificationBody(300, 1.609_344, 'kmh', { ...settings, motivational: false })
		).toBe('5 min ridden · 1.6 km');
		expect(rideNotificationBody(300, 1.609_344, 'mph', settings)).toStartWith(
			'5 min ridden · 1.0 mi\n'
		);
	});

	test('counts calendar days across DST and celebrates event day without negative countdowns', () => {
		const event = { ...settings, eventDate: '2027-03-15', eventName: 'Spring ride' };
		for (const now of [new Date(2027, 2, 13, 0, 1), new Date(2027, 2, 13, 23, 59)]) {
			expect(rideNotificationBody(300, 2, 'kmh', event, now)).toContain(
				'2 days until Spring ride.'
			);
		}
		expect(rideNotificationBody(300, 2, 'kmh', event, new Date(2027, 2, 14, 23))).toContain(
			'1 day until Spring ride.'
		);
		expect(rideNotificationBody(300, 2, 'kmh', event, new Date(2027, 2, 15, 23))).toContain(
			'Spring ride is today.'
		);
		expect(rideNotificationBody(300, 2, 'kmh', event, new Date(2027, 2, 16))).not.toContain(
			'Spring ride'
		);
		expect(
			rideNotificationBody(
				300,
				2,
				'kmh',
				{ ...event, motivational: false },
				new Date(2027, 2, 13)
			)
		).toBe('5 min ridden · 2.0 km');
	});

	test('handles leap days, unnamed events, and cleared countdowns', () => {
		const now = new Date(2028, 1, 28, 23);
		const event = { ...settings, eventDate: '2028-03-01' };
		expect(rideNotificationBody(300, 2, 'kmh', event, now)).toContain(
			'2 days until your event.'
		);
		expect(rideNotificationBody(300, 2, 'kmh', { ...event, eventDate: '' }, now)).not.toContain(
			'until'
		);
	});

	test('preserves existing notification preferences when adding event fields', () => {
		const restored = storedRideNotificationSettings({
			getItem: () => '{"enabled":true,"intervalMinutes":10,"motivational":false}',
		});
		expect(restored).toEqual({
			...settings,
			eventDate: '',
			eventName: '',
			intervalMinutes: 10,
			motivational: false,
		});
		const event = { ...settings, eventDate: '2028-02-29', eventName: 'Century ride' };
		expect(storedRideNotificationSettings({ getItem: () => JSON.stringify(event) })).toEqual(
			event
		);
		expect(
			storedRideNotificationSettings({
				getItem: () => JSON.stringify({ ...event, eventDate: '2027-02-29' }),
			})
		).toEqual(DEFAULT_RIDE_NOTIFICATION_SETTINGS);
	});

	test('rejects invalid persisted settings without enabling notifications', () => {
		for (const value of [
			'invalid',
			'{}',
			'{"enabled":true,"intervalMinutes":0,"motivational":true}',
		]) {
			expect(storedRideNotificationSettings({ getItem: () => value })).toEqual(
				DEFAULT_RIDE_NOTIFICATION_SETTINGS
			);
		}
		expect(storedRideNotificationSettings({ getItem: () => JSON.stringify(settings) })).toEqual(
			settings
		);
	});
});
