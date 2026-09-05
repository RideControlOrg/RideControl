import { describe, expect, test } from 'bun:test';
import { createBluetoothGattCoordinator } from '../src/lib/bluetooth-gatt-coordinator';

function bluetoothDevice(
	id: string,
	connect: () => Promise<BluetoothRemoteGATTServer>,
	onDisconnect: () => void = () => undefined
): BluetoothDevice {
	return {
		gatt: {
			connect,
			connected: false,
			disconnect: onDisconnect,
		},
		id,
	} as unknown as BluetoothDevice;
}

describe('Bluetooth GATT coordinator', () => {
	test('establishes different device connections in parallel', async () => {
		const coordinator = createBluetoothGattCoordinator();
		const operations: string[] = [];
		let finishFirst: (() => void) | undefined;
		const firstServer = {} as BluetoothRemoteGATTServer;
		const secondServer = {} as BluetoothRemoteGATTServer;
		const first = bluetoothDevice(
			'trainer',
			() =>
				new Promise((resolve) => {
					operations.push('trainer');
					finishFirst = () => resolve(firstServer);
				})
		);
		const second = bluetoothDevice('heart-rate', () => {
			operations.push('heart-rate');
			return Promise.resolve(secondServer);
		});

		const firstConnection = coordinator.connect(first, 1000, 'trainer timeout');
		const secondConnection = coordinator.connect(second, 1000, 'heart-rate timeout');
		await Promise.resolve();
		expect(operations).toEqual(['trainer', 'heart-rate']);

		finishFirst?.();
		expect(await firstConnection).toBe(firstServer);
		expect(await secondConnection).toBe(secondServer);
	});

	test('deduplicates simultaneous requests for the same device', async () => {
		const coordinator = createBluetoothGattCoordinator();
		let attempts = 0;
		const server = {} as BluetoothRemoteGATTServer;
		const device = bluetoothDevice('click-plus', () => {
			attempts += 1;
			return Promise.resolve(server);
		});

		const first = coordinator.connect(device, 1000, 'timeout');
		const duplicate = coordinator.connect(device, 1000, 'timeout');
		expect(first).toBe(duplicate);
		expect(await duplicate).toBe(server);
		expect(attempts).toBe(1);
	});

	test('disconnects a failed device without blocking another handshake', async () => {
		const coordinator = createBluetoothGattCoordinator();
		const operations: string[] = [];
		const failed = bluetoothDevice(
			'click-minus',
			() => {
				operations.push('connect-click-minus');
				return Promise.reject(new Error('unavailable'));
			},
			() => operations.push('disconnect-click-minus')
		);
		const server = {} as BluetoothRemoteGATTServer;
		const ready = bluetoothDevice('trainer', () => {
			operations.push('connect-trainer');
			return Promise.resolve(server);
		});

		const failedConnection = coordinator.connect(failed, 1000, 'timeout');
		const readyConnection = coordinator.connect(ready, 1000, 'timeout');
		expect(await readyConnection).toBe(server);
		await expect(failedConnection).rejects.toThrow('unavailable');
		expect(operations).toContain('disconnect-click-minus');
		expect(operations.slice(0, 2)).toEqual(['connect-click-minus', 'connect-trainer']);
	});

	test('cancels an obsolete handshake without its late success disconnecting the replacement', async () => {
		const coordinator = createBluetoothGattCoordinator();
		const oldHandshake = Promise.withResolvers<BluetoothRemoteGATTServer>();
		let attempts = 0;
		let disconnects = 0;
		const server = {
			connected: false,
			disconnect: () => {
				disconnects += 1;
				Object.assign(server, { connected: false });
			},
		} as BluetoothRemoteGATTServer;
		const device = bluetoothDevice(
			'remembered-heart-rate',
			() => {
				attempts += 1;
				if (attempts === 1) {
					return oldHandshake.promise;
				}
				Object.assign(server, { connected: true });
				return Promise.resolve(server);
			},
			server.disconnect
		);
		const cancellation = new AbortController();
		const obsolete = coordinator.connect(device, 1000, 'timeout', cancellation.signal);
		const rejected = obsolete.catch((error: unknown) => error);
		cancellation.abort();
		const replacement = coordinator.connect(device, 1000, 'timeout');
		expect(await rejected).toMatchObject({ name: 'AbortError' });
		expect(await replacement).toBe(server);
		const disconnectsAfterRecovery = disconnects;
		oldHandshake.resolve(server);
		await Promise.resolve();
		expect(server.connected).toBeTrue();
		expect(disconnects).toBe(disconnectsAfterRecovery);
		expect(attempts).toBe(2);
	});

	test('closes a canceled handshake that settles late when no replacement owns the device', async () => {
		const coordinator = createBluetoothGattCoordinator();
		const handshake = Promise.withResolvers<BluetoothRemoteGATTServer>();
		const server = {
			connected: false,
			disconnect: () => {
				Object.assign(server, { connected: false });
			},
		} as BluetoothRemoteGATTServer;
		const device = bluetoothDevice(
			'stopped-heart-rate',
			() => handshake.promise,
			server.disconnect
		);
		const cancellation = new AbortController();
		const rejected = coordinator
			.connect(device, 1000, 'timeout', cancellation.signal)
			.catch((error: unknown) => error);
		cancellation.abort();
		expect(await rejected).toMatchObject({ name: 'AbortError' });
		Object.assign(server, { connected: true });
		handshake.resolve(server);
		await Promise.resolve();
		expect(server.connected).toBeFalse();
	});

	test('ignores a timed-out handshake settling after another attempt has connected', async () => {
		const coordinator = createBluetoothGattCoordinator();
		const handshake = Promise.withResolvers<BluetoothRemoteGATTServer>();
		let attempts = 0;
		const server = {
			connected: false,
			disconnect: () => {
				Object.assign(server, { connected: false });
			},
		} as BluetoothRemoteGATTServer;
		const device = bluetoothDevice(
			'timed-out-heart-rate',
			() => {
				attempts += 1;
				if (attempts === 1) {
					return handshake.promise;
				}
				Object.assign(server, { connected: true });
				return Promise.resolve(server);
			},
			server.disconnect
		);
		await expect(coordinator.connect(device, 1, 'timeout')).rejects.toThrow('timeout');
		await coordinator.connect(device, 1000, 'timeout');
		handshake.reject(new Error('Old connection closed'));
		await Promise.resolve();
		expect(server.connected).toBeTrue();
		expect(attempts).toBe(2);
	});
});
