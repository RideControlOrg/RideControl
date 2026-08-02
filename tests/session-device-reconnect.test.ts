import { describe, expect, test } from 'bun:test';
import { createSessionDeviceReconnectController } from '../src/lib/session-device-reconnect';

describe('session device reconnect', () => {
	test('reconnects remembered offline devices once at the start of every session', () => {
		const reconnects: string[] = [];
		const trainer = {
			busy: false,
			connected: false,
			paired: true,
			reconnect: () => reconnects.push('trainer'),
		};
		const connections = [
			trainer,
			{
				busy: false,
				connected: true,
				paired: true,
				reconnect: () => reconnects.push('heart-rate'),
			},
			{
				busy: false,
				connected: false,
				paired: true,
				reconnect: () => reconnects.push('click'),
			},
			{
				busy: false,
				connected: false,
				paired: false,
				reconnect: () => reconnects.push('unpaired'),
			},
			{
				busy: true,
				connected: false,
				paired: true,
				reconnect: () => reconnects.push('already-connecting'),
			},
		];
		const controller = createSessionDeviceReconnectController();

		expect(controller.reconnectForSession(100, true, connections)).toBe(0);
		expect(controller.reconnectForSession(100, false, connections)).toBe(2);
		expect(controller.reconnectForSession(100, false, connections)).toBe(0);
		expect(reconnects).toEqual(['trainer', 'click']);

		trainer.connected = true;
		expect(controller.reconnectForSession(100, true, connections)).toBe(0);
		expect(controller.reconnectForSession(200, false, connections)).toBe(1);
		expect(reconnects).toEqual(['trainer', 'click', 'click']);
	});
});
