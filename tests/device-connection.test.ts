import { describe, expect, test } from 'bun:test';
import { startBluetoothNotifications } from '../src/lib/bluetooth-notifications';
import {
	bluetoothReconnectDelay,
	createBluetoothReconnectController,
	reconnectBluetoothDeviceNow,
	reconnectBluetoothDevicesNow,
} from '../src/lib/bluetooth-reconnect';
import {
	aggregateConnectionPhase,
	connectedDeviceCount,
	deviceConnectionView,
	removeConnectionPhase,
	setConnectionPhase,
} from '../src/lib/device-connection';
import { createReconnectController } from '../src/lib/reconnect-controller';

describe('device connection state', () => {
	test('derives every public flag and label from one phase', () => {
		expect(deviceConnectionView('unpaired')).toEqual({
			busy: false,
			connected: false,
			paired: false,
			phase: 'unpaired',
			reconnecting: false,
			status: 'Not paired',
		});
		expect(deviceConnectionView('reconnecting')).toEqual({
			busy: true,
			connected: false,
			paired: true,
			phase: 'reconnecting',
			reconnecting: true,
			status: 'Reconnecting…',
		});
		expect(deviceConnectionView('connected').connected).toBeTrue();
	});

	test('aggregates independent controller phases without impossible states', () => {
		expect(aggregateConnectionPhase([])).toBe('unpaired');
		expect(aggregateConnectionPhase(['connected', 'connected'])).toBe('connected');
		expect(aggregateConnectionPhase(['connected', 'reconnecting'])).toBe('reconnecting');
		expect(aggregateConnectionPhase(['connected', 'connecting'])).toBe('connecting');
		expect(aggregateConnectionPhase(['connected', 'offline'])).toBe('offline');
		expect(connectedDeviceCount(['connected', 'reconnecting'])).toBe(1);
		expect(connectedDeviceCount(['offline', 'reconnecting'])).toBe(0);
	});

	test('updates keyed controller phases without publishing no-op changes', () => {
		const initial = { plus: 'connected' as const };
		expect(setConnectionPhase(initial, 'plus', 'connected')).toBe(initial);
		const withMinus = setConnectionPhase(initial, 'minus', 'reconnecting');
		expect(withMinus).toEqual({ minus: 'reconnecting', plus: 'connected' });
		expect(removeConnectionPhase(withMinus, 'minus')).toEqual({ plus: 'connected' });
	});
});

