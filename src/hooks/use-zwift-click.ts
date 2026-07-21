import { useSelector } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BATTERY, WEB_BLUETOOTH_UNAVAILABLE_MESSAGE } from '../constants';
import { isBluetoothChooserCancellation } from '../lib/bluetooth';
import {
	createBluetoothReconnectController,
	reconnectBluetoothDevicesNow,
	scheduleBluetoothDeviceReconnect,
} from '../lib/bluetooth-reconnect';
import {
	aggregateConnectionPhase,
	connectedDeviceCount,
	deviceConnectionView,
} from '../lib/device-connection';
import { errorMessage } from '../lib/errors';
import {
	type RememberedBluetoothDeviceCatalog,
	rememberedBluetoothDevices,
} from '../lib/remembered-bluetooth-devices';
import {
	CLICK_DEVICE_IDS_STORAGE_KEY,
	CLICK_MINUS_REFRESH_INTERVAL_MS,
	CLICK_SHIFT,
	type ClickControllerRoles,
	type ClickShift,
	clickControllerNeedsPeriodicRefresh,
	clickControllerRoleFromManufacturerData,
	clickV2SessionStopped,
	MAX_CLICK_CONTROLLERS,
	shouldMaintainClickConnection,
	shouldScheduleClickReconnect,
	storedClickControllerRoles,
	storedClickDeviceIds,
	ZWIFT_CLICK_NAME,
	ZWIFT_CLICK_SERVICE,
	ZWIFT_LEGACY_SERVICE,
	ZWIFT_MANUFACTURER_ID,
} from '../lib/zwift-click';
import {
	type ClickDeviceConnection,
	connectClickDevice,
	SupersededClickConnectionError,
} from '../lib/zwift-click-device';
import { createZwiftClickStore } from '../stores/zwift-click-store';
import { usePageHide } from './use-page-hide';
import { useZwiftClickInput } from './use-zwift-click-input';

interface ClickConnectionOptions {
	force?: boolean;
	rediscover?: boolean;
	scheduleRetry?: boolean;
}

const CLICK_RESET_SETTLE_MS = 500;

function saveDeviceIds(devices: BluetoothDevice[]) {
	localStorage.setItem(
		CLICK_DEVICE_IDS_STORAGE_KEY,
		JSON.stringify(devices.map(({ id }) => id).slice(0, MAX_CLICK_CONTROLLERS))
	);
}

function controllerLabel(role: ClickShift | undefined) {
	if (role === CLICK_SHIFT.UP) {
		return '+ Controller';
	}
	if (role === CLICK_SHIFT.DOWN) {
		return '− Controller';
	}
	return 'Press a button to identify';
}

