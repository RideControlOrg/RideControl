import { clamp } from './numbers';
import { clampResistance } from './resistance';

export const VIRTUAL_FRONT_CHAINRING_TEETH = [39, 53] as const;
export const VIRTUAL_REAR_CASSETTE_TEETH = [
	12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24,
] as const;
export const VIRTUAL_GEAR_COMBINATIONS = Object.freeze(
	VIRTUAL_FRONT_CHAINRING_TEETH.flatMap((chainringTeeth) =>
		VIRTUAL_REAR_CASSETTE_TEETH.map((cassetteTeeth) => ({
			cassetteTeeth,
			chainringTeeth,
			ratio: chainringTeeth / cassetteTeeth,
		}))
	).sort((left, right) => left.ratio - right.ratio)
);

export const MIN_GEAR = 1;
export const MAX_GEAR = VIRTUAL_GEAR_COMBINATIONS.length;
export const DEFAULT_GEAR = 12;
export const GEAR_STORAGE_KEY = 'trainer-virtual-gear';
export const SHIFTING_CONNECTION_MESSAGE =
	'Connect the trainer and controllers before shifting gears.';
export const MINIMUM_VIRTUAL_DRIVE_RATIO = Math.min(
	...VIRTUAL_GEAR_COMBINATIONS.map(({ ratio }) => ratio)
);
export const MAXIMUM_VIRTUAL_DRIVE_RATIO = Math.max(
	...VIRTUAL_GEAR_COMBINATIONS.map(({ ratio }) => ratio)
);

const RESISTANCE_PRECISION = 10;

export function clampGear(gear: number): number {
	return clamp(Math.round(gear), MIN_GEAR, MAX_GEAR);
}

export function storedGear(
	storage: Pick<Storage, 'getItem'> = localStorage,
	fallback = DEFAULT_GEAR
): number {
	const saved = Number(storage.getItem(GEAR_STORAGE_KEY));
	return Number.isFinite(saved) && saved > 0 ? clampGear(saved) : clampGear(fallback);
}

export function shiftedGear(current: number, change: number): number {
	return clampGear(current + change);
}

export function virtualGearRatio(gear: number): number {
	return (
		VIRTUAL_GEAR_COMBINATIONS.at(clampGear(gear) - MIN_GEAR)?.ratio ??
		MINIMUM_VIRTUAL_DRIVE_RATIO
	);
}

function roundedResistance(resistance: number): number {
	return Math.round(clampResistance(resistance) * RESISTANCE_PRECISION) / RESISTANCE_PRECISION;
}

export function resistanceForVirtualGear(baseResistance: number, gear: number): number {
	return roundedResistance(
		baseResistance * (virtualGearRatio(gear) / MINIMUM_VIRTUAL_DRIVE_RATIO)
	);
}

export function resistanceAfterGearShift(
	resistance: number,
	fromGear: number,
	toGear: number
): number {
	return roundedResistance(resistance * (virtualGearRatio(toGear) / virtualGearRatio(fromGear)));
}
