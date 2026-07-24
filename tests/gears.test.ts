import { describe, expect, test } from 'bun:test';
import {
	clampGear,
	DEFAULT_GEAR,
	MAX_GEAR,
	MAXIMUM_VIRTUAL_DRIVE_RATIO,
	MIN_GEAR,
	MINIMUM_VIRTUAL_DRIVE_RATIO,
	maximumGear,
	neutralGear,
	resistanceAfterGearShift,
	resistanceForVirtualGear,
	shiftedGear,
	storedGear,
	VIRTUAL_GEAR_COMBINATIONS,
	virtualGearCombination,
	virtualGearCombinations,
	virtualGearLoadMultiplier,
	virtualGearRatio,
} from '../src/lib/gears';
import { KILOMETERS_PER_MILE } from '../src/lib/units';
import { WORKOUT_COURSES, workoutTerrainAtDistance } from '../src/lib/workouts';

describe('virtual gears', () => {
	test('clamps gear positions to the supported 1–24 range', () => {
		expect(clampGear(-4)).toBe(MIN_GEAR);
		expect(clampGear(8.6)).toBe(9);
		expect(clampGear(40)).toBe(MAX_GEAR);
		expect(shiftedGear(1, -1)).toBe(1);
		expect(shiftedGear(23, 1)).toBe(24);
	});

	test('restores a valid gear and falls back to the middle gear', () => {
		expect(storedGear({ getItem: () => '18' })).toBe(18);
		expect(storedGear({ getItem: () => 'invalid' })).toBe(DEFAULT_GEAR);
		expect(storedGear({ getItem: () => '0' })).toBe(DEFAULT_GEAR);
	});

	test('starts in the neutral gear when no virtual gear is remembered', () => {
		expect(storedGear({ getItem: () => null })).toBe(DEFAULT_GEAR);
		expect(neutralGear(11)).toBe(6);
		expect(neutralGear(12)).toBe(6);
		expect(storedGear({ getItem: () => null }, 11)).toBe(6);
		expect(storedGear({ getItem: () => null }, 12)).toBe(6);
	});

	test('orders every physical 2×12 combination from easiest to hardest', () => {
		expect(
			VIRTUAL_GEAR_COMBINATIONS.map(
				({ cassetteTeeth, chainringTeeth }) => `${chainringTeeth}/${cassetteTeeth}`
			)
		).toEqual([
			'39/24',
			'39/22',
			'39/21',
			'39/20',
			'39/19',
			'39/18',
			'53/24',
			'39/17',
			'53/22',
			'39/16',
			'53/21',
			'39/15',
			'53/20',
			'39/14',
			'53/19',
			'53/18',
			'39/13',
			'53/17',
			'39/12',
			'53/16',
			'53/15',
			'53/14',
			'53/13',
			'53/12',
		]);
		expect(virtualGearRatio(MIN_GEAR)).toBe(MINIMUM_VIRTUAL_DRIVE_RATIO);
		expect(virtualGearRatio(MAX_GEAR)).toBeCloseTo(MAXIMUM_VIRTUAL_DRIVE_RATIO, 10);
		expect(MINIMUM_VIRTUAL_DRIVE_RATIO).toBe(39 / 24);
		expect(MAXIMUM_VIRTUAL_DRIVE_RATIO).toBe(53 / 12);
		expect(virtualGearRatio(DEFAULT_GEAR)).toBe(39 / 15);
		expect(virtualGearCombination(DEFAULT_GEAR)).toMatchObject({
			cassetteTeeth: 15,
			chainringTeeth: 39,
			ratio: 39 / 15,
		});
		expect(virtualGearCombination(21)).toMatchObject({
			cassetteTeeth: 15,
			chainringTeeth: 53,
			ratio: 53 / 15,
		});
		expect(virtualGearRatio(2) / virtualGearRatio(1)).toBeCloseTo(
			virtualGearRatio(3) / virtualGearRatio(2),
			10
		);
		expect(virtualGearRatio(13) / virtualGearRatio(12)).toBeCloseTo(
			virtualGearRatio(14) / virtualGearRatio(13),
			10
		);
	});

	test('spreads prepared terrain load across the complete physical drivetrain', () => {
		expect(resistanceForVirtualGear(30, MIN_GEAR)).toBe(11.7);
		expect(resistanceForVirtualGear(30, DEFAULT_GEAR)).toBe(30);
		expect(resistanceForVirtualGear(30, MAX_GEAR)).toBe(86.6);
		expect(resistanceForVirtualGear(80, MAX_GEAR)).toBe(100);
		expect(virtualGearLoadMultiplier(DEFAULT_GEAR)).toBe(1);
	});

	test('ramps the hardest gears smoothly through a descent', () => {
		const lightRiderAndBikeKg = 68;
		expect(resistanceForVirtualGear(4, MIN_GEAR, undefined, lightRiderAndBikeKg)).toBe(1.3);
		expect(resistanceForVirtualGear(4, DEFAULT_GEAR, undefined, lightRiderAndBikeKg)).toBe(3.2);
		expect(
			Array.from({ length: 9 }, (_, index) =>
				resistanceForVirtualGear(4, 16 + index, undefined, lightRiderAndBikeKg)
			)
		).toEqual([7.8, 10.3, 12.9, 15.8, 19, 22.5, 26.2, 30.4, 34.9]);
		expect(resistanceForVirtualGear(4, MAX_GEAR, undefined, lightRiderAndBikeKg)).toBe(34.9);
		expect(resistanceAfterGearShift(4, DEFAULT_GEAR, MAX_GEAR)).toBe(34.9);
	});

	test('keeps a modest Prairie Roll climb easy in gear one', () => {
		const prairieRoll = WORKOUT_COURSES.find((course) => course.id === 'prairie-roll');
		if (!prairieRoll) {
			throw new Error('Expected the Prairie Roll workout course');
		}
		const terrain = workoutTerrainAtDistance(prairieRoll, 1.3 * KILOMETERS_PER_MILE);
		expect(terrain.grade).toBeCloseTo(1.8, 1);
		expect(terrain.resistance).toBe(16);
		expect(resistanceForVirtualGear(terrain.resistance, MIN_GEAR)).toBe(6.3);
		expect(resistanceForVirtualGear(terrain.resistance, DEFAULT_GEAR)).toBe(16);
		expect(resistanceForVirtualGear(terrain.resistance, MAX_GEAR)).toBe(46.2);
	});

	test('applies each interpolated ratio change to consecutive free-ride shifts', () => {
		const harder = resistanceAfterGearShift(30, 12, 13);
		expect(harder).toBe(32.8);
		expect(resistanceAfterGearShift(harder, 13, 12)).toBeCloseTo(30, 1);
		expect(resistanceAfterGearShift(3, 12, 1)).toBe(1.2);
	});

	test('builds personalized gear ratios and scales terrain by rider and bike mass', () => {
		const drivetrain = {
			frontChainringTeeth: [50, 34],
			rearCassetteTeeth: [11, 13, 15, 17],
		};
		expect(maximumGear(drivetrain)).toBe(8);
		expect(virtualGearCombinations(drivetrain).at(0)?.ratio).toBe(2);
		expect(virtualGearCombinations(drivetrain).at(-1)?.ratio).toBeCloseTo(50 / 11, 10);
		const defaultMassResistance = resistanceForVirtualGear(20, 4, drivetrain, 84);
		const heavierResistance = resistanceForVirtualGear(20, 4, drivetrain, 100);
		expect(heavierResistance).toBeGreaterThan(defaultMassResistance);
	});

	test('models 1×11 and 1×12 drivetrains across every rear gear', () => {
		for (const rearCassetteTeeth of [
			[11, 13, 15, 17, 19, 21, 24, 28, 32, 36, 42],
			[10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 50],
		]) {
			const drivetrain = {
				frontChainringTeeth: [42],
				rearCassetteTeeth,
			};
			const combinations = virtualGearCombinations(drivetrain);
			expect(maximumGear(drivetrain)).toBe(rearCassetteTeeth.length);
			expect(combinations).toHaveLength(rearCassetteTeeth.length);
			expect(combinations.at(0)?.ratio).toBe(42 / Math.max(...rearCassetteTeeth));
			expect(combinations.at(-1)?.ratio).toBe(42 / Math.min(...rearCassetteTeeth));
			expect(virtualGearCombination(1, drivetrain)).toMatchObject({
				cassetteTeeth: Math.max(...rearCassetteTeeth),
				chainringTeeth: 42,
			});
			expect(
				Array.from(
					{ length: rearCassetteTeeth.length - 1 },
					(_, index) =>
						virtualGearRatio(index + 2, drivetrain) >
						virtualGearRatio(index + 1, drivetrain)
				).every(Boolean)
			).toBeTrue();
		}
	});
});
