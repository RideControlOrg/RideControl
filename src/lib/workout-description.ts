export const WORKOUT_DESCRIPTION_ATTRIBUTION = {
	OPENSTREETMAP: 'openstreetmap',
} as const;

export type WorkoutDescriptionAttribution =
	(typeof WORKOUT_DESCRIPTION_ATTRIBUTION)[keyof typeof WORKOUT_DESCRIPTION_ATTRIBUTION];

export const OPENSTREETMAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

export function isWorkoutDescriptionAttribution(
	value: unknown
): value is WorkoutDescriptionAttribution {
	return Object.values(WORKOUT_DESCRIPTION_ATTRIBUTION).some(
		(attribution) => attribution === value
	);
}
