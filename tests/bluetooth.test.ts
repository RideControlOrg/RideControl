import { describe, expect, test } from 'bun:test';
import {
	connectGatt,
	findRememberedKickr,
	parseCrankCadence,
	parseIndoorBikeData,
	recordMetricActivity,
	recordPedaling,
	resistanceCommand,
} from '../src/lib/bluetooth';

describe('Bluetooth data utilities', () => {
	test('tracks meaningful pedaling activity', () => {
		const last = { current: 2 };
		recordPedaling(last, false, 10);
		expect(last.current).toBe(2);
		recordMetricActivity(last, { cadence: 2 }, 20);
		expect(last.current).toBe(20);
		recordMetricActivity(last, { power: 6 }, 30);
		expect(last.current).toBe(30);
	});

	test('parses an FTMS indoor bike packet', () => {
		const buffer = new ArrayBuffer(17);
		const view = new DataView(buffer);
		view.setUint16(0, 0x3_54, true);
		view.setUint16(2, 3250, true);
		view.setUint16(4, 180, true);
		view.setUint8(6, 0x39);
		view.setUint8(7, 0x30);
		view.setUint8(8, 0);
		view.setInt16(9, 245, true);
		view.setUint16(11, 321, true);
		view.setUint16(13, 0, true);
		view.setUint8(15, 0);
		view.setUint8(16, 154);

		expect(parseIndoorBikeData(view)).toEqual({
			metrics: {
				cadence: 90,
				calories: 321,
				distance: 12.345,
				heartRate: 154,
				power: 245,
				speed: 32.5,
			},
			reportsDistance: true,
		});
	});

	test('parses CSC cadence and the first baseline packet', () => {
		const buffer = new ArrayBuffer(5);
		const view = new DataView(buffer);
		view.setUint8(0, 2);
		view.setUint16(1, 12, true);
		view.setUint16(3, 2024, true);
		expect(parseCrankCadence(view)).toEqual({
			current: { revolutions: 12, time: 2024 },
		});
		expect(parseCrankCadence(view, { revolutions: 10, time: 1000 })).toEqual({
			cadence: 120,
			current: { revolutions: 12, time: 2024 },
		});
	});

	test('encodes resistance using the trainer range', () => {
		expect(resistanceCommand(50, { max: 30, min: -10 })).toEqual([4, 100, 0]);
	});

	test('prefers a saved device, then a named KICKR, then a sole device', async () => {
		const devices = [
			{ id: 'one', name: 'Other' },
			{ id: 'two', name: 'KICKR CORE' },
		] as BluetoothDevice[];
		const bluetooth = {
			getDevices: async () => devices,
		} as Bluetooth;
		expect(await findRememberedKickr(bluetooth, { getItem: () => 'one' })).toBe(devices[0]);
		expect(await findRememberedKickr(bluetooth, { getItem: () => null })).toBe(devices[1]);
	});

	test('connects GATT and reports status', async () => {
		const server = {} as BluetoothRemoteGATTServer;
		const statuses: string[] = [];
		const device = {
			gatt: { connect: async () => server },
		} as unknown as BluetoothDevice;
		expect(await connectGatt(device, false, (status) => statuses.push(status))).toBe(server);
		expect(statuses).toEqual(['Connecting…']);
	});

	test('rejects devices without a GATT server', async () => {
		await expect(connectGatt({} as BluetoothDevice, false, () => undefined)).rejects.toThrow(
			'does not expose a GATT server'
		);
	});
});
