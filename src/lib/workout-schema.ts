export const WORKOUT_DIFFICULTY = {
	CHALLENGING: 'challenging',
	GENTLE: 'gentle',
	MODERATE: 'moderate',
} as const;

export type WorkoutDifficulty = (typeof WORKOUT_DIFFICULTY)[keyof typeof WORKOUT_DIFFICULTY];

const WORKOUT_DIFFICULTIES = new Set<unknown>(Object.values(WORKOUT_DIFFICULTY));

export function isWorkoutDifficulty(value: unknown): value is WorkoutDifficulty {
	return WORKOUT_DIFFICULTIES.has(value);
}

export const WORKOUT_ROUTE_TYPE = {
	LOOP: 'loop',
	OUT_AND_BACK: 'out-and-back',
	POINT_TO_POINT: 'point-to-point',
} as const;

export type WorkoutRouteType = (typeof WORKOUT_ROUTE_TYPE)[keyof typeof WORKOUT_ROUTE_TYPE];

const WORKOUT_ROUTE_TYPES = new Set<unknown>(Object.values(WORKOUT_ROUTE_TYPE));

export function isWorkoutRouteType(value: unknown): value is WorkoutRouteType {
	return WORKOUT_ROUTE_TYPES.has(value);
}

export function workoutRouteLabel(routeType: WorkoutRouteType): string {
	switch (routeType) {
		case WORKOUT_ROUTE_TYPE.LOOP:
			return 'loop';
		case WORKOUT_ROUTE_TYPE.OUT_AND_BACK:
			return 'out & back';
		case WORKOUT_ROUTE_TYPE.POINT_TO_POINT:
			return 'point to point';
		default:
			return routeType;
	}
}

export const WORKOUT_VIEW = {
	MAP: 'map',
	PROFILE: 'profile',
} as const;

export type WorkoutView = (typeof WORKOUT_VIEW)[keyof typeof WORKOUT_VIEW];
