import { describe, expect, test } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import { WORKOUT_DESCRIPTION_ATTRIBUTION } from '../src/lib/workout-description';
import {
	addCustomWorkout,
	CUSTOM_WORKOUTS_STORAGE_KEY,
	canMoveWorkoutCourse,
	loadCustomWorkouts,
	loadWorkoutOrder,
	MAX_WORKOUT_NAME_LENGTH,
	moveWorkoutCourse,
	orderWorkoutCourses,
	parseWorkoutFile,
	prioritizeWorkoutCourse,
	readWorkoutFile,
	renameCustomWorkout,
	saveCustomWorkouts,
	saveWorkoutOrder,
	WORKOUT_GPX_EXTENSION_NAMESPACE,
	WORKOUT_ORDER_STORAGE_KEY,
	withoutCustomWorkout,
	workoutFileContents,
	workoutFilename,
} from '../src/lib/workout-file';
import { WORKOUT_ROUTE_TYPE } from '../src/lib/workout-schema';
import { outAndBackRoutePoints, restoreWorkoutCourse, WORKOUT_COURSES } from '../src/lib/workouts';
import type { WorkoutCourse } from '../src/types';

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: DOMParser });

function customWorkout(): WorkoutCourse {
	const [builtIn] = WORKOUT_COURSES;
	if (!builtIn) {
		throw new Error('Expected a built-in workout course');
	}
	return {
		...builtIn,
		id: 'ridge-river-test',
		name: 'Ridge & River / Test',
		startingLocation: 'Santa Cruz',
	};
}

function thirdPartyGpx(name = 'Neighborhood loop'): string {
	return `<?xml version="1.0"?>
<gpx version="1.1" creator="Bike computer" xmlns="http://www.topografix.com/GPX/1/1">
	<trk>
		<name>${name}</name>
		<desc>A real GPX loop</desc>
		<trkseg>
			<trkpt lat="37.000000" lon="-122.000000"><ele>12</ele></trkpt>
			<trkpt lat="37.001000" lon="-122.000000"><ele>22</ele></trkpt>
			<trkpt lat="37.001000" lon="-122.001000"><ele>18</ele></trkpt>
			<trkpt lat="37.000000" lon="-122.000000"><ele>12</ele></trkpt>
		</trkseg>
	</trk>
</gpx>`;
}

function openThirdPartyGpx(): string {
	return `<?xml version="1.0"?>
<gpx version="1.1" creator="Bike computer" xmlns="http://www.topografix.com/GPX/1/1">
	<trk>
		<name>Ridgeline turnaround</name>
		<desc>A point-to-point GPX track</desc>
		<trkseg>
			<trkpt lat="37.000000" lon="-122.000000"><ele>12</ele></trkpt>
			<trkpt lat="37.020000" lon="-122.000000"><ele>22</ele></trkpt>
			<trkpt lat="37.020000" lon="-122.020000"><ele>18</ele></trkpt>
			<trkpt lat="37.040000" lon="-122.040000"><ele>12</ele></trkpt>
		</trkseg>
	</trk>
</gpx>`;
}

function gpxWithoutDescription(): string {
	return thirdPartyGpx().replace('\n\t\t<desc>A real GPX loop</desc>', '');
}

