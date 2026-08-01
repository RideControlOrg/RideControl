export function sortedIndexAtOrAfter<T>(
	values: readonly T[],
	target: number,
	numericValue: (value: T) => number
): number {
	let lower = 0;
	let upper = values.length;
	while (lower < upper) {
		const middle = lower + Math.floor((upper - lower) / 2);
		const value = values[middle];
		if (value && numericValue(value) < target) {
			lower = middle + 1;
		} else {
			upper = middle;
		}
	}
	return lower;
}

export function valueRange<T>(
	values: readonly T[],
	numericValue: (value: T) => number
): { maximum: number; minimum: number } | undefined {
	if (values.length === 0) {
		return;
	}
	let maximum = Number.NEGATIVE_INFINITY;
	let minimum = Number.POSITIVE_INFINITY;
	for (const value of values) {
		const number = numericValue(value);
		maximum = Math.max(maximum, number);
		minimum = Math.min(minimum, number);
	}
	return { maximum, minimum };
}
