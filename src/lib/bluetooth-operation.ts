import { BLUETOOTH_OPERATION_TIMEOUT_MS } from '../constants';
import { withPromiseTimeout } from './promise-timeout';

const RECOVERABLE_BLUETOOTH_MESSAGE =
	/(connection closed|device is disconnected|gatt server is disconnected|not connected)/i;

export class BluetoothOperationTimeoutError extends Error {
	constructor(description: string) {
		super(`${description} timed out.`);
		this.name = 'BluetoothOperationTimeoutError';
	}
}

export function recoverableBluetoothOperationError(error: unknown): boolean {
	if (error instanceof BluetoothOperationTimeoutError) {
		return true;
	}
	if (error instanceof DOMException) {
		return ['InvalidStateError', 'NetworkError', 'OperationError'].includes(error.name);
	}
	return error instanceof Error && RECOVERABLE_BLUETOOTH_MESSAGE.test(error.message);
}

export function withBluetoothOperationTimeout<T>(
	operation: Promise<T>,
	description: string,
	timeoutMs = BLUETOOTH_OPERATION_TIMEOUT_MS
): Promise<T> {
	return withPromiseTimeout(
		operation,
		timeoutMs,
		() => new BluetoothOperationTimeoutError(description)
	);
}
