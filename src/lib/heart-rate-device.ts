import {
	BATTERY,
	BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS,
	HEART_RATE,
	HEART_RATE_RECONNECT_PROBE_TIMEOUT_MS,
	OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
} from '../constants';
import { connectGatt } from './bluetooth';
import { createBluetoothNotificationSubscription } from './bluetooth-notifications';
import { withBluetoothOperationTimeout } from './bluetooth-operation';
import { parseHeartRateMeasurement } from './heart-rate';
import { withPromiseTimeout } from './promise-timeout';

const HEART_RATE_MEASUREMENT = 0x2a_37;
const BATTERY_LEVEL = 0x2a_19;
const HEART_RATE_MEASUREMENT_TIMEOUT_MS = 10_000;

interface HeartRateDeviceCallbacks {
	onBattery: (battery: number) => void;
	onDisconnect: () => void;
	onHeartRate: (heartRate: number) => void;
}

export interface HeartRateDeviceConnection {
	cleanup: () => void;
}

interface HeartRateDeviceConnectionTiming {
	clearTimer?: typeof clearTimeout;
	measurementTimeoutMs?: number;
	operationTimeoutMs?: number;
	reconnectProbeTimeoutMs?: number;
	setTimer?: typeof setTimeout;
	signal?: AbortSignal;
}

async function readBatteryLevel(
	server: BluetoothRemoteGATTServer,
	signal: AbortSignal
): Promise<number> {
	const service = await server.getPrimaryService(BATTERY);
	signal.throwIfAborted();
	const characteristic = await service.getCharacteristic(BATTERY_LEVEL);
	signal.throwIfAborted();
	const batteryValue = await characteristic.readValue();
	return batteryValue.getUint8(0);
}

export async function connectHeartRateDevice(
	device: BluetoothDevice,
	rediscover: boolean,
	{ onBattery, onDisconnect, onHeartRate }: HeartRateDeviceCallbacks,
	{
		clearTimer = clearTimeout,
		measurementTimeoutMs = HEART_RATE_MEASUREMENT_TIMEOUT_MS,
		operationTimeoutMs,
		reconnectProbeTimeoutMs = HEART_RATE_RECONNECT_PROBE_TIMEOUT_MS,
		setTimer = setTimeout,
		signal,
	}: HeartRateDeviceConnectionTiming = {}
): Promise<HeartRateDeviceConnection> {
	signal?.throwIfAborted();
	const lifecycle = new AbortController();
	let active = true;
	let ready = false;
	let measurementTimer: ReturnType<typeof setTimeout> | undefined;
	let removeMeasurementListener: (() => void) | undefined;
	const cleanup = () => {
		if (!active) {
			return;
		}
		active = false;
		clearTimer(measurementTimer);
		removeMeasurementListener?.();
		device.removeEventListener('gattserverdisconnected', handleDisconnect);
		signal?.removeEventListener('abort', cleanup);
		lifecycle.abort();
		device.gatt?.disconnect();
	};
	const handleDisconnect = () => {
		cleanup();
		if (ready) {
			onDisconnect();
		}
	};
	const watchMeasurements = () => {
		clearTimer(measurementTimer);
		measurementTimer = setTimer(() => {
			if (!active) {
				return;
			}
			// GATT can remain connected after a sleeping monitor loses its stream.
			// A fresh connection must rediscover and subscribe, not reuse that server.
			cleanup();
			onDisconnect();
		}, measurementTimeoutMs);
	};
	device.addEventListener('gattserverdisconnected', handleDisconnect);
	signal?.addEventListener('abort', cleanup, { once: true });
	try {
		const server = await connectGatt(device, rediscover, {
			directTimeoutMs: BLUETOOTH_GATT_CONNECTION_TIMEOUT_MS,
			reconnectProbeTimeoutMs,
			signal: lifecycle.signal,
		});
		lifecycle.signal.throwIfAborted();
		const service = await withBluetoothOperationTimeout(
			server.getPrimaryService(HEART_RATE),
			'Heart rate service discovery',
			operationTimeoutMs,
			lifecycle.signal
		);
		lifecycle.signal.throwIfAborted();
		const measurement = await withBluetoothOperationTimeout(
			service.getCharacteristic(HEART_RATE_MEASUREMENT),
			'Heart rate measurement discovery',
			operationTimeoutMs,
			lifecycle.signal
		);
		lifecycle.signal.throwIfAborted();
		const { promise: firstMeasurement, resolve: resolveFirstMeasurement } =
			Promise.withResolvers<void>();
		const notifications = createBluetoothNotificationSubscription(measurement, (event) => {
			if (!active) {
				return;
			}
			const { value } = event.target as BluetoothRemoteGATTCharacteristic;
			const heartRate = value ? parseHeartRateMeasurement(value) : undefined;
			if (heartRate === undefined) {
				return;
			}
			resolveFirstMeasurement();
			if (ready) {
				watchMeasurements();
			}
			onHeartRate(heartRate);
		});
		removeMeasurementListener = notifications.cleanup;
		await withBluetoothOperationTimeout(
			notifications.start(),
			'Bluetooth notification setup',
			operationTimeoutMs,
			lifecycle.signal
		);
		lifecycle.signal.throwIfAborted();
		await withBluetoothOperationTimeout(
			firstMeasurement,
			'Heart rate measurement',
			measurementTimeoutMs,
			lifecycle.signal
		);
		lifecycle.signal.throwIfAborted();
		if (!server.connected) {
			throw new DOMException('Heart rate monitor disconnected during setup.', 'NetworkError');
		}
		ready = true;
		watchMeasurements();
		withPromiseTimeout(
			readBatteryLevel(server, lifecycle.signal),
			OPTIONAL_BLUETOOTH_OPERATION_TIMEOUT_MS,
			() => new Error('Battery level unavailable.'),
			lifecycle.signal
		).then(
			(battery) => {
				if (active) {
					onBattery(battery);
				}
			},
			() => undefined
		);
		lifecycle.signal.throwIfAborted();
		return { cleanup };
	} catch (error) {
		cleanup();
		throw error;
	}
}