describe('reconnect controller', () => {
	test('uses one fast retry policy and starts remembered devices in parallel', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		const delays: number[] = [];
		const attempts: string[] = [];
		const controller = createBluetoothReconnectController<BluetoothDevice>({
			attempt: (device) => {
				attempts.push(device.id);
				return Promise.resolve(true);
			},
			canRetry: () => true,
			clearTimer: () => undefined,
			setTimer: ((callback: () => void, delay: number) => {
				callbacks.push(callback);
				delays.push(delay);
				return callbacks.length;
			}) as typeof setTimeout,
		});
		const devices = [{ id: 'trainer' }, { id: 'heart-rate' }, { id: 'click-plus' }];
		reconnectBluetoothDevicesNow(controller, devices as BluetoothDevice[]);

		expect(delays).toEqual([1, 1, 1]);
		expect(callbacks).toHaveLength(3);
		await Promise.all(callbacks.map((callback) => callback()));
		expect(attempts).toEqual(['trainer', 'heart-rate', 'click-plus']);
		expect([1, 2, 3, 4, 5].map(bluetoothReconnectDelay)).toEqual([250, 500, 1000, 2000, 2000]);
	});

	test('rediscovers a remembered HRM before reconnecting its out-of-range GATT device', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		let advertisementListener: EventListener | undefined;
		let watchSignal: AbortSignal | undefined;
		let observedBroadcast = false;
		const gatt = {
			connect: () => {
				if (!observedBroadcast) {
					return Promise.reject(
						new DOMException('Bluetooth Device is no longer in range.', 'NetworkError')
					);
				}
				gatt.connected = true;
				return Promise.resolve(gatt);
			},
			connected: false,
		};
		const device = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
				advertisementListener = listener as EventListener;
			},
			gatt,
			id: 'heart-rate',
			removeEventListener: () => {
				advertisementListener = undefined;
			},
			watchAdvertisements: ({ signal }: { signal?: AbortSignal }) => {
				watchSignal = signal;
				return Promise.resolve();
			},
			watchingAdvertisements: false,
		} as unknown as BluetoothDevice;
		const controller = createBluetoothReconnectController<BluetoothDevice>({
			attempt: async (remembered) => (await remembered.gatt?.connect())?.connected ?? false,
			canRetry: () => true,
			clearTimer: () => undefined,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});

		reconnectBluetoothDeviceNow(controller, device);
		await callbacks[0]?.();
		expect(gatt.connected).toBeFalse();
		expect(controller.isPending(device.id)).toBeTrue();

		if (watchSignal && !watchSignal.aborted && advertisementListener) {
			observedBroadcast = true;
			advertisementListener({} as Event);
		}
		await callbacks.at(-1)?.();
		expect(gatt.connected).toBeTrue();
		expect(controller.isPending(device.id)).toBeFalse();
	});

	test('refreshes a stale HRM scan without resetting backoff before rediscovery connects', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		const delays: number[] = [];
		const cleared: number[] = [];
		const watchSignals: AbortSignal[] = [];
		let advertisementListener: EventListener | undefined;
		let observedBroadcast = false;
		const gatt = {
			connect: () => {
				if (!observedBroadcast) {
					return Promise.reject(
						new DOMException('Bluetooth Device is no longer in range.', 'NetworkError')
					);
				}
				gatt.connected = true;
				return Promise.resolve(gatt);
			},
			connected: false,
		};
		const device = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
				advertisementListener = listener as EventListener;
			},
			gatt,
			id: 'heart-rate',
			removeEventListener: () => {
				advertisementListener = undefined;
			},
			watchAdvertisements: ({ signal }: { signal: AbortSignal }) => {
				watchSignals.push(signal);
				device.watchingAdvertisements = true;
				signal.addEventListener(
					'abort',
					() => {
						device.watchingAdvertisements = false;
					},
					{ once: true }
				);
				return Promise.resolve();
			},
			watchingAdvertisements: false,
		};
		const remembered = device as unknown as BluetoothDevice;
		const controller = createBluetoothReconnectController<BluetoothDevice>({
			attempt: async (target) => (await target.gatt?.connect())?.connected ?? false,
			canRetry: () => true,
			clearTimer: (timer) => {
				if (typeof timer === 'number') {
					cleared.push(timer);
				}
			},
			setTimer: ((callback: () => void, delay: number) => {
				callbacks.push(callback);
				delays.push(delay);
				return callbacks.length;
			}) as typeof setTimeout,
		});

		controller.start(device.id, remembered);
		await callbacks[0]?.();
		expect(gatt.connected).toBeFalse();
		expect(delays).toEqual([250, 500]);

		controller.restartDiscovery(device.id, remembered);
		expect(watchSignals).toHaveLength(2);
		expect(watchSignals[0]?.aborted).toBeTrue();
		expect(watchSignals[1]?.aborted).toBeFalse();
		expect(delays).toEqual([250, 500]);
		expect(cleared).toEqual([]);
		await callbacks[1]?.();
		expect(gatt.connected).toBeFalse();
		expect(delays).toEqual([250, 500, 1000]);
		expect(controller.isPending(device.id)).toBeTrue();

		if (watchSignals[1] && !watchSignals[1].aborted && advertisementListener) {
			observedBroadcast = true;
			advertisementListener({} as Event);
		}
		expect(delays).toEqual([250, 500, 1000, 1]);
		await callbacks[3]?.();
		expect(gatt.connected).toBeTrue();
		expect(controller.isPending(device.id)).toBeFalse();
		expect(watchSignals[1]?.aborted).toBeTrue();
	});

	test.each([
		'never started',
		'canceled',
		'manually canceled',
		'connected',
		'retry disabled',
	] as const)('does not revive or disturb discovery when %s', async (state) => {
		const callbacks = new Map<number, () => void | Promise<void>>();
		const watchSignals: AbortSignal[] = [];
		let nextTimer = 0;
		let attempts = 0;
		let canRetry = true;
		const gatt = { connected: false };
		const device = {
			addEventListener: () => undefined,
			gatt,
			id: 'heart-rate',
			removeEventListener: () => undefined,
			watchAdvertisements: ({ signal }: { signal: AbortSignal }) => {
				watchSignals.push(signal);
				return Promise.resolve();
			},
			watchingAdvertisements: false,
		} as unknown as BluetoothDevice;
		const controller = createBluetoothReconnectController<BluetoothDevice>({
			attempt: () => {
				attempts += 1;
				return Promise.resolve(true);
			},
			canRetry: () => canRetry,
			clearTimer: (timer) => {
				if (typeof timer === 'number') {
					callbacks.delete(timer);
				}
			},
			setTimer: ((callback: () => void) => {
				nextTimer += 1;
				callbacks.set(nextTimer, callback);
				return nextTimer;
			}) as typeof setTimeout,
		});

		if (state !== 'never started') {
			controller.start(device.id, device);
		}
		if (state === 'canceled' || state === 'manually canceled') {
			controller.cancel(device.id, state === 'manually canceled');
		}
		gatt.connected = state === 'connected';
		canRetry = state !== 'retry disabled';
		const pending = state === 'connected' || state === 'retry disabled';
		const previousTimers = [...callbacks.keys()];
		const previousWatchStates = watchSignals.map((signal) => signal.aborted);

		controller.restartDiscovery(device.id, device);

		expect(controller.isPending(device.id)).toBe(pending);
		expect([...callbacks.keys()]).toEqual(previousTimers);
		expect(watchSignals.map((signal) => signal.aborted)).toEqual(previousWatchStates);
		expect(gatt.connected).toBe(state === 'connected');
		if (state !== 'connected') {
			for (const callback of callbacks.values()) {
				await callback();
			}
			expect(attempts).toBe(0);
			expect(controller.isPending(device.id)).toBeFalse();
		}
		controller.cancelAll();
	});

	test('refreshes discovery during a handshake without overlapping or discarding its success', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		const watchSignals: AbortSignal[] = [];
		let advertisementListener: EventListener | undefined;
		let finishAttempt: (() => void) | undefined;
		let beginAttempt: (() => void) | undefined;
		let attempts = 0;
		let disconnects = 0;
		const attemptStarted = new Promise<void>((resolve) => {
			beginAttempt = resolve;
		});
		const gatt = {
			connect: () => {
				attempts += 1;
				beginAttempt?.();
				return new Promise<{ connected: boolean }>((resolve) => {
					finishAttempt = () => {
						gatt.connected = true;
						resolve(gatt);
					};
				});
			},
			connected: false,
			disconnect: () => {
				disconnects += 1;
				gatt.connected = false;
			},
		};
		const device = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
				advertisementListener = listener as EventListener;
			},
			gatt,
			id: 'heart-rate',
			removeEventListener: () => {
				advertisementListener = undefined;
			},
			watchAdvertisements: ({ signal }: { signal: AbortSignal }) => {
				watchSignals.push(signal);
				return Promise.resolve();
			},
			watchingAdvertisements: false,
		} as unknown as BluetoothDevice;
		const controller = createBluetoothReconnectController<BluetoothDevice>({
			attempt: async (target) => (await target.gatt?.connect())?.connected ?? false,
			canRetry: () => true,
			clearTimer: () => undefined,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});

		controller.start(device.id, device);
		const attempt = callbacks[0]?.();
		await attemptStarted;
		controller.restartDiscovery(device.id, device);
		advertisementListener?.({} as Event);

		expect(watchSignals).toHaveLength(2);
		expect(watchSignals[0]?.aborted).toBeTrue();
		expect(watchSignals[1]?.aborted).toBeFalse();
		expect(controller.isPending(device.id)).toBeTrue();
		expect(callbacks).toHaveLength(1);
		expect(attempts).toBe(1);
		expect(disconnects).toBe(0);
		finishAttempt?.();
		await attempt;
		expect(gatt.connected).toBeTrue();
		expect(controller.isPending(device.id)).toBeFalse();
		expect(callbacks).toHaveLength(1);
		expect(attempts).toBe(1);
		expect(disconnects).toBe(0);
		expect(watchSignals[1]?.aborted).toBeTrue();
	});

	test.each(['rejects', 'emits no events'] as const)(
		'keeps directly retrying a remembered device when advertisement discovery %s',
		async (watchOutcome) => {
			const callbacks: Array<() => void | Promise<void>> = [];
			let attempts = 0;
			const device = {
				addEventListener: () => undefined,
				id: 'heart-rate',
				removeEventListener: () => undefined,
				watchAdvertisements: () =>
					watchOutcome === 'rejects'
						? Promise.reject(
								new DOMException('Discovery unavailable', 'NotSupportedError')
							)
						: Promise.resolve(),
				watchingAdvertisements: false,
			} as unknown as BluetoothDevice;
			const controller = createBluetoothReconnectController<BluetoothDevice>({
				attempt: () => {
					attempts += 1;
					return Promise.resolve(attempts === 3);
				},
				canRetry: () => true,
				clearTimer: () => undefined,
				setTimer: ((callback: () => void) => {
					callbacks.push(callback);
					return callbacks.length;
				}) as typeof setTimeout,
			});

			reconnectBluetoothDeviceNow(controller, device);
			for (let attempt = 1; attempt <= 3; attempt += 1) {
				await callbacks.shift()?.();
				expect(attempts).toBe(attempt);
				expect(controller.isPending(device.id)).toBe(attempt < 3);
			}
			expect(callbacks).toHaveLength(0);
		}
	);

	test('keeps retrying through a long absence until the device connects', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		let attempts = 0;
		const controller = createReconnectController<string>({
			attempt: () => {
				attempts += 1;
				return Promise.resolve(attempts === 8);
			},
			canRetry: () => true,
			clearTimer: () => undefined,
			delayForAttempt: (attempt) => attempt * 100,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});
		controller.start('device', 'target');
		expect(controller.isPending('device')).toBeTrue();
		for (let attempt = 1; attempt <= 8; attempt += 1) {
			await callbacks.shift()?.();
			expect(attempts).toBe(attempt);
			expect(controller.isPending('device')).toBe(attempt < 8);
		}
		expect(controller.isPending('device')).toBeFalse();
	});

	test('does not restart after cancellation during an in-flight attempt', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		let finishAttempt: ((connected: boolean) => void) | undefined;
		const controller = createReconnectController<string>({
			attempt: () =>
				new Promise<boolean>((resolve) => {
					finishAttempt = resolve;
				}),
			canRetry: () => true,
			delayForAttempt: () => 100,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});

		controller.start('device', 'target');
		const attempt = callbacks.shift()?.();
		controller.cancel('device', true);
		finishAttempt?.(false);
		await attempt;

		expect(callbacks).toHaveLength(0);
		expect(controller.isPending('device')).toBeFalse();
	});

	test('does not let an obsolete queued timer remove a newer recovery attempt', async () => {
		const timers: Array<() => Promise<void>> = [];
		const attempted: string[] = [];
		const controller = createReconnectController<string>({
			attempt: (target) => {
				attempted.push(target);
				return Promise.resolve(true);
			},
			canRetry: () => true,
			clearTimer: () => undefined,
			delayForAttempt: () => 100,
			setTimer: ((callback: () => Promise<void>) => {
				timers.push(callback);
				return timers.length;
			}) as typeof setTimeout,
		});
		controller.start('heart-rate', 'old');
		controller.cancel('heart-rate', true);
		controller.start('heart-rate', 'recovered');
		await timers[0]?.();
		await timers[1]?.();
		expect(attempted).toEqual(['recovered']);
		expect(controller.isPending('heart-rate')).toBeFalse();
	});

	test('cancels retries and ignores duplicate scheduling', () => {
		const callbacks: Array<() => void> = [];
		const cleared: number[] = [];
		const controller = createReconnectController<string>({
			attempt: async () => false,
			canRetry: () => true,
			clearTimer: (timer) => {
				if (typeof timer === 'number') {
					cleared.push(timer);
				}
			},
			delayForAttempt: () => 100,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});
		controller.start('device', 'first');
		controller.start('device', 'second');
		expect(callbacks).toHaveLength(1);
		controller.cancel('device', true);
		expect(cleared).toEqual([1]);
		expect(controller.isPending('device')).toBeFalse();
	});

	test('schedules independent devices concurrently', () => {
		const callbacks: Array<() => void> = [];
		const controller = createReconnectController<string>({
			attempt: async () => true,
			canRetry: () => true,
			delayForAttempt: () => 100,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});
		controller.start('plus', 'plus');
		controller.start('minus', 'minus');
		expect(callbacks).toHaveLength(2);
		expect(controller.isPending('plus')).toBeTrue();
		expect(controller.isPending('minus')).toBeTrue();
	});

	test('preempts Bluetooth backoff as soon as the device advertises', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		const cleared: number[] = [];
		const delays: number[] = [];
		let advertisementListener: EventListener | undefined;
		let watchSignal: AbortSignal | undefined;
		let attempts = 0;
		const device = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
				advertisementListener = listener as EventListener;
			},
			id: 'heart-rate',
			removeEventListener: () => {
				advertisementListener = undefined;
			},
			watchAdvertisements: ({ signal }: { signal?: AbortSignal }) => {
				watchSignal = signal;
				return Promise.resolve();
			},
			watchingAdvertisements: false,
		} as unknown as BluetoothDevice;
		const controller = createBluetoothReconnectController<BluetoothDevice>({
			attempt: () => {
				expect(watchSignal?.aborted).toBeFalse();
				attempts += 1;
				return Promise.resolve(true);
			},
			canRetry: () => true,
			clearTimer: (timer) => {
				if (typeof timer === 'number') {
					cleared.push(timer);
				}
			},
			setTimer: ((callback: () => void, delay: number) => {
				callbacks.push(callback);
				delays.push(delay);
				return callbacks.length;
			}) as typeof setTimeout,
		});

		controller.start(device.id, device);
		expect(delays).toEqual([250]);
		advertisementListener?.({} as Event);
		expect(cleared).toEqual([1]);
		expect(delays).toEqual([250, 1]);
		expect(watchSignal?.aborted).toBeFalse();
		await callbacks[1]?.();
		expect(attempts).toBe(1);
		expect(controller.isPending(device.id)).toBeFalse();
		expect(advertisementListener).toBeUndefined();
		expect(watchSignal?.aborted).toBeTrue();
	});

	test('keeps discovery active during a connection attempt and stops it after success', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		let watchSignal: AbortSignal | undefined;
		const device = {
			addEventListener: () => undefined,
			id: 'trainer',
			removeEventListener: () => undefined,
			watchAdvertisements: ({ signal }: { signal?: AbortSignal }) => {
				watchSignal = signal;
				return Promise.resolve();
			},
			watchingAdvertisements: false,
		} as unknown as BluetoothDevice;
		const controller = createBluetoothReconnectController<BluetoothDevice>({
			attempt: () => {
				expect(watchSignal?.aborted).toBeFalse();
				return Promise.resolve(true);
			},
			canRetry: () => true,
			setTimer: ((callback: () => void) => {
				callbacks.push(callback);
				return callbacks.length;
			}) as typeof setTimeout,
		});

		controller.start(device.id, device);
		expect(watchSignal?.aborted).toBeFalse();
		await callbacks[0]?.();
		expect(controller.isPending(device.id)).toBeFalse();
		expect(watchSignal?.aborted).toBeTrue();
	});

	test('preserves retry backoff after an advertisement during an in-flight attempt', async () => {
		const callbacks: Array<() => void | Promise<void>> = [];
		const delays: number[] = [];
		let finishAttempt: ((connected: boolean) => void) | undefined;
		const controller = createReconnectController<string>({
			attempt: () =>
				new Promise<boolean>((resolve) => {
					finishAttempt = resolve;
				}),
			canRetry: () => true,
			delayForAttempt: () => 500,
			setTimer: ((callback: () => void, delay: number) => {
				callbacks.push(callback);
				delays.push(delay);
				return callbacks.length;
			}) as typeof setTimeout,
		});

		controller.start('heart-rate', 'device');
		const firstAttempt = callbacks[0]?.();
		controller.expedite('heart-rate', 'device', 1);
		finishAttempt?.(false);
		await firstAttempt;

		expect(delays).toEqual([500, 500]);
		expect(controller.isPending('heart-rate')).toBeTrue();
	});
});

