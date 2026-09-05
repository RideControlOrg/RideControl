import { withPromiseTimeout } from './promise-timeout';

export interface BluetoothGattCoordinator {
	connect: (
		device: BluetoothDevice,
		timeoutMs: number,
		timeoutMessage: string,
		signal?: AbortSignal
	) => Promise<BluetoothRemoteGATTServer>;
}

interface GattAttempt {
	abandoned: boolean;
	pending?: Promise<BluetoothRemoteGATTServer>;
}

export function createBluetoothGattCoordinator(): BluetoothGattCoordinator {
	const attempts = new Map<string, GattAttempt>();

	return {
		connect: (device, timeoutMs, timeoutMessage, signal) => {
			if (signal?.aborted) {
				return Promise.reject(signal.reason);
			}
			const existing = attempts.get(device.id)?.pending;
			if (existing) {
				return existing;
			}
			const attempt: GattAttempt = { abandoned: false };
			attempts.set(device.id, attempt);
			const abort = () => {
				attempt.abandoned = true;
				if (attempts.get(device.id) === attempt) {
					device.gatt?.disconnect();
					attempt.pending = undefined;
				}
			};
			signal?.addEventListener('abort', abort, { once: true });
			const connect = async () => {
				const { gatt } = device;
				if (!gatt) {
					throw new Error('This device does not expose a GATT server.');
				}
				if (gatt.connected) {
					return gatt;
				}
				try {
					const operation = gatt.connect();
					operation.then(
						(server) => {
							// A browser connect may settle after timeout or cancellation. Close it
							// only while it still owns this device, never a newer connection.
							if (attempt.abandoned && attempts.get(device.id) === attempt) {
								server.disconnect();
							}
						},
						() => undefined
					);
					return await withPromiseTimeout(
						operation,
						timeoutMs,
						() => new Error(timeoutMessage),
						signal
					);
				} catch (error) {
					attempt.abandoned = true;
					if (attempts.get(device.id) === attempt) {
						gatt.disconnect();
					}
					throw error;
				}
			};
			// Chrome can establish independent devices concurrently. Only collapse duplicate
			// requests for the same physical device so one slow sensor never blocks another.
			const connection = connect();
			if (!attempt.abandoned) {
				attempt.pending = connection;
			}
			const clearPending = () => {
				attempt.pending = undefined;
				signal?.removeEventListener('abort', abort);
			};
			connection.then(clearPending, clearPending);
			return connection;
		},
	};
}

export const bluetoothGattCoordinator = createBluetoothGattCoordinator();
