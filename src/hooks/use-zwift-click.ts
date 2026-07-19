import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BATTERY, WEB_BLUETOOTH_UNAVAILABLE_MESSAGE } from '../constants';
import { isBluetoothChooserCancellation } from '../lib/bluetooth';
import { aggregateConnectionPhase, deviceConnectionView } from '../lib/device-connection';
import { errorMessage } from '../lib/errors';
import { createReconnectController } from '../lib/reconnect-controller';
import {
	CLICK_CONTROLLER_ROLES_STORAGE_KEY,
	CLICK_DEVICE_IDS_STORAGE_KEY,
	type ClickControllerRoles,
	type ClickShift,
	filterAcceptedClickShifts,
	filterClickShiftsForController,
	MAX_CLICK_CONTROLLERS,
	parseClickV2Shift,
	registerClickControllerRole,
	storedClickControllerRoles,
	storedClickDeviceIds,
	ZWIFT_CLICK_NAME,
	ZWIFT_CLICK_SERVICE,
	ZWIFT_LEGACY_SERVICE,
	ZWIFT_MANUFACTURER_ID,
} from '../lib/zwift-click';
import { connectClickDevice, SupersededClickConnectionError } from '../lib/zwift-click-device';
import { createZwiftClickStore } from '../stores/zwift-click-store';

interface ClickRepeatTimer {
	delay: number;
	interval?: number;
}

interface ClickConnectionOptions {
	force?: boolean;
	rediscover?: boolean;
	scheduleRetry?: boolean;
}

const CLICK_HOLD_DELAY_MS = 600;
const CLICK_HOLD_REPEAT_MS = 220;
const CLICK_CONTROLLER_FLASH_MS = 350;
const CLICK_SHIFTS: ClickShift[] = ['down', 'up'];

type ClickConnectionCleanup = () => void;

function saveDeviceIds(devices: BluetoothDevice[]) {
	localStorage.setItem(
		CLICK_DEVICE_IDS_STORAGE_KEY,
		JSON.stringify(devices.map(({ id }) => id).slice(0, MAX_CLICK_CONTROLLERS))
	);
}

function saveControllerRoles(roles: ClickControllerRoles) {
	localStorage.setItem(CLICK_CONTROLLER_ROLES_STORAGE_KEY, JSON.stringify(roles));
}

function controllerLabel(role: ClickShift | undefined) {
	if (role === 'up') {
		return '+ Controller';
	}
	if (role === 'down') {
		return '− Controller';
	}
	return 'Press a button to identify';
}

function shouldAutoReconnect(
	autoReconnect: boolean,
	forgottenIds: ReadonlySet<string>,
	deviceId: string
) {
	return autoReconnect && !forgottenIds.has(deviceId);
}