describe('Bluetooth notifications', () => {
	test('owns listener setup and cleanup', async () => {
		const listeners = new Set<EventListenerOrEventListenerObject>();
		const characteristic = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.delete(listener),
			startNotifications: async () => characteristic,
		} as unknown as BluetoothRemoteGATTCharacteristic;
		const cleanup = await startBluetoothNotifications(characteristic, () => undefined);
		expect(listeners.size).toBe(1);
		cleanup();
		expect(listeners.size).toBe(0);
	});

	test('removes a listener when notification setup fails', async () => {
		const listeners = new Set<EventListenerOrEventListenerObject>();
		const characteristic = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.delete(listener),
			startNotifications: () => Promise.reject(new Error('unavailable')),
		} as unknown as BluetoothRemoteGATTCharacteristic;
		await expect(startBluetoothNotifications(characteristic, () => undefined)).rejects.toThrow(
			'unavailable'
		);
		expect(listeners.size).toBe(0);
	});

	test('times out stalled notification setup and removes its listener', async () => {
		const listeners = new Set<EventListenerOrEventListenerObject>();
		const characteristic = {
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
				listeners.delete(listener),
			startNotifications: () => new Promise(() => undefined),
		} as unknown as BluetoothRemoteGATTCharacteristic;
		await expect(
			startBluetoothNotifications(characteristic, () => undefined, 1)
		).rejects.toThrow('Bluetooth notification setup timed out.');
		expect(listeners.size).toBe(0);
	});
});
