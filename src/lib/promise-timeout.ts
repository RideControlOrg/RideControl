export async function withPromiseTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	timeoutError: () => Error,
	signal?: AbortSignal
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let abort: (() => void) | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
				if (signal) {
					abort = () => reject(signal.reason);
					if (signal.aborted) {
						abort();
					} else {
						signal.addEventListener('abort', abort, { once: true });
					}
				}
			}),
		]);
	} finally {
		clearTimeout(timeout);
		if (abort) {
			signal?.removeEventListener('abort', abort);
		}
	}
}
