import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
	CHROME_BLUETOOTH_PERMISSION_MESSAGE,
	CONTROL_FLASH_MS,
	emptyMetrics,
	optionalServices,
	WEB_BLUETOOTH_UNAVAILABLE_MESSAGE,
} from '../constants';
import {
	findRememberedKickr,
	isBluetoothChooserCancellation,
	recordMetricActivity,
	resistanceCommand,
	TRAINER_DEVICE_STORAGE_KEY,
} from '../lib/bluetooth';
import { deviceConnectionView } from '../lib/device-connection';
import { eventTargetsEditableControl, keyboardEventHasModifiers } from '../lib/dom';
import { errorMessage } from '../lib/errors';
import { scheduleNoticeDismissal } from '../lib/notification';
import { clamp } from '../lib/numbers';
import { createReconnectController } from '../lib/reconnect-controller';
import {
	clampResistance,
	resistanceDirectionForKey,
	resistanceRampDuration,
	smoothedResistance,
} from '../lib/resistance';
import { RESISTANCE_STORAGE_KEY, storedResistance } from '../lib/session';
import { connectTrainerDevice } from '../lib/trainer-device';
import { createTrainerStore } from '../stores/trainer-store';

function pairingWasCancelled(error: unknown, connectionCancelled: boolean) {
	return connectionCancelled || isBluetoothChooserCancellation(error);
}

