import { describe, expect, test } from 'bun:test';
import { CONTROL_MODE, trainingControlMode } from '../src/lib/control-mode';

describe('training control mode', () => {
	test('uses virtual gears for Click or terrain workouts', () => {
		expect(trainingControlMode(true, false)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(false, true)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(true, true)).toBe(CONTROL_MODE.GEAR);
		expect(trainingControlMode(false, false)).toBe(CONTROL_MODE.RESISTANCE);
	});
});
