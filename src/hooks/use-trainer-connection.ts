import { useCallback, useEffect, useRef } from 'react';
import {
	CHROME_BLUETOOTH_PERMISSION_MESSAGE,
	emptyMetrics,
	FTMS_CONTROL_OPCODE,
	WEB_BLUETOOTH_UNAVAILABLE_MESSAGE,
} from '../constants';
import {
	isBluetoothChooserCancellation,
	recordMetricActivity,
	resistanceCommand,
	selectRememberedTrainer,
	TRAINER_DEVICE_STORAGE_KEY,
} from '../lib/bluetooth';
import { recoverableBluetoothOperationError } from '../lib/bluetooth-operation';
import {
	createBluetoothReconnectController,
	reconnectBluetoothDeviceNow,
	scheduleBluetoothDeviceReconnect,
} from '../lib/bluetooth-reconnect';
import { errorMessage } from '../lib/errors';
import {
	createLatestValueScheduler,
	type LatestValueScheduler,
} from '../lib/latest-value-scheduler';
import type { RememberedBluetoothDeviceCatalog } from '../lib/remembered-bluetooth-devices';
import { storedResistance } from '../lib/session';
import { connectTrainerDevice, trainerRequestOptions } from '../lib/trainer-device';
import type { TrainerStore } from '../stores/trainer-store';
import { usePageHide } from './use-page-hide';

interface NumberRef {
	current: number;
}

const RUNTIME_RESISTANCE_COMMAND_INTERVAL_MS = 500;

function pairingWasCancelled(error: unknown, connectionCancelled: boolean) {
	return connectionCancelled || isBluetoothChooserCancellation(error);
}

