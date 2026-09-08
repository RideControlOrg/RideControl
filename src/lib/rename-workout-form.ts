import { z } from 'zod';
import { MAX_WORKOUT_NAME_LENGTH } from './workout-file';

// Keep the same UTF-16 length limit as the text input and stored workout names.
export const renameWorkoutFormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Enter a workout name.')
		.refine(
			(value) => value.length <= MAX_WORKOUT_NAME_LENGTH,
			`Workout names can be at most ${MAX_WORKOUT_NAME_LENGTH} characters.`
		),
});

export type RenameWorkoutFormValues = z.input<typeof renameWorkoutFormSchema>;
