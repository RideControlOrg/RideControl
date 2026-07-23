import { describe, expect, test } from 'bun:test';
import {
	CONTROL_MODE,
	trainingControlMode,
	virtualShiftingConnectionReady,
} from '../src/lib/control-mode';
import { SHIFTING_CONNECTION_MESSAGE } from '../src/lib/gears';

describe('training control mode', () => {
	test('uses virtual gears for Click or terrain workouts', () => {
		expect(trainingControlMode(true, false)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(false, true)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(true, true)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(false, false)).toBe(CONTROL_MODE.RESISTANCE);
	});

	test('requires only the trainer for virtual shifting', () => {
		expect(virtualShiftingConnectionReady({ trainerConnected: true })).toBeTrue();
		expect(
			virtualShiftingConnectionReady({
				trainerConnected: false,
			})
		).toBeFalse();
		expect(SHIFTING_CONNECTION_MESSAGE).toBe('Connect the trainer before shifting gears.');
	});
});
