interface LatestValueSchedulerOptions<T> {
	clearTimer?: typeof clearTimeout;
	minimumIntervalMs: number;
	now?: () => number;
	send: (value: T) => Promise<void>;
	setTimer?: typeof setTimeout;
}

export interface LatestValueScheduler<T> {
	clear: () => void;
	push: (value: T) => void;
}

export function createLatestValueScheduler<T>({
	clearTimer = clearTimeout,
	minimumIntervalMs,
	now = () => performance.now(),
	send,
	setTimer = setTimeout,
}: LatestValueSchedulerOptions<T>): LatestValueScheduler<T> {
	let hasPendingValue = false;
	let lastStartedAt = Number.NEGATIVE_INFINITY;
	let pending: { value: T } | undefined;
	let sending = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const schedule = () => {
		if (sending || timer !== undefined || !hasPendingValue || !pending) {
			return;
		}
		const wait = Math.max(0, minimumIntervalMs - (now() - lastStartedAt));
		if (wait > 0) {
			timer = setTimer(() => {
				timer = undefined;
				schedule();
			}, wait);
			return;
		}
		const { value } = pending;
		hasPendingValue = false;
		pending = undefined;
		sending = true;
		lastStartedAt = now();
		send(value)
			.catch(() => undefined)
			.finally(() => {
				sending = false;
				schedule();
			});
	};

	return {
		clear: () => {
			hasPendingValue = false;
			pending = undefined;
			lastStartedAt = Number.NEGATIVE_INFINITY;
			if (timer !== undefined) {
				clearTimer(timer);
				timer = undefined;
			}
		},
		push: (value) => {
			hasPendingValue = true;
			pending = { value };
			schedule();
		},
	};
}