export function useTrainerConnection(
	store: TrainerStore,
	appliedResistance: NumberRef,
	resistanceTarget: NumberRef,
	rememberedDevices: RememberedBluetoothDeviceCatalog
) {
	const { setConnectionPhase, setMetrics, setNotice, setResistance, setResistanceRamp } =
		store.actions;
	const device = useRef<BluetoothDevice | undefined>(undefined);
	const pairedDevice = useRef<BluetoothDevice | undefined>(undefined);
	const commandQueue = useRef(Promise.resolve());
	const connecting = useRef(false);
	const connectionGeneration = useRef(0);
	const connectionCancelled = useRef(false);
	const disconnectRequested = useRef(false);
	const autoReconnect = useRef(true);
	const pendingDevice = useRef<BluetoothDevice | undefined>(undefined);
	const connectionCleanup = useRef<() => void>(() => undefined);
	const runtimeResistanceScheduler = useRef<LatestValueScheduler<number> | undefined>(undefined);
	const connectDeviceRef = useRef<
		((selected: BluetoothDevice, rediscover?: boolean) => Promise<boolean>) | undefined
	>(undefined);
	const unloading = useRef(false);
	const lastPedalingAt = useRef(0);
	const trainerReportsDistance = useRef(false);
	const sendControlCommand = useRef<((bytes: readonly number[]) => Promise<void>) | undefined>(
		undefined
	);
	const resistanceRange = useRef(store.get().resistanceRange);
	const reconnectController = useRef(
		createBluetoothReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, true) ?? Promise.resolve(false),
			canRetry: () =>
				autoReconnect.current && !unloading.current && !connectionCancelled.current,
			onWaiting: () => setConnectionPhase('reconnecting'),
		})
	);
	const handleTrainerDisconnected = useCallback(
		(selected: BluetoothDevice, reconnectNotice?: string) => {
			runtimeResistanceScheduler.current?.clear();
			const shouldReconnect =
				!(disconnectRequested.current || unloading.current) && autoReconnect.current;
			disconnectRequested.current = false;
			device.current = undefined;
			store.actions.setDeviceName(undefined);
			sendControlCommand.current = undefined;
			setMetrics(emptyMetrics);
			lastPedalingAt.current = 0;
			trainerReportsDistance.current = false;
			if (shouldReconnect) {
				pendingDevice.current = selected;
				setConnectionPhase('reconnecting');
				setNotice(reconnectNotice ?? 'Trainer disconnected. Reconnecting automatically…');
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
			} else if (connectionCancelled.current) {
				setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
				setNotice('Connection attempt stopped.');
			} else {
				setConnectionPhase('offline');
				setNotice('Trainer disconnected.');
			}
		},
		[setConnectionPhase, setMetrics, setNotice, store]
	);

	const queueControlCommand = useCallback(
		async (
			send: ((bytes: readonly number[]) => Promise<void>) | undefined,
			bytes: readonly number[]
		) => {
			if (!send) {
				throw new Error('Connect the trainer before changing its settings.');
			}
			const action = () => send(bytes);
			commandQueue.current = commandQueue.current.then(action, action);
			await commandQueue.current;
		},
		[]
	);

	const writeControl = useCallback(
		async (send: typeof sendControlCommand.current, bytes: readonly number[]) => {
			try {
				await queueControlCommand(send, bytes);
			} catch (error) {
				if (send !== sendControlCommand.current) {
					return;
				}
				setNotice(`Trainer command failed: ${errorMessage(error)}`);
				if (!recoverableBluetoothOperationError(error)) {
					return;
				}
				const selected = device.current ?? pairedDevice.current;
				if (!selected) {
					return;
				}
				connectionCleanup.current();
				connectionCleanup.current = () => undefined;
				selected.gatt?.disconnect();
				handleTrainerDisconnected(
					selected,
					`Trainer stopped responding: ${errorMessage(error)} Reconnecting automatically…`
				);
			}
		},
		[handleTrainerDisconnected, queueControlCommand, setNotice]
	);
	const writeControlRef = useRef(writeControl);
	writeControlRef.current = writeControl;
	runtimeResistanceScheduler.current ??= createLatestValueScheduler({
		minimumIntervalMs: RUNTIME_RESISTANCE_COMMAND_INTERVAL_MS,
		send: async (percent) => {
			await writeControlRef.current(
				sendControlCommand.current,
				resistanceCommand(percent, resistanceRange.current)
			);
		},
	});

	function connectionStopped(rediscover: boolean) {
		return connectionCancelled.current || (rediscover && !autoReconnect.current);
	}

	function pairingAttemptIsCurrent(generation: number) {
		return generation === connectionGeneration.current && !connectionCancelled.current;
	}

	function handlePairingError(error: unknown, generation: number) {
		if (generation !== connectionGeneration.current) {
			return;
		}
		setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
		if (!pairingWasCancelled(error, connectionCancelled.current)) {
			setNotice(errorMessage(error));
		}
	}

	function handleConnectionError(error: unknown, rediscover: boolean) {
		if (rediscover && autoReconnect.current && !connectionCancelled.current) {
			setConnectionPhase('reconnecting');
		} else if (connectionCancelled.current) {
			setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
		} else {
			setConnectionPhase('offline');
			setNotice(errorMessage(error));
		}
	}

	async function connectDevice(selected: BluetoothDevice, rediscover = false): Promise<boolean> {
		if (connecting.current) {
			return false;
		}
		const generation = connectionGeneration.current;
		connecting.current = true;
		runtimeResistanceScheduler.current?.clear();
		setConnectionPhase(rediscover ? 'reconnecting' : 'connecting');
		connectionCleanup.current();
		try {
			pairedDevice.current = selected;
			store.actions.setPairedDeviceName(selected.name);
			const nextConnection = await connectTrainerDevice(
				selected,
				rediscover,
				resistanceRange.current,
				{
					onDisconnect: () => {
						if (generation !== connectionGeneration.current) {
							return;
						}
						connectionCleanup.current();
						handleTrainerDisconnected(selected);
					},
					onMetrics: (nextMetrics, reportsDistance) => {
						if (generation !== connectionGeneration.current) {
							return;
						}
						if (reportsDistance) {
							trainerReportsDistance.current = true;
						}
						recordMetricActivity(lastPedalingAt, nextMetrics);
						store.actions.mergeMetrics(nextMetrics);
					},
				}
			);
			if (generation !== connectionGeneration.current || connectionStopped(rediscover)) {
				nextConnection.cleanup();
				selected.gatt?.disconnect();
				return false;
			}
			connectionCleanup.current = nextConnection.cleanup;
			sendControlCommand.current = nextConnection.sendControlCommand;
			resistanceRange.current = nextConnection.resistanceRange;
			store.actions.setResistanceRange(nextConnection.resistanceRange);
			const restored = storedResistance();
			setResistance(restored);
			appliedResistance.current = restored;
			resistanceTarget.current = restored;
			setResistanceRamp({
				current: restored,
				from: restored,
				phase: 'holding',
				progress: 0,
				to: restored,
			});
			await queueControlCommand(sendControlCommand.current, [
				FTMS_CONTROL_OPCODE.REQUEST_CONTROL,
			]);
			await queueControlCommand(sendControlCommand.current, [
				FTMS_CONTROL_OPCODE.START_OR_RESUME,
			]);
			await queueControlCommand(
				sendControlCommand.current,
				resistanceCommand(restored, resistanceRange.current)
			);
			if (generation !== connectionGeneration.current || connectionStopped(rediscover)) {
				selected.gatt?.disconnect();
				return false;
			}
			localStorage.setItem(TRAINER_DEVICE_STORAGE_KEY, selected.id);
			device.current = selected;
			store.actions.setDeviceName(selected.name);
			setConnectionPhase('connected');
			nextConnection.startOptionalMetrics();
			reconnectController.current.reset(selected.id);
			setNotice(`${selected.name ?? 'Trainer'} is connected and ready.`);
			return true;
		} catch (error) {
			runtimeResistanceScheduler.current?.clear();
			connectionCleanup.current();
			connectionCleanup.current = () => undefined;
			sendControlCommand.current = undefined;
			if (selected.gatt?.connected) {
				selected.gatt.disconnect();
			}
			if (generation === connectionGeneration.current) {
				handleConnectionError(error, rediscover);
			}
			return false;
		} finally {
			connecting.current = false;
		}
	}

	useEffect(() => {
		connectDeviceRef.current = connectDevice;
	});

	async function connect() {
		if (!navigator.bluetooth) {
			setNotice(WEB_BLUETOOTH_UNAVAILABLE_MESSAGE);
			return;
		}
		const generation = connectionGeneration.current + 1;
		connectionGeneration.current = generation;
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		setConnectionPhase('pairing');
		try {
			const selected = await navigator.bluetooth.requestDevice(trainerRequestOptions());
			if (!pairingAttemptIsCurrent(generation)) {
				selected.gatt?.disconnect();
				return;
			}
			pendingDevice.current = selected;
			pairedDevice.current = selected;
			store.actions.setPairedDeviceName(selected.name);
			localStorage.setItem(TRAINER_DEVICE_STORAGE_KEY, selected.id);
			autoReconnect.current = true;
			if (!(await connectDevice(selected)) && pairingAttemptIsCurrent(generation)) {
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
			}
		} catch (error) {
			handlePairingError(error, generation);
		} finally {
			if (generation === connectionGeneration.current) {
				pendingDevice.current = undefined;
			}
		}
	}

	const cancelConnection = useCallback(() => {
		connectionGeneration.current += 1;
		connectionCancelled.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		runtimeResistanceScheduler.current?.clear();
		connectionCleanup.current();
		pendingDevice.current?.gatt?.disconnect();
		pairedDevice.current?.gatt?.disconnect();
		device.current?.gatt?.disconnect();
		device.current = undefined;
		store.actions.setDeviceName(undefined);
		sendControlCommand.current = undefined;
		setMetrics(emptyMetrics);
		pendingDevice.current = undefined;
		setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
		setNotice('Connection attempt stopped.');
	}, [setConnectionPhase, setMetrics, setNotice, store]);

	const disconnect = useCallback(() => {
		connectionGeneration.current += 1;
		connectionCancelled.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		runtimeResistanceScheduler.current?.clear();
		connectionCleanup.current();
		device.current?.gatt?.disconnect();
		device.current = undefined;
		store.actions.setDeviceName(undefined);
		sendControlCommand.current = undefined;
		setMetrics(emptyMetrics);
		setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
	}, [setConnectionPhase, setMetrics, store]);

	function reconnect() {
		if (!pairedDevice.current) {
			return;
		}
		const selected = pairedDevice.current;
		connectionGeneration.current += 1;
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		autoReconnect.current = true;
		reconnectController.current.reset(selected.id);
		reconnectBluetoothDeviceNow(reconnectController.current, selected);
	}

	const forget = useCallback(async () => {
		const selected = pairedDevice.current;
		connectionGeneration.current += 1;
		connectionCancelled.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		runtimeResistanceScheduler.current?.clear();
		connectionCleanup.current();
		pendingDevice.current?.gatt?.disconnect();
		pendingDevice.current = undefined;
		device.current?.gatt?.disconnect();
		selected?.gatt?.disconnect();
		localStorage.removeItem(TRAINER_DEVICE_STORAGE_KEY);
		device.current = undefined;
		pairedDevice.current = undefined;
		store.actions.setDeviceName(undefined);
		store.actions.setPairedDeviceName(undefined);
		sendControlCommand.current = undefined;
		setMetrics(emptyMetrics);
		setConnectionPhase('unpaired');
		setNotice('Trainer removed from paired devices.');
		try {
			await selected?.forget();
		} catch {
			// The local pairing is already removed. Chrome may retain its permission,
			// but Ride Control will not reconnect without a new pairing request.
		}
	}, [setConnectionPhase, setMetrics, setNotice, store]);

	const sendResistance = useCallback((percent: number) => {
		runtimeResistanceScheduler.current?.push(percent);
		return Promise.resolve();
	}, []);

	usePageHide(() => {
		unloading.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		runtimeResistanceScheduler.current?.clear();
		connectionCleanup.current();
		device.current?.gatt?.disconnect();
	});

	useEffect(() => {
		if (!rememberedDevices.supported) {
			setConnectionPhase('unpaired');
			setNotice(CHROME_BLUETOOTH_PERMISSION_MESSAGE);
			return;
		}
		if (rememberedDevices.error) {
			setConnectionPhase('offline');
			setNotice(errorMessage(rememberedDevices.error));
			return;
		}
		if (!rememberedDevices.devices) {
			return;
		}
		const remembered = selectRememberedTrainer(rememberedDevices.devices);
		if (!remembered) {
			setConnectionPhase('unpaired');
			return;
		}
		autoReconnect.current = true;
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		pairedDevice.current = remembered;
		store.actions.setPairedDeviceName(remembered.name);
		setConnectionPhase('reconnecting');
		reconnectBluetoothDeviceNow(reconnectController.current, remembered);
		return () => {
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
		};
	}, [
		rememberedDevices.devices,
		rememberedDevices.error,
		rememberedDevices.supported,
		setConnectionPhase,
		setNotice,
		store.actions.setPairedDeviceName,
	]);

	return {
		cancelConnection,
		connect,
		disconnect,
		forget,
		lastPedalingAt,
		reconnect,
		sendResistance,
		trainerReportsDistance,
	};
}