export function useZwiftClick(
	onShift: (change: number) => void,
	setNotice: (notice: string) => void,
	identifyControllers = false
) {
	const store = useMemo(() => createZwiftClickStore(), []);
	const state = useSelector(store);
	const { clearActiveControllers, setControllerPhase } = store.actions;
	const autoReconnect = useRef(true);
	const connectingIds = useRef(new Set<string>());
	const connectionAttempts = useRef(new Map<string, number>());
	const connectionCleanups = useRef(new Map<string, ClickConnectionCleanup>());
	const controllerFlashTimers = useRef(new Map<string, number>());
	const controllerRolesRef = useRef<ClickControllerRoles>({});
	const devicesRef = useRef<BluetoothDevice[]>([]);
	const forgottenIds = useRef(new Set<string>());
	const heldShiftsByDevice = useRef(new Map<string, ClickShift[]>());
	const identifyControllersRef = useRef(identifyControllers);
	const previousButtonMaps = useRef(new Map<string, number>());
	const reportedConnectionFailures = useRef(new Set<string>());
	const lastShiftTimes = useRef(new Map<ClickShift, number>());
	const repeatTimers = useRef(new Map<ClickShift, ClickRepeatTimer>());
	const connectDeviceRef = useRef<
		| ((selected: BluetoothDevice, options?: ClickConnectionOptions) => Promise<boolean>)
		| undefined
	>(undefined);
	const onShiftRef = useRef(onShift);
	const operationalIds = useRef(new Set<string>());
	const reconnectController = useRef(
		createReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, {
					rediscover: true,
					scheduleRetry: false,
				}) ?? Promise.resolve(false),
			canRetry: (selected) => autoReconnect.current && !forgottenIds.current.has(selected.id),
			delayForAttempt: (attempt) => Math.min(1000, 400 * 2 ** (attempt - 1)),
			onWaiting: (selected) => store.actions.setControllerPhase(selected.id, 'reconnecting'),
		})
	);

	useEffect(() => {
		onShiftRef.current = onShift;
	}, [onShift]);

	useEffect(() => {
		identifyControllersRef.current = identifyControllers;
		if (!identifyControllers) {
			for (const timer of controllerFlashTimers.current.values()) {
				window.clearTimeout(timer);
			}
			controllerFlashTimers.current.clear();
			clearActiveControllers();
		}
	}, [clearActiveControllers, identifyControllers]);

	useEffect(
		() => () => {
			for (const timer of controllerFlashTimers.current.values()) {
				window.clearTimeout(timer);
			}
		},
		[]
	);

	const registerControllerRole = useCallback(
		(deviceId: string, shifts: ClickShift[]) => {
			const next = registerClickControllerRole(controllerRolesRef.current, deviceId, shifts);
			if (next === controllerRolesRef.current) {
				return;
			}
			controllerRolesRef.current = next;
			store.actions.setControllerRoles(next);
			saveControllerRoles(next);
		},
		[store]
	);

	const forgetControllerRole = useCallback(
		(deviceId: string) => {
			if (!controllerRolesRef.current[deviceId]) {
				return;
			}
			const next = { ...controllerRolesRef.current };
			delete next[deviceId];
			controllerRolesRef.current = next;
			store.actions.setControllerRoles(next);
			saveControllerRoles(next);
		},
		[store]
	);

	const stopRepeat = useCallback((shift: ClickShift) => {
		const timer = repeatTimers.current.get(shift);
		if (!timer) {
			return;
		}
		window.clearTimeout(timer.delay);
		window.clearInterval(timer.interval);
		repeatTimers.current.delete(shift);
	}, []);

	const syncRepeats = useCallback(() => {
		const heldShifts = new Set<ClickShift>();
		for (const deviceShifts of heldShiftsByDevice.current.values()) {
			for (const shift of deviceShifts) {
				heldShifts.add(shift);
			}
		}
		for (const shift of CLICK_SHIFTS) {
			if (!heldShifts.has(shift)) {
				stopRepeat(shift);
				continue;
			}
			if (repeatTimers.current.has(shift)) {
				continue;
			}
			const change = shift === 'down' ? -1 : 1;
			const timer: ClickRepeatTimer = { delay: 0 };
			timer.delay = window.setTimeout(() => {
				onShiftRef.current(change);
				timer.interval = window.setInterval(
					() => onShiftRef.current(change),
					CLICK_HOLD_REPEAT_MS
				);
			}, CLICK_HOLD_DELAY_MS);
			repeatTimers.current.set(shift, timer);
		}
	}, [stopRepeat]);

	const setDeviceHeldShifts = useCallback(
		(deviceId: string, heldShifts: ClickShift[]) => {
			if (heldShifts.length) {
				heldShiftsByDevice.current.set(deviceId, heldShifts);
			} else {
				heldShiftsByDevice.current.delete(deviceId);
			}
			syncRepeats();
		},
		[syncRepeats]
	);

	const clearDeviceHeldShifts = useCallback(
		(deviceId: string) => {
			heldShiftsByDevice.current.delete(deviceId);
			syncRepeats();
		},
		[syncRepeats]
	);

	useEffect(
		() => () => {
			for (const shift of repeatTimers.current.keys()) {
				stopRepeat(shift);
			}
		},
		[stopRepeat]
	);

	const cleanupConnection = useCallback((deviceId: string) => {
		connectionCleanups.current.get(deviceId)?.();
		connectionCleanups.current.delete(deviceId);
	}, []);

	const flashController = useCallback(
		(deviceId: string) => {
			if (!identifyControllersRef.current) {
				return;
			}
			window.clearTimeout(controllerFlashTimers.current.get(deviceId));
			store.actions.activateController(deviceId);
			const timer = window.setTimeout(() => {
				controllerFlashTimers.current.delete(deviceId);
				store.actions.deactivateController(deviceId);
			}, CLICK_CONTROLLER_FLASH_MS);
			controllerFlashTimers.current.set(deviceId, timer);
		},
		[store]
	);

	const handleControllerMessage = useCallback(
		(deviceId: string, event: Event) => {
			const { value } = event.target as BluetoothRemoteGATTCharacteristic;
			if (!value) {
				return;
			}
			const parsed = parseClickV2Shift(value, previousButtonMaps.current.get(deviceId));
			if (!parsed) {
				return;
			}
			operationalIds.current.add(deviceId);
			reconnectController.current.reset(deviceId);
			reportedConnectionFailures.current.delete(deviceId);
			setControllerPhase(deviceId, 'connected');
			previousButtonMaps.current.set(deviceId, parsed.buttonMap);
			const controllerRole = controllerRolesRef.current[deviceId];
			const heldShifts = filterClickShiftsForController(parsed.heldShifts, controllerRole);
			const controllerShifts = filterClickShiftsForController(parsed.shifts, controllerRole);
			setDeviceHeldShifts(deviceId, heldShifts);
			const acceptedShifts = filterAcceptedClickShifts(
				controllerShifts,
				performance.now(),
				lastShiftTimes.current
			);
			if (acceptedShifts.length) {
				flashController(deviceId);
			}
			if (identifyControllersRef.current) {
				registerControllerRole(deviceId, acceptedShifts);
			}
			for (const shift of acceptedShifts) {
				onShiftRef.current(shift === 'down' ? -1 : 1);
			}
		},
		[flashController, registerControllerRole, setControllerPhase, setDeviceHeldShifts]
	);

	const handleControllerDisconnect = useCallback(
		(selected: BluetoothDevice) => {
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			previousButtonMaps.current.delete(selected.id);
			if (shouldAutoReconnect(autoReconnect.current, forgottenIds.current, selected.id)) {
				setControllerPhase(selected.id, 'reconnecting');
				reconnectController.current.start(selected.id, selected);
			} else {
				setControllerPhase(selected.id, 'offline');
			}
		},
		[cleanupConnection, clearDeviceHeldShifts, setControllerPhase]
	);

	const establishControllerConnection = useCallback(
		async (selected: BluetoothDevice, isCurrentAttempt: () => boolean, rediscover: boolean) => {
			const handleDisconnect = () => handleControllerDisconnect(selected);
			const cleanup = await connectClickDevice(selected, rediscover, {
				isCurrent: isCurrentAttempt,
				isOperational: () => operationalIds.current.has(selected.id),
				onControllerRole: (role) => registerControllerRole(selected.id, [role]),
				onDisconnect: handleDisconnect,
				onMessage: (event) => handleControllerMessage(selected.id, event),
			});
			connectionCleanups.current.set(selected.id, cleanup);
		},
		[handleControllerDisconnect, handleControllerMessage, registerControllerRole]
	);

	const beginControllerConnectionAttempt = useCallback(
		(selected: BluetoothDevice, force: boolean, rediscover: boolean) => {
			if (forgottenIds.current.has(selected.id)) {
				return;
			}
			if (connectingIds.current.has(selected.id) && !force) {
				return;
			}
			if (force) {
				operationalIds.current.delete(selected.id);
				connectionAttempts.current.set(
					selected.id,
					(connectionAttempts.current.get(selected.id) ?? 0) + 1
				);
				connectingIds.current.delete(selected.id);
				cleanupConnection(selected.id);
				selected.gatt?.disconnect();
			}
			reconnectController.current.cancel(selected.id);
			const attempt = (connectionAttempts.current.get(selected.id) ?? 0) + 1;
			connectionAttempts.current.set(selected.id, attempt);
			connectingIds.current.add(selected.id);
			setControllerPhase(selected.id, force || rediscover ? 'reconnecting' : 'connecting');
			previousButtonMaps.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			return attempt;
		},
		[cleanupConnection, clearDeviceHeldShifts, setControllerPhase]
	);

	const handleConnectionFailure = useCallback(
		(selected: BluetoothDevice, error: unknown, scheduleRetry: boolean) => {
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			selected.gatt?.disconnect();
			const shouldReconnect = shouldAutoReconnect(
				autoReconnect.current,
				forgottenIds.current,
				selected.id
			);
			setControllerPhase(selected.id, shouldReconnect ? 'reconnecting' : 'offline');
			if (!(shouldReconnect || reportedConnectionFailures.current.has(selected.id))) {
				reportedConnectionFailures.current.add(selected.id);
				setNotice(`Zwift Click connection failed: ${errorMessage(error)}`);
			}
			if (shouldReconnect && scheduleRetry) {
				reconnectController.current.start(selected.id, selected);
			}
		},
		[cleanupConnection, clearDeviceHeldShifts, setControllerPhase, setNotice]
	);

	useEffect(
		() => () => {
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
		},
		[]
	);

	const connectDevice = useCallback(
		async (
			selected: BluetoothDevice,
			{ force = false, rediscover = false, scheduleRetry = true }: ClickConnectionOptions = {}
		): Promise<boolean> => {
			const connectionAttempt = beginControllerConnectionAttempt(selected, force, rediscover);
			if (connectionAttempt === undefined) {
				return false;
			}
			const isCurrentAttempt = () =>
				connectionAttempts.current.get(selected.id) === connectionAttempt;
			try {
				await establishControllerConnection(selected, isCurrentAttempt, rediscover);
				operationalIds.current.add(selected.id);
				setControllerPhase(selected.id, 'connected');
				reconnectController.current.reset(selected.id);
				reportedConnectionFailures.current.delete(selected.id);
				return true;
			} catch (error) {
				if (error instanceof SupersededClickConnectionError || !isCurrentAttempt()) {
					return false;
				}
				handleConnectionFailure(selected, error, scheduleRetry);
				return false;
			} finally {
				if (isCurrentAttempt()) {
					connectingIds.current.delete(selected.id);
				}
			}
		},
		[
			beginControllerConnectionAttempt,
			establishControllerConnection,
			handleConnectionFailure,
			setControllerPhase,
		]
	);

	useEffect(() => {
		connectDeviceRef.current = connectDevice;
	}, [connectDevice]);

	const pair = useCallback(async () => {
		if (!navigator.bluetooth) {
			setNotice(WEB_BLUETOOTH_UNAVAILABLE_MESSAGE);
			return;
		}
		store.actions.setPairing(true);
		try {
			const selected = await navigator.bluetooth.requestDevice({
				filters: [{ name: ZWIFT_CLICK_NAME }],
				optionalManufacturerData: [ZWIFT_MANUFACTURER_ID],
				optionalServices: [ZWIFT_CLICK_SERVICE, ZWIFT_LEGACY_SERVICE, BATTERY],
			});
			autoReconnect.current = true;
			forgottenIds.current.delete(selected.id);
			const { current } = devicesRef;
			const next = current.some(({ id }) => id === selected.id)
				? current
				: [...current, selected].slice(0, MAX_CLICK_CONTROLLERS);
			devicesRef.current = next;
			store.actions.setDeviceIds(next.map(({ id }) => id));
			saveDeviceIds(next);
			// Do not make selection of the second controller wait for this controller's
			// complete GATT setup. Its connection continues independently in the background.
			connectDevice(selected);
		} catch (error) {
			if (!isBluetoothChooserCancellation(error)) {
				setNotice(errorMessage(error));
			}
		} finally {
			store.actions.setPairing(false);
		}
	}, [connectDevice, setNotice, store]);

	const reconnect = useCallback(() => {
		autoReconnect.current = true;
		for (const selected of devicesRef.current) {
			if (store.get().controllerPhases[selected.id] === 'connected') {
				continue;
			}
			reconnectController.current.reset(selected.id);
			reconnectController.current.start(selected.id, selected, 1);
		}
	}, [store]);

	const disconnect = useCallback(() => {
		autoReconnect.current = false;
		const devices = devicesRef.current;
		for (const selected of devices) {
			reconnectController.current.cancel(selected.id, true);
			operationalIds.current.delete(selected.id);
			clearDeviceHeldShifts(selected.id);
			cleanupConnection(selected.id);
			selected.gatt?.disconnect();
		}
		store.actions.setControllerPhases(
			Object.fromEntries(devices.map((selected) => [selected.id, 'offline']))
		);
	}, [cleanupConnection, clearDeviceHeldShifts, store]);

	const forgetDevice = useCallback(
		async (deviceId: string) => {
			forgottenIds.current.add(deviceId);
			operationalIds.current.delete(deviceId);
			reconnectController.current.cancel(deviceId, true);
			clearDeviceHeldShifts(deviceId);
			forgetControllerRole(deviceId);
			const selected = devicesRef.current.find(({ id }) => id === deviceId);
			cleanupConnection(deviceId);
			selected?.gatt?.disconnect();
			try {
				await selected?.forget();
			} finally {
				const next = devicesRef.current.filter(({ id }) => id !== deviceId);
				devicesRef.current = next;
				store.actions.setDeviceIds(next.map(({ id }) => id));
				saveDeviceIds(next);
				store.actions.removeControllerPhase(deviceId);
			}
		},
		[cleanupConnection, clearDeviceHeldShifts, forgetControllerRole, store]
	);

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		for (const selected of [...devicesRef.current]) {
			await forgetDevice(selected.id);
		}
	}, [forgetDevice]);

	useEffect(() => {
		let cancelled = false;
		async function restore() {
			if (!navigator.bluetooth?.getDevices) {
				return;
			}
			const ids = storedClickDeviceIds();
			if (!ids.length) {
				return;
			}
			const permitted = await navigator.bluetooth.getDevices();
			const remembered = ids
				.map((id) => permitted.find((candidate) => candidate.id === id))
				.filter((candidate): candidate is BluetoothDevice => Boolean(candidate))
				.slice(0, MAX_CLICK_CONTROLLERS);
			if (cancelled) {
				return;
			}
			const rememberedIds = new Set(remembered.map(({ id }) => id));
			const rememberedRoles = Object.fromEntries(
				Object.entries(storedClickControllerRoles()).filter(([deviceId]) =>
					rememberedIds.has(deviceId)
				)
			) as ClickControllerRoles;
			controllerRolesRef.current = rememberedRoles;
			devicesRef.current = remembered;
			store.actions.setControllerRoles(rememberedRoles);
			store.actions.setDeviceIds(remembered.map(({ id }) => id));
			store.actions.setControllerPhases(
				Object.fromEntries(remembered.map((selected) => [selected.id, 'reconnecting']))
			);
			for (const selected of remembered) {
				forgottenIds.current.delete(selected.id);
			}
			autoReconnect.current = true;
			for (const selected of remembered) {
				reconnectController.current.start(selected.id, selected, 1);
			}
		}
		restore().catch(() => {
			store.actions.setControllerPhases(
				Object.fromEntries(
					Object.keys(store.get().controllerPhases).map((deviceId) => [
						deviceId,
						'offline',
					])
				)
			);
		});
		return () => {
			cancelled = true;
			autoReconnect.current = false;
			reconnectController.current.cancelAll();
		};
	}, [store]);

	const connectionPhases = state.deviceIds.map(
		(deviceId) => state.controllerPhases[deviceId] ?? 'offline'
	);
	const connection = deviceConnectionView(aggregateConnectionPhase(connectionPhases));
	const connectedCount = connectionPhases.filter((phase) => phase === 'connected').length;
	return {
		...connection,
		connectedCount,
		controllers: state.deviceIds.map((deviceId) => ({
			active: state.activeControllerIds.includes(deviceId),
			...deviceConnectionView(state.controllerPhases[deviceId] ?? 'offline'),
			id: deviceId,
			label: controllerLabel(state.controllerRoles[deviceId]),
		})),
		disconnect,
		forget,
		forgetDevice,
		pair,
		pairedCount: state.deviceIds.length,
		pairing: state.pairing,
		reconnect,
	};
}
