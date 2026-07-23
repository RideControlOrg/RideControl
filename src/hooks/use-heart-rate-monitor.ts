import { useCallback, useEffect, useRef, useState } from 'react';
import { BATTERY, HEART_RATE, WEB_BLUETOOTH_UNAVAILABLE_MESSAGE } from '../constants';
import { isBluetoothChooserCancellation } from '../lib/bluetooth';
import {
	createBluetoothReconnectController,
	reconnectBluetoothDeviceNow,
	scheduleBluetoothDeviceReconnect,
} from '../lib/bluetooth-reconnect';
import { type DeviceConnectionPhase, deviceConnectionView } from '../lib/device-connection';
import { errorMessage } from '../lib/errors';
import { connectHeartRateDevice } from '../lib/heart-rate-device';
import {
	type RememberedBluetoothDeviceCatalog,
	rememberedBluetoothDevice,
} from '../lib/remembered-bluetooth-devices';
import { usePageHide } from './use-page-hide';

const STORAGE_KEY = 'heart-rate-device-id';

export function useHeartRateMonitor(
	rememberedDevices: RememberedBluetoothDeviceCatalog,
	setNotice: (notice: string) => void
) {
	const [device, setDevice] = useState<BluetoothDevice>();
	const [phase, setPhase] = useState<DeviceConnectionPhase>(() =>
		localStorage.getItem(STORAGE_KEY) ? 'reconnecting' : 'unpaired'
	);
	const [heartRate, setHeartRate] = useState(0);
	const [battery, setBattery] = useState<number>();
	const autoReconnect = useRef(true);
	const connecting = useRef(false);
	const connectionGeneration = useRef(0);
	const forgotten = useRef(false);
	const connectionCleanup = useRef<() => void>(() => undefined);
	const connectDeviceRef = useRef<
		((selected: BluetoothDevice, reconnecting?: boolean) => Promise<boolean>) | undefined
	>(undefined);
	const reconnectController = useRef(
		createBluetoothReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, true) ?? Promise.resolve(false),
			canRetry: () => autoReconnect.current && !forgotten.current,
			onWaiting: () => setPhase('reconnecting'),
			watchAdvertisements: false,
		})
	);
	const handleDisconnect = useCallback((selected: BluetoothDevice) => {
		connectionCleanup.current();
		setHeartRate(0);
		if (autoReconnect.current && !forgotten.current) {
			scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
		} else {
			setPhase('offline');
		}
	}, []);
	const handleConnectionFailure = useCallback(
		(selected: BluetoothDevice, error: unknown, reconnecting: boolean) => {
			selected.gatt?.disconnect();
			setHeartRate(0);
			setPhase(reconnecting ? 'reconnecting' : 'offline');
			if (reconnecting) {
				return;
			}
			setNotice(`Heart rate monitor connection failed: ${errorMessage(error)}`);
			if (autoReconnect.current && !forgotten.current) {
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
			}
		},
		[setNotice]
	);

	const connectDevice = useCallback(
		async (selected: BluetoothDevice, reconnecting = false): Promise<boolean> => {
			if (forgotten.current || connecting.current) {
				return false;
			}
			const generation = connectionGeneration.current + 1;
			connectionGeneration.current = generation;
			connecting.current = true;
			setPhase(reconnecting ? 'reconnecting' : 'connecting');
			connectionCleanup.current();
			setBattery(undefined);
			try {
				const connection = await connectHeartRateDevice(selected, reconnecting, {
					onBattery: (nextBattery) => {
						if (generation === connectionGeneration.current) {
							setBattery(nextBattery);
						}
					},
					onDisconnect: () => {
						if (generation === connectionGeneration.current) {
							handleDisconnect(selected);
						}
					},
					onHeartRate: (nextHeartRate) => {
						if (generation === connectionGeneration.current) {
							setHeartRate(nextHeartRate);
						}
					},
				});
				if (
					generation !== connectionGeneration.current ||
					forgotten.current ||
					!autoReconnect.current
				) {
					connection.cleanup();
					selected.gatt?.disconnect();
					return false;
				}
				connectionCleanup.current = connection.cleanup;
				setDevice(selected);
				setPhase('connected');
				reconnectController.current.reset(selected.id);
				localStorage.setItem(STORAGE_KEY, selected.id);
				return true;
			} catch (error) {
				if (generation === connectionGeneration.current) {
					handleConnectionFailure(selected, error, reconnecting);
				}
				return false;
			} finally {
				connecting.current = false;
			}
		},
		[handleConnectionFailure, handleDisconnect]
	);

	useEffect(() => {
		connectDeviceRef.current = connectDevice;
	}, [connectDevice]);

	const pair = useCallback(async () => {
		if (!navigator.bluetooth) {
			setNotice(WEB_BLUETOOTH_UNAVAILABLE_MESSAGE);
			return;
		}
		const generation = connectionGeneration.current + 1;
		connectionGeneration.current = generation;
		setPhase('pairing');
		try {
			const selected = await navigator.bluetooth.requestDevice({
				filters: [{ services: [HEART_RATE] }],
				optionalServices: [BATTERY],
			});
			if (generation !== connectionGeneration.current) {
				selected.gatt?.disconnect();
				return;
			}
			autoReconnect.current = true;
			forgotten.current = false;
			setDevice(selected);
			localStorage.setItem(STORAGE_KEY, selected.id);
			await connectDevice(selected);
		} catch (error) {
			if (generation !== connectionGeneration.current) {
				return;
			}
			setPhase(device ? 'offline' : 'unpaired');
			if (!isBluetoothChooserCancellation(error)) {
				setNotice(errorMessage(error));
			}
		}
	}, [connectDevice, device, setNotice]);

	const reconnect = useCallback(() => {
		if (!device) {
			return;
		}
		forgotten.current = false;
		autoReconnect.current = true;
		reconnectController.current.reset(device.id);
		reconnectBluetoothDeviceNow(reconnectController.current, device);
	}, [device]);

	const disconnect = useCallback(() => {
		connectionGeneration.current += 1;
		autoReconnect.current = false;
		if (device) {
			reconnectController.current.cancel(device.id, true);
		}
		connectionCleanup.current();
		device?.gatt?.disconnect();
		setHeartRate(0);
		setPhase(device ? 'offline' : 'unpaired');
	}, [device]);

	const cancelConnection = useCallback(() => {
		connectionGeneration.current += 1;
		autoReconnect.current = false;
		if (device) {
			reconnectController.current.cancel(device.id, true);
		}
		connectionCleanup.current();
		device?.gatt?.disconnect();
		setHeartRate(0);
		setBattery(undefined);
		setPhase(device ? 'offline' : 'unpaired');
	}, [device]);

	const forget = useCallback(async () => {
		const selected = device;
		connectionGeneration.current += 1;
		autoReconnect.current = false;
		forgotten.current = true;
		if (selected) {
			reconnectController.current.cancel(selected.id, true);
		}
		connectionCleanup.current();
		selected?.gatt?.disconnect();
		localStorage.removeItem(STORAGE_KEY);
		setDevice(undefined);
		setHeartRate(0);
		setBattery(undefined);
		setPhase('unpaired');
		try {
			await selected?.forget();
		} catch {
			// The app state is already cleared even when Chrome cannot revoke its
			// remembered permission.
		}
	}, [device]);

	usePageHide(() => {
		autoReconnect.current = false;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device?.gatt?.disconnect();
	});

	useEffect(() => {
		const savedDeviceId = localStorage.getItem(STORAGE_KEY);
		if (!savedDeviceId) {
			setPhase('unpaired');
			return;
		}
		if (!(rememberedDevices.supported && rememberedDevices.devices)) {
			if (rememberedDevices.error) {
				setPhase('offline');
			}
			return;
		}
		const remembered = rememberedBluetoothDevice(rememberedDevices.devices, savedDeviceId);
		if (!remembered) {
			setPhase('unpaired');
			return;
		}
		setDevice(remembered);
		setPhase('reconnecting');
		forgotten.current = false;
		autoReconnect.current = true;
		reconnectBluetoothDeviceNow(reconnectController.current, remembered);
	}, [rememberedDevices.devices, rememberedDevices.error, rememberedDevices.supported]);

	useEffect(
		() => () => {
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
		},
		[]
	);

	useEffect(
		() => () => {
			device?.gatt?.disconnect();
		},
		[device]
	);

	return {
		battery,
		...deviceConnectionView(phase),
		cancelConnection,
		disconnect,
		forget,
		heartRate,
		name: device?.name,
		pair,
		reconnect,
	};
}