describe('workout GPX files', () => {
	test('round trips geographic workout source data through standard GPX', async () => {
		const workout = customWorkout();
		const contents = workoutFileContents(workout);
		expect(contents).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
		expect(contents).toContain('<gpx version="1.1"');
		expect(contents).toContain(`xmlns:rc="${WORKOUT_GPX_EXTENSION_NAMESPACE}"`);
		expect(contents).toContain('<rc:FormatVersion>2</rc:FormatVersion>');
		expect(contents).toContain('<trkpt lat=');
		expect(contents).toContain('<ele>');
		expect(contents).toContain('<rc:BaseResistance>12.0</rc:BaseResistance>');
		expect(contents).toContain('<rc:CourseType>loop</rc:CourseType>');
		expect(contents).toContain('<rc:StartingLocation>Santa Cruz</rc:StartingLocation>');
		expect(contents).not.toContain('elevationGain');
		expect(contents).not.toContain('<rc:X>');
		const parsed = parseWorkoutFile(
			contents,
			new DOMParser() as unknown as globalThis.DOMParser
		);
		expect(parsed).toMatchObject({
			baseResistance: workout.baseResistance,
			description: workout.description,
			difficulty: workout.difficulty,
			distance: workout.distance,
			id: workout.id,
			name: workout.name,
			routeType: WORKOUT_ROUTE_TYPE.LOOP,
			startingLocation: 'Santa Cruz',
		});
		expect(parsed.points).toHaveLength(workout.points.length);
		expect(parsed.points[1]?.latitude).toBeCloseTo(workout.points[1]?.latitude ?? 0, 7);
		expect(await readWorkoutFile({ name: 'route.gpx', text: async () => contents })).toEqual(
			parsed
		);
		expect(workoutFilename(workout)).toBe('ride-control-ridge-river-test.gpx');
		expect(workoutFilename({ id: 'safe-fallback', name: '///' })).toBe(
			'ride-control-safe-fallback.gpx'
		);
	});

	test('imports ordinary GPX loops with a stable generated identifier', () => {
		const parser = new DOMParser() as unknown as globalThis.DOMParser;
		const first = parseWorkoutFile(thirdPartyGpx(), parser);
		const second = parseWorkoutFile(thirdPartyGpx('Renamed metadata'), parser);
		expect(first).toMatchObject({
			baseResistance: 12,
			description: 'A real GPX loop',
			difficulty: 'moderate',
			name: 'Neighborhood loop',
			routeType: WORKOUT_ROUTE_TYPE.LOOP,
		});
		expect(first.id).toStartWith('gpx-');
		expect(second.id).toBe(first.id);
	});

	test('labels a GPX without a description from its starting city', async () => {
		let resolvedPoint: { latitude: number; longitude: number } | undefined;
		const workout = await readWorkoutFile(
			{ name: 'city-loop.gpx', text: async () => gpxWithoutDescription() },
			(point) => {
				resolvedPoint = point;
				return Promise.resolve('Santa Cruz');
			}
		);
		expect(resolvedPoint).toMatchObject({ latitude: 37, longitude: -122 });
		expect(workout).toMatchObject({
			description: 'Starts in Santa Cruz.',
			descriptionAttribution: WORKOUT_DESCRIPTION_ATTRIBUTION.OPENSTREETMAP,
			startingLocation: 'Santa Cruz',
		});

		const roundTripped = parseWorkoutFile(
			workoutFileContents(workout),
			new DOMParser() as unknown as globalThis.DOMParser
		);
		expect(roundTripped.descriptionAttribution).toBe(
			WORKOUT_DESCRIPTION_ATTRIBUTION.OPENSTREETMAP
		);
		expect(roundTripped.startingLocation).toBe('Santa Cruz');
	});

	test('reuses a location saved with a workout instead of looking it up again', async () => {
		const resolved = await readWorkoutFile(
			{ name: 'city-loop.gpx', text: async () => gpxWithoutDescription() },
			async () => 'Santa Cruz'
		);
		let resolverCalled = false;
		const restored = await readWorkoutFile(
			{ name: 'saved-city-loop.gpx', text: async () => workoutFileContents(resolved) },
			() => {
				resolverCalled = true;
				return Promise.resolve('Unexpected city');
			}
		);
		expect(resolverCalled).toBeFalse();
		expect(restored.startingLocation).toBe('Santa Cruz');
	});

	test('keeps the generic description when the starting city is unavailable', async () => {
		const workout = await readWorkoutFile(
			{ name: 'remote-loop.gpx', text: async () => gpxWithoutDescription() },
			async () => undefined
		);
		expect(workout.description).toBe('Imported from a GPX route with elevation data.');
		expect(workout.descriptionAttribution).toBeUndefined();
	});

	test('does not look up a city when the GPX already has a description', async () => {
		let resolverCalled = false;
		const workout = await readWorkoutFile(
			{ name: 'described-loop.gpx', text: async () => thirdPartyGpx() },
			() => {
				resolverCalled = true;
				return Promise.resolve('Santa Cruz');
			}
		);
		expect(resolverCalled).toBeFalse();
		expect(workout.description).toBe('A real GPX loop');
	});

	test('imports open GPX tracks as one-way point-to-point courses', () => {
		const parser = new DOMParser() as unknown as globalThis.DOMParser;
		const workout = parseWorkoutFile(openThirdPartyGpx(), parser);
		expect(workout).toMatchObject({
			name: 'Ridgeline turnaround',
			routeType: WORKOUT_ROUTE_TYPE.POINT_TO_POINT,
		});
		expect(workout.points).toHaveLength(5);
		expect(workout.points.at(-1)).toMatchObject({
			elevation: 12,
			latitude: 37.04,
			longitude: -122.04,
		});
		expect(workout.points.map((point) => point.elevation)).toEqual([12, 12, 22, 18, 12]);

		const exported = workoutFileContents(workout);
		expect(exported).toContain('<rc:CourseType>point-to-point</rc:CourseType>');
		const roundTripped = parseWorkoutFile(exported, parser);
		expect(roundTripped).toMatchObject({
			description: workout.description,
			id: workout.id,
			name: workout.name,
			routeType: WORKOUT_ROUTE_TYPE.POINT_TO_POINT,
		});
		expect(roundTripped.distance).toBeCloseTo(workout.distance, 5);
		expect(roundTripped.points).toHaveLength(workout.points.length);
		for (const [index, point] of roundTripped.points.entries()) {
			expect(point.distance).toBeCloseTo(workout.points[index]?.distance ?? 0, 5);
			expect(point.elevation).toBeCloseTo(workout.points[index]?.elevation ?? 0);
		}
	});

	test('migrates previously generated GPX return legs to point-to-point routes', () => {
		const parser = new DOMParser() as unknown as globalThis.DOMParser;
		const pointToPoint = parseWorkoutFile(openThirdPartyGpx(), parser);
		const outbound = pointToPoint.points.map(({ x: _x, y: _y, ...point }) => point);
		const points = outAndBackRoutePoints(outbound);
		const legacy = restoreWorkoutCourse({
			...pointToPoint,
			distance: points.at(-1)?.distance,
			points,
			routeType: WORKOUT_ROUTE_TYPE.OUT_AND_BACK,
		});
		if (!legacy) {
			throw new Error('Expected a valid legacy GPX workout');
		}
		let saved = '';
		const storage = {
			getItem: () => saved,
			setItem: (_key: string, value: string) => {
				saved = value;
			},
		};
		saveCustomWorkouts([legacy], storage);
		const [migrated] = loadCustomWorkouts(storage);
		expect(migrated).toMatchObject({
			distance: pointToPoint.distance,
			id: pointToPoint.id,
			routeType: WORKOUT_ROUTE_TYPE.POINT_TO_POINT,
		});
		expect(migrated.points.at(-1)).toMatchObject(pointToPoint.points.at(-1) ?? {});
	});

	test('recognizes a route as a loop only when its endpoints are near for its length', () => {
		const parser = new DOMParser() as unknown as globalThis.DOMParser;
		const longRouteWithNearbyEndpoints = thirdPartyGpx()
			.replaceAll('37.001000', '37.010000')
			.replace(
				'<trkpt lat="37.000000" lon="-122.000000"><ele>12</ele></trkpt>\n\t\t</trkseg>',
				'<trkpt lat="37.000300" lon="-122.000000"><ele>12</ele></trkpt>\n\t\t</trkseg>'
			);
		const shortRouteWithSeparatedEndpoints = `<?xml version="1.0"?>
<gpx version="1.1" creator="Bike computer" xmlns="http://www.topografix.com/GPX/1/1">
	<trk><name>Short path</name><trkseg>
		<trkpt lat="37.000000" lon="-122.000000"><ele>10</ele></trkpt>
		<trkpt lat="37.001000" lon="-122.000000"><ele>12</ele></trkpt>
		<trkpt lat="37.000600" lon="-122.000000"><ele>11</ele></trkpt>
	</trkseg></trk>
</gpx>`;
		expect(parseWorkoutFile(longRouteWithNearbyEndpoints, parser).routeType).toBe(
			WORKOUT_ROUTE_TYPE.LOOP
		);
		expect(parseWorkoutFile(shortRouteWithSeparatedEndpoints, parser).routeType).toBe(
			WORKOUT_ROUTE_TYPE.POINT_TO_POINT
		);
	});

	test('rejects malformed and built-in workout imports', async () => {
		await expect(
			readWorkoutFile({ name: 'broken.gpx', text: async () => '<gpx><broken' })
		).rejects.toThrow();
		const [builtIn] = WORKOUT_COURSES;
		if (!builtIn) {
			throw new Error('Expected a built-in workout course');
		}
		expect(() => addCustomWorkout([], builtIn)).toThrow(
			`${builtIn.name} is already included with Ride Control.`
		);
	});

	test('persists, restores, rejects duplicates, and removes custom workouts by stable id', () => {
		const workout = customWorkout();
		let saved = '';
		const storage = {
			getItem: (key: string) => (key === CUSTOM_WORKOUTS_STORAGE_KEY ? saved : null),
			setItem: (key: string, value: string) => {
				if (key === CUSTOM_WORKOUTS_STORAGE_KEY) {
					saved = value;
				}
			},
		};
		const imported = addCustomWorkout([], workout);
		saveCustomWorkouts(imported.courses, storage);
		expect(loadCustomWorkouts(storage)).toEqual([workout]);

		const duplicateMetadata = { ...workout, name: 'Renamed route' };
		expect(() => addCustomWorkout(imported.courses, duplicateMetadata)).toThrow(
			`${workout.name} has already been imported.`
		);

		const renamed = renameCustomWorkout(imported.courses, workout.id, '  Morning hills  ');
		expect(renamed.course).toEqual({ ...workout, name: 'Morning hills' });
		expect(renamed.courses).toEqual([renamed.course]);
		expect(imported.course.name).toBe('Ridge & River / Test');
		saveCustomWorkouts(renamed.courses, storage);
		expect(loadCustomWorkouts(storage)).toEqual(renamed.courses);
		expect(() => renameCustomWorkout(renamed.courses, workout.id, '   ')).toThrow(
			'Enter a workout name.'
		);
		expect(() =>
			renameCustomWorkout(
				renamed.courses,
				workout.id,
				'x'.repeat(MAX_WORKOUT_NAME_LENGTH + 1)
			)
		).toThrow(`Workout names can be at most ${MAX_WORKOUT_NAME_LENGTH} characters.`);
		expect(() => renameCustomWorkout(renamed.courses, 'missing-workout', 'Name')).toThrow(
			'This imported workout is no longer available.'
		);
		expect(withoutCustomWorkout(imported.courses, workout.id)).toEqual([]);
	});

	test('reorders workouts by stable id and persists their positions', () => {
		const [first, second, third] = WORKOUT_COURSES;
		if (!(first && second && third)) {
			throw new Error('Expected at least three built-in workout courses');
		}
		const courses = [first, second, third];
		expect(moveWorkoutCourse(courses, first.id, courses.length)).toEqual([
			second,
			third,
			first,
		]);
		expect(moveWorkoutCourse(courses, third.id, 0)).toEqual([third, first, second]);
		expect(moveWorkoutCourse(courses, third.id, 1)).toEqual([first, third, second]);
		expect(moveWorkoutCourse(courses, second.id, 2)).toBe(courses);
		expect(moveWorkoutCourse(courses, 'missing', 0)).toBe(courses);
		expect(canMoveWorkoutCourse(courses, second.id, 1)).toBeFalse();
		expect(canMoveWorkoutCourse(courses, second.id, 2)).toBeFalse();
		expect(canMoveWorkoutCourse(courses, second.id, 0)).toBeTrue();
		expect(canMoveWorkoutCourse(courses, second.id, courses.length)).toBeTrue();
		expect(canMoveWorkoutCourse(courses, 'missing', 0)).toBeFalse();
		expect(orderWorkoutCourses(courses, [third.id, 'removed-workout', first.id])).toEqual([
			third,
			first,
			second,
		]);
		const imported = customWorkout();
		expect(
			prioritizeWorkoutCourse(
				[...courses, imported],
				[third.id, first.id, second.id],
				imported.id
			)
		).toEqual([imported, third, first, second]);

		let savedOrder = '';
		const storage = {
			getItem: (key: string) => (key === WORKOUT_ORDER_STORAGE_KEY ? savedOrder : null),
			setItem: (key: string, value: string) => {
				if (key === WORKOUT_ORDER_STORAGE_KEY) {
					savedOrder = value;
				}
			},
		};
		const expectedOrder = [third.id, first.id, second.id];
		saveWorkoutOrder(expectedOrder, storage);
		expect(loadWorkoutOrder(storage)).toEqual(expectedOrder);
		savedOrder = JSON.stringify([third.id, third.id, '', 12, first.id]);
		expect(loadWorkoutOrder(storage)).toEqual([third.id, first.id]);
		savedOrder = 'not json';
		expect(loadWorkoutOrder(storage)).toEqual([]);
	});
});
