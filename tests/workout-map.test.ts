import { describe, expect, test } from 'bun:test';
import { workoutRouteCoordinateAtProgress } from '../src/lib/workout-map';

describe('workout route maps', () => {
	test('interpolates an animated bike position through route distances', () => {
		const points = [
			{ distance: 0, elevation: 0, latitude: 10, longitude: 20 },
			{ distance: 2, elevation: 5, latitude: 12, longitude: 24 },
			{ distance: 6, elevation: 3, latitude: 16, longitude: 28 },
		];
		expect(workoutRouteCoordinateAtProgress(points, -1)).toEqual({
			latitude: 10,
			longitude: 20,
		});
		expect(workoutRouteCoordinateAtProgress(points, 0.5)).toEqual({
			latitude: 13,
			longitude: 25,
		});
		expect(workoutRouteCoordinateAtProgress(points, 2)).toEqual({
			latitude: 16,
			longitude: 28,
		});
		expect(workoutRouteCoordinateAtProgress([], 0.5)).toBeUndefined();
	});

	test('interpolates near the end of a detailed route', () => {
		const points = Array.from({ length: 10_001 }, (_, index) => ({
			distance: index / 1000,
			elevation: index / 100,
			latitude: 40 + index / 10_000,
			longitude: -120 + index / 20_000,
		}));
		const coordinate = workoutRouteCoordinateAtProgress(points, 0.999_95);
		expect(coordinate?.latitude).toBeCloseTo(40.999_95, 8);
		expect(coordinate?.longitude).toBeCloseTo(-119.500_025, 8);
	});
});