export function useZwiftClick(
	onShift: (change: number) => void,
	setNotice: (notice: string) => void,
	identifyControllers: boolean,
	rememberedDeviceCatalog: RememberedBluetoothDeviceCatalog,
	initialConnectionActive: boolean
) {
	const store = useMemo(() => createZwiftClickStore(), []);
	const state = useSelector(store);
	const { setControllerPhase } = store.actions;
	const autoReconnect = useRef(true);
	const connectingIds = useRef(new Set<string>());
	const connectionAttempts = useRef(new Map<string, number>());
	const connectionActive = useRef(initialConnectionActive);
	const connections = useRef(new Map<string, ClickDeviceConnection>());
	const devicesRef = useRef<BluetoothDevice[]>([]);
	const forgottenIds = useRef(new Set<string>());
	const reportedConnectionFailures = useRef(new Set<string>());
	const handleReconnectAdvertisement = useRef<
		((selected: BluetoothDevice, event: BluetoothAdvertisingEvent) => void) | undefined
	>(undefined);
	const connectDeviceRef = useRef<
		| ((selected: BluetoothDevice, options?: ClickConnectionOptions) => Promise<boolean>)
		| undefined
	>(undefined);
	const operationalIds = useRef(new Set<string>());
	const restartingIds = useRef(new Set<string>());
	const restartControllerRef = useRef<((selected: BluetoothDevice) => Promise<void>) | undefined>(
		undefined
	);
	const reconnectController = useRef(
		createBluetoothReconnectController<BluetoothDevice>({
			attempt: (selected) =>
				connectDeviceRef.current?.(selected, {
					rediscover: true,
					scheduleRetry: false,
				}) ?? Promise.resolve(false),
			canRetry: (selected) =>
				shouldMaintainClickConnection(
					autoReconnect.current,
					connectionActive.current,
					forgottenIds.current.has(selected.id)
				),
			onAdvertisement: (selected, event) =>
				handleReconnectAdvertisement.current?.(selected, event),
			onWaiting: (selected) => store.actions.setControllerPhase(selected.id, 'reconnecting'),
		})
	);

	const markControllerOperational = useCallback(
		(deviceId: string) => {
			if (!connectionActive.current) {
				return;
			}
			operationalIds.current.add(deviceId);
			reconnectController.current.reset(deviceId);
			reportedConnectionFailures.current.delete(deviceId);
			setControllerPhase(deviceId, 'connected');
		},
		[setControllerPhase]
	);
	const clickInput = useZwiftClickInput({
		identifyControllers,
		onOperational: markControllerOperational,
		onShift,
		store,
	});
	handleReconnectAdvertisement.current = (selected, event) => {
		const role = clickControllerRoleFromManufacturerData(event.manufacturerData);
		if (role) {
			clickInput.registerControllerRole(selected.id, [role]);
		}
	};

	const cleanupConnection = useCallback((deviceId: string) => {
		connections.current.get(deviceId)?.cleanup();
		connections.current.delete(deviceId);
	}, []);

	const handleControllerDisconnect = useCallback(
		(selected: BluetoothDevice) => {
			const restarting = restartingIds.current.has(selected.id);
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clickInput.resetControllerInput(selected.id);
			// The refresh routine owns an intentional disconnect and its replacement
			// connection. Scheduling here as well can reconnect early, then let the
			// refresh routine tear down that brand-new connection moments later.
			const shouldReconnect = shouldScheduleClickReconnect(
				autoReconnect.current,
				connectionActive.current,
				forgottenIds.current.has(selected.id),
				restarting
			);
			if (restarting || shouldReconnect) {
				setControllerPhase(selected.id, 'reconnecting');
			} else {
				setControllerPhase(selected.id, 'offline');
			}
			if (shouldReconnect) {
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
			}
		},
		[cleanupConnection, clickInput.resetControllerInput, setControllerPhase]
	);

	const establishControllerConnection = useCallback(
		async (selected: BluetoothDevice, isCurrentAttempt: () => boolean, rediscover: boolean) => {
			const handleDisconnect = () => handleControllerDisconnect(selected);
			const connection = await connectClickDevice(selected, rediscover, {
				isCurrent: isCurrentAttempt,
				isOperational: () => operationalIds.current.has(selected.id),
				onDisconnect: handleDisconnect,
				onMessage: (event) => {
					clickInput.handleControllerMessage(selected.id, event);
					const { value } = event.target as BluetoothRemoteGATTCharacteristic;
					if (value && clickV2SessionStopped(value)) {
						restartControllerRef.current?.(selected);
					}
				},
			});
			connections.current.set(selected.id, connection);
		},
		[clickInput.handleControllerMessage, handleControllerDisconnect]
	);

	const restartController = useCallback(
		async (selected: BluetoothDevice) => {
			if (
				restartingIds.current.has(selected.id) ||
				!shouldMaintainClickConnection(
					autoReconnect.current,
					connectionActive.current,
					forgottenIds.current.has(selected.id)
				)
			) {
				return;
			}
			restartingIds.current.add(selected.id);
			try {
				reconnectController.current.cancel(selected.id, true);
				operationalIds.current.delete(selected.id);
				clickInput.resetControllerInput(selected.id);
				setControllerPhase(selected.id, 'reconnecting');
				try {
					await connections.current.get(selected.id)?.restart();
					await new Promise<void>((resolve) => {
						window.setTimeout(resolve, CLICK_RESET_SETTLE_MS);
					});
				} catch {
					// A controller may drop GATT as soon as it receives reset. Reconnection below
					// is the authoritative result, so that expected race needs no user-facing error.
				}
				cleanupConnection(selected.id);
				selected.gatt?.disconnect();
				if (
					shouldMaintainClickConnection(
						autoReconnect.current,
						connectionActive.current,
						forgottenIds.current.has(selected.id)
					)
				) {
					await connectDeviceRef.current?.(selected, { rediscover: true });
				} else {
					setControllerPhase(selected.id, 'offline');
				}
			} finally {
				restartingIds.current.delete(selected.id);
			}
		},
		[cleanupConnection, clickInput.resetControllerInput, setControllerPhase]
	);
	restartControllerRef.current = restartController;

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
			clickInput.resetControllerInput(selected.id);
			return attempt;
		},
		[cleanupConnection, clickInput.resetControllerInput, setControllerPhase]
	);

	const handleConnectionFailure = useCallback(
		(selected: BluetoothDevice, error: unknown, scheduleRetry: boolean) => {
			cleanupConnection(selected.id);
			operationalIds.current.delete(selected.id);
			clickInput.clearDeviceHeldShifts(selected.id);
			selected.gatt?.disconnect();
			const shouldReconnect = shouldMaintainClickConnection(
				autoReconnect.current,
				connectionActive.current,
				forgottenIds.current.has(selected.id)
			);
			setControllerPhase(selected.id, shouldReconnect ? 'reconnecting' : 'offline');
			if (!(shouldReconnect || reportedConnectionFailures.current.has(selected.id))) {
				reportedConnectionFailures.current.add(selected.id);
				setNotice(`Zwift Click connection failed: ${errorMessage(error)}`);
			}
			if (shouldReconnect && scheduleRetry) {
				scheduleBluetoothDeviceReconnect(reconnectController.current, selected);
			}
		},
		[cleanupConnection, clickInput.clearDeviceHeldShifts, setControllerPhase, setNotice]
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
			if (!connectionActive.current) {
				return false;
			}
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
			if (connectionActive.current) {
				connectDevice(selected);
			} else {
				setControllerPhase(selected.id, 'offline');
			}
		} catch (error) {
			if (!isBluetoothChooserCancellation(error)) {
				setNotice(errorMessage(error));
			}
		} finally {
			store.actions.setPairing(false);
		}
	}, [connectDevice, setControllerPhase, setNotice, store]);

	const reconnect = useCallback(() => {
		autoReconnect.current = true;
		if (!connectionActive.current) {
			return;
		}
		for (const selected of devicesRef.current) {
			const phase = store.get().controllerPhases[selected.id];
			if (phase === 'connected') {
				if (clickControllerNeedsPeriodicRefresh(store.get().controllerRoles[selected.id])) {
					restartController(selected);
				}
				continue;
			}
			reconnectController.current.reset(selected.id);
			reconnectController.current.expedite(selected.id, selected, 1);
		}
	}, [restartController, store]);

	const stopConnections = useCallback(() => {
		const devices = devicesRef.current;
		for (const selected of devices) {
			reconnectController.current.cancel(selected.id, true);
			connectionAttempts.current.set(
				selected.id,
				(connectionAttempts.current.get(selected.id) ?? 0) + 1
			);
			connectingIds.current.delete(selected.id);
			operationalIds.current.delete(selected.id);
			clickInput.clearDeviceHeldShifts(selected.id);
			cleanupConnection(selected.id);
			selected.gatt?.disconnect();
		}
		store.actions.setControllerPhases(
			Object.fromEntries(devices.map((selected) => [selected.id, 'offline']))
		);
	}, [cleanupConnection, clickInput.clearDeviceHeldShifts, store]);

	const disconnect = useCallback(() => {
		autoReconnect.current = false;
		stopConnections();
	}, [stopConnections]);

	const setConnectionActive = useCallback(
		(active: boolean) => {
			if (connectionActive.current === active) {
				return;
			}
			connectionActive.current = active;
			if (!active) {
				stopConnections();
				return;
			}
			if (!autoReconnect.current) {
				return;
			}
			const devices = devicesRef.current;
			store.actions.setControllerPhases(
				Object.fromEntries(devices.map((selected) => [selected.id, 'reconnecting']))
			);
			reconnectBluetoothDevicesNow(reconnectController.current, devices);
		},
		[stopConnections, store]
	);

	const forgetDevice = useCallback(
		async (deviceId: string) => {
			forgottenIds.current.add(deviceId);
			operationalIds.current.delete(deviceId);
			reconnectController.current.cancel(deviceId, true);
			clickInput.clearDeviceHeldShifts(deviceId);
			clickInput.forgetControllerRole(deviceId);
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
		[
			cleanupConnection,
			clickInput.clearDeviceHeldShifts,
			clickInput.forgetControllerRole,
			store,
		]
	);

	const forget = useCallback(async () => {
		autoReconnect.current = false;
		for (const selected of [...devicesRef.current]) {
			await forgetDevice(selected.id);
		}
	}, [forgetDevice]);

	usePageHide(() => {
		autoReconnect.current = false;
		connectionActive.current = false;
		stopConnections();
	});

	useEffect(() => {
		if (rememberedDeviceCatalog.error) {
			store.actions.setControllerPhases(
				Object.fromEntries(
					Object.keys(store.get().controllerPhases).map((deviceId) => [
						deviceId,
						'offline',
					])
				)
			);
			return;
		}
		if (!rememberedDeviceCatalog.devices) {
			return;
		}
		const remembered = rememberedBluetoothDevices(
			rememberedDeviceCatalog.devices,
			storedClickDeviceIds(),
			MAX_CLICK_CONTROLLERS
		);
		const rememberedIds = new Set(remembered.map(({ id }) => id));
		const rememberedRoles = Object.fromEntries(
			Object.entries(storedClickControllerRoles()).filter(([deviceId]) =>
				rememberedIds.has(deviceId)
			)
		) as ClickControllerRoles;
		clickInput.restoreControllerRoles(rememberedRoles);
		devicesRef.current = remembered;
		store.actions.setDeviceIds(remembered.map(({ id }) => id));
		const rememberedPhase = connectionActive.current ? 'reconnecting' : 'offline';
		store.actions.setControllerPhases(
			Object.fromEntries(remembered.map((selected) => [selected.id, rememberedPhase]))
		);
		for (const selected of remembered) {
			forgottenIds.current.delete(selected.id);
		}
		autoReconnect.current = true;
		if (connectionActive.current) {
			reconnectBluetoothDevicesNow(reconnectController.current, remembered);
		}
	}, [
		clickInput.restoreControllerRoles,
		rememberedDeviceCatalog.devices,
		rememberedDeviceCatalog.error,
		store,
	]);

	const minusControllerId = state.deviceIds.find((deviceId) =>
		clickControllerNeedsPeriodicRefresh(state.controllerRoles[deviceId])
	);
	const minusControllerConnected =
		minusControllerId !== undefined &&
		state.controllerPhases[minusControllerId] === 'connected';
	useEffect(() => {
		if (!(minusControllerId && minusControllerConnected)) {
			return;
		}
		const selected = devicesRef.current.find(({ id }) => id === minusControllerId);
		if (!selected) {
			return;
		}
		const refreshTimer = window.setTimeout(() => {
			restartController(selected);
		}, CLICK_MINUS_REFRESH_INTERVAL_MS);
		return () => window.clearTimeout(refreshTimer);
	}, [minusControllerConnected, minusControllerId, restartController]);

	const connectionPhases = state.deviceIds.map(
		(deviceId) => state.controllerPhases[deviceId] ?? 'offline'
	);
	const connection = deviceConnectionView(aggregateConnectionPhase(connectionPhases));
	const connectedCount = connectedDeviceCount(connectionPhases);
	return {
		...connection,
		connectedCount,
		connectionActive: connectionActive.current,
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
		setConnectionActive,
	};
}
