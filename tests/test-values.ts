export function requiredValue<T>(value: T | undefined, label: string): T {
	if (value === undefined) {
		throw new Error(`Expected ${label}`);
	}
	return value;
}