export function useTrainer() {
	const store = useMemo(() => createTrainerStore(), []);
	const state = useSelector(store);
	const {
		setConnectionPhase,
		setMetrics,
		setNotice,
		setResistance,
		setResistanceKeyFlash,
		setResistanceRamp,
		setResistanceRange,
	} = store.actions;
	const device = useRef<BluetoothDevice | undefined>(undefined);
	const pairedDevice = useRef<BluetoothDevice | undefined>(undefined);
	const commandQueue = useRef(Promise.resolve());
	const resistanceTimer = useRef<number | undefined>(undefined);
	const resistanceRampTimer = useRef<number | undefined>(undefined);
	const resistanceKeyFlashTimer = useRef<number | undefined>(undefined);
	const appliedResistance = useRef(storedResistance());
	const resistanceTarget = useRef(storedResistance());
	const connecting = useRef(false);
	const connectionCancelled = useRef(false);
	const disconnectRequested = useRef(false);
	const autoReconnect = useRef(true);
	const pendingDevice = useRef<BluetoothDevice | undefined>(undefined);
	const connectionCleanup = useRef<() => void>(() => undefined);
	const connectDeviceRef = useRef<
		((selected: BluetoothDevice, rediscover?: boolean) => Promise<boolean>) | undefined
	>(undefined);
	const keyboardControlsEnabled = useRef(true);
	const gearControlsEnabled = useRef(false);
	const unloading = useRef(false);
	const lastPedalingAt = useRef(0);
	const trainerReportsDistance = useRef(false);
	const controlPointRef = useRef<BluetoothRemoteGATTCharacteristic | undefined>(undefined);
	const rangeRef = useRef(state.resistanceRange);
	const connection = deviceConnectionView(state.connectionPhase);
	const reconnectController = useRef(
		createReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, true) ?? Promise.resolve(false),
			canRetry: () =>
				autoReconnect.current && !unloading.current && !connectionCancelled.current,
			delayForAttempt: (attempt) => Math.min(5000, 700 * attempt),
			onWaiting: () => setConnectionPhase('reconnecting'),
		})
	);

	useEffect(
		() => scheduleNoticeDismissal(state.notice, () => setNotice('')),
		[setNotice, state.notice]
	);

	useEffect(
		() => () => {
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
			window.clearTimeout(resistanceKeyFlashTimer.current);
		},
		[]
	);

	const writeControl = useCallback(
		async (characteristic: BluetoothRemoteGATTCharacteristic | undefined, bytes: number[]) => {
			if (!characteristic) {
				setNotice('Connect the trainer before changing its settings.');
				return;
			}
			const action = async () => {
				try {
					await characteristic.writeValueWithResponse(new Uint8Array(bytes));
				} catch (error) {
					setNotice(`Trainer command failed: ${errorMessage(error)}`);
				}
			};
			commandQueue.current = commandQueue.current.then(action, action);
			await commandQueue.current;
		},
		[setNotice]
	);

	function connectionStopped(rediscover: boolean) {
		return connectionCancelled.current || (rediscover && !autoReconnect.current);
	}

	function handleConnectionError(error: unknown, rediscover: boolean) {
		if (rediscover && autoReconnect.current && !connectionCancelled.current) {
			setConnectionPhase('reconnecting');
		} else if (connectionCancelled.current) {
			setConnectionPhase('offline');
		} else {
			setConnectionPhase('offline');
			setNotice(errorMessage(error));
		}
	}

	function handleTrainerDisconnected(selected: BluetoothDevice) {
		const shouldReconnect =
			!(disconnectRequested.current || unloading.current) && autoReconnect.current;
		disconnectRequested.current = false;
		device.current = undefined;
		store.actions.setDeviceName(undefined);
		controlPointRef.current = undefined;
		setMetrics(emptyMetrics);
		lastPedalingAt.current = 0;
		trainerReportsDistance.current = false;
		if (shouldReconnect) {
			pendingDevice.current = selected;
			setConnectionPhase('reconnecting');
			setNotice('Trainer disconnected. Reconnecting automatically…');
			reconnectController.current.start(selected.id, selected, 700);
		} else if (connectionCancelled.current) {
			setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
			setNotice('Connection attempt stopped.');
		} else {
			setConnectionPhase('offline');
			setNotice('Trainer disconnected.');
		}
	}

	async function connectDevice(selected: BluetoothDevice, rediscover = false): Promise<boolean> {
		if (connecting.current) {
			return false;
		}
		connecting.current = true;
		setConnectionPhase(rediscover ? 'reconnecting' : 'connecting');
		connectionCleanup.current();
		try {
			pairedDevice.current = selected;
			store.actions.setPairedDeviceName(selected.name);
			const nextConnection = await connectTrainerDevice(
				selected,
				rediscover,
				rangeRef.current,
				{
					onControlRejected: () => setNotice('Trainer did not accept that command.'),
					onDisconnect: () => {
						connectionCleanup.current();
						handleTrainerDisconnected(selected);
					},
					onMetrics: (nextMetrics, reportsDistance) => {
						if (reportsDistance) {
							trainerReportsDistance.current = true;
						}
						recordMetricActivity(lastPedalingAt, nextMetrics);
						store.actions.mergeMetrics(nextMetrics);
					},
				}
			);
			if (connectionStopped(rediscover)) {
				nextConnection.cleanup();
				selected.gatt?.disconnect();
				return false;
			}
			connectionCleanup.current = nextConnection.cleanup;
			const point = nextConnection.controlPoint;
			controlPointRef.current = point;
			const activeRange = nextConnection.resistanceRange;
			rangeRef.current = activeRange;
			setResistanceRange(activeRange);
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
			await writeControl(point, [0]);
			await new Promise((resolve) => window.setTimeout(resolve, 150));
			await writeControl(point, resistanceCommand(restored, activeRange));
			if (connectionStopped(rediscover)) {
				selected.gatt?.disconnect();
				return false;
			}
			localStorage.setItem(TRAINER_DEVICE_STORAGE_KEY, selected.id);
			device.current = selected;
			store.actions.setDeviceName(selected.name);
			setConnectionPhase('connected');
			reconnectController.current.reset(selected.id);
			setNotice(`${selected.name ?? 'Trainer'} is connected and ready.`);
			return true;
		} catch (error) {
			if (selected.gatt?.connected) {
				selected.gatt.disconnect();
			}
			handleConnectionError(error, rediscover);
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
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		setConnectionPhase('pairing');
		try {
			const selected = await navigator.bluetooth.requestDevice({
				filters: [{ namePrefix: 'KICKR' }],
				optionalServices,
			});
			pendingDevice.current = selected;
			pairedDevice.current = selected;
			store.actions.setPairedDeviceName(selected.name);
			autoReconnect.current = true;
			if (!(await connectDevice(selected))) {
				reconnectController.current.start(selected.id, selected);
			}
		} catch (error) {
			setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
			if (!pairingWasCancelled(error, connectionCancelled.current)) {
				setNotice(errorMessage(error));
			}
		} finally {
			pendingDevice.current = undefined;
		}
	}

	const cancelConnection = useCallback(() => {
		connectionCancelled.current = true;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		pendingDevice.current?.gatt?.disconnect();
		pendingDevice.current = undefined;
		setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
		setNotice('Connection attempt stopped.');
	}, [setConnectionPhase, setNotice]);

	const disconnect = useCallback(() => {
		connectionCancelled.current = false;
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device.current?.gatt?.disconnect();
		device.current = undefined;
		store.actions.setDeviceName(undefined);
		controlPointRef.current = undefined;
		setMetrics(emptyMetrics);
		setConnectionPhase(pairedDevice.current ? 'offline' : 'unpaired');
	}, [setConnectionPhase, setMetrics, store]);

	async function reconnect() {
		if (!pairedDevice.current) {
			return;
		}
		const selected = pairedDevice.current;
		connectionCancelled.current = false;
		disconnectRequested.current = false;
		autoReconnect.current = true;
		reconnectController.current.reset(selected.id);
		if (!(await connectDevice(selected, true))) {
			reconnectController.current.start(selected.id, selected);
		}
	}

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		disconnectRequested.current = true;
		reconnectController.current.cancelAll();
		connectionCleanup.current();
		device.current?.gatt?.disconnect();
		try {
			await pairedDevice.current?.forget();
		} finally {
			localStorage.removeItem(TRAINER_DEVICE_STORAGE_KEY);
			device.current = undefined;
			pairedDevice.current = undefined;
			store.actions.setDeviceName(undefined);
			store.actions.setPairedDeviceName(undefined);
			controlPointRef.current = undefined;
			setMetrics(emptyMetrics);
			setConnectionPhase('unpaired');
			setNotice('Trainer removed from paired devices.');
		}
	}, [setConnectionPhase, setMetrics, setNotice, store]);

	const sendResistance = useCallback(
		async (percent: number) => {
			await writeControl(
				controlPointRef.current,
				resistanceCommand(percent, rangeRef.current)
			);
		},
		[writeControl]
	);

	const rampResistance = useCallback(
		(target: number) => {
			window.clearTimeout(resistanceRampTimer.current);
			const start = appliedResistance.current;
			if (start === target) {
				setResistanceRamp({
					current: target,
					from: start,
					phase: 'settled',
					progress: 1,
					to: target,
				});
				return;
			}
			const startedAt = performance.now();
			const duration = resistanceRampDuration(start, target);
			setResistanceRamp({
				current: start,
				from: start,
				phase: 'ramping',
				progress: 0,
				to: target,
			});
			const advance = () => {
				const progress = clamp((performance.now() - startedAt) / duration, 0, 1);
				const current = smoothedResistance(start, target, progress);
				appliedResistance.current = current;
				setResistanceRamp({
					current,
					from: start,
					phase: progress < 1 ? 'ramping' : 'settled',
					progress,
					to: target,
				});
				sendResistance(current).catch((error: unknown) => setNotice(errorMessage(error)));
				if (progress < 1) {
					resistanceRampTimer.current = window.setTimeout(advance, 200);
				}
			};
			advance();
		},
		[sendResistance, setNotice, setResistanceRamp]
	);

	const updateResistance = useCallback(
		(value: number) => {
			const next = clampResistance(value);
			resistanceTarget.current = next;
			setResistance(next);
			localStorage.setItem(RESISTANCE_STORAGE_KEY, String(next));
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
			const { current } = appliedResistance;
			setResistanceRamp({
				current,
				from: current,
				phase: current === next ? 'settled' : 'queued',
				progress: current === next ? 1 : 0,
				to: next,
			});
			resistanceTimer.current = window.setTimeout(() => {
				rampResistance(next);
			}, 180);
		},
		[rampResistance, setResistance, setResistanceRamp]
	);

	const shiftResistanceBy = useCallback(
		(change: number) => {
			const next = clampResistance(resistanceTarget.current + change);
			window.clearTimeout(resistanceTimer.current);
			window.clearTimeout(resistanceRampTimer.current);
			resistanceTarget.current = next;
			appliedResistance.current = next;
			setResistance(next);
			setResistanceRamp({
				current: next,
				from: next,
				phase: 'settled',
				progress: 1,
				to: next,
			});
			localStorage.setItem(RESISTANCE_STORAGE_KEY, String(next));
			sendResistance(next).catch((error: unknown) => setNotice(errorMessage(error)));
		},
		[sendResistance, setNotice, setResistance, setResistanceRamp]
	);

	useEffect(() => {
		const handlePageHide = () => {
			unloading.current = true;
			autoReconnect.current = false;
			disconnectRequested.current = true;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
			device.current?.gatt?.disconnect();
		};
		window.addEventListener('pagehide', handlePageHide);
		return () => window.removeEventListener('pagehide', handlePageHide);
	}, []);

	useEffect(() => {
		let cancelled = false;
		async function restore() {
			autoReconnect.current = true;
			connectionCancelled.current = false;
			disconnectRequested.current = false;
			if (!navigator.bluetooth?.getDevices) {
				setConnectionPhase('unpaired');
				setNotice(CHROME_BLUETOOTH_PERMISSION_MESSAGE);
				return;
			}
			const remembered = await findRememberedKickr();
			if (cancelled) {
				return;
			}
			if (!remembered) {
				setConnectionPhase('unpaired');
				return;
			}
			pairedDevice.current = remembered;
			store.actions.setPairedDeviceName(remembered.name);
			setConnectionPhase('reconnecting');
			reconnectController.current.start(remembered.id, remembered, 1);
		}
		restore().catch((error: unknown) => setNotice(errorMessage(error)));
		return () => {
			cancelled = true;
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
			connectionCleanup.current();
		};
	}, [setConnectionPhase, setNotice, store.actions.setPairedDeviceName]);

	useEffect(() => {
		const handleKeys = (event: KeyboardEvent) => {
			const isResistanceControl =
				event.target instanceof HTMLElement &&
				event.target.matches('[data-resistance-control="true"]');
			if (
				event.defaultPrevented ||
				keyboardEventHasModifiers(event) ||
				(!isResistanceControl && eventTargetsEditableControl(event))
			) {
				return;
			}
			if (!keyboardControlsEnabled.current) {
				return;
			}
			if (gearControlsEnabled.current) {
				return;
			}
			const direction = resistanceDirectionForKey(event.key);
			if (!direction) {
				return;
			}
			event.preventDefault();
			setResistanceKeyFlash(direction);
			window.clearTimeout(resistanceKeyFlashTimer.current);
			if (direction === 'increase') {
				updateResistance(resistanceTarget.current + 1);
			} else {
				updateResistance(resistanceTarget.current - 1);
			}
		};
		const handleKeyUp = (event: KeyboardEvent) => {
			if (!resistanceDirectionForKey(event.key)) {
				return;
			}
			window.clearTimeout(resistanceKeyFlashTimer.current);
			resistanceKeyFlashTimer.current = window.setTimeout(
				() => setResistanceKeyFlash(undefined),
				CONTROL_FLASH_MS
			);
		};
		const handleBlur = () => {
			window.clearTimeout(resistanceKeyFlashTimer.current);
			setResistanceKeyFlash(undefined);
		};
		window.addEventListener('keydown', handleKeys);
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('blur', handleBlur);
		return () => {
			window.removeEventListener('keydown', handleKeys);
			window.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('blur', handleBlur);
		};
	}, [setResistanceKeyFlash, updateResistance]);

	const setKeyboardControlsEnabled = useCallback((enabled: boolean) => {
		keyboardControlsEnabled.current = enabled;
	}, []);

	const setGearControlsEnabled = useCallback((enabled: boolean) => {
		gearControlsEnabled.current = enabled;
	}, []);

	return {
		...connection,
		cancelConnection,
		connect,
		connectionBusy: connection.busy,
		deviceName: state.deviceName,
		disconnect,
		forget,
		lastPedalingAt,
		metrics: state.metrics,
		notice: state.notice,
		pairedDeviceName: state.pairedDeviceName,
		reconnect,
		resistance: state.resistance,
		resistanceKeyFlash: state.resistanceKeyFlash,
		resistanceRamp: state.resistanceRamp,
		setGearControlsEnabled,
		setKeyboardControlsEnabled,
		setNotice,
		shiftResistanceBy,
		trainerReportsDistance,
		updateResistance,
	};
}
