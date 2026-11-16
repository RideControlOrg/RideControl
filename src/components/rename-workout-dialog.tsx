import { useForm, useSelector } from '@tanstack/react-form';
import { useEffect, useState } from 'react';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { errorMessage } from '../lib/errors';
import { renameWorkoutFormSchema } from '../lib/rename-workout-form';
import { MAX_WORKOUT_NAME_LENGTH } from '../lib/workout-file';
import type { WorkoutCourse } from '../types';
import { FormFieldError } from './form-field-error';

export function RenameWorkoutDialog({
	course,
	onClose,
	onRename,
}: {
	course: WorkoutCourse;
	onClose: () => void;
	onRename: (courseId: string, name: string) => void;
}) {
	const [renameError, setRenameError] = useState('');
	const nameInputRef = useDialogInitialFocus<HTMLInputElement>();
	useCloseOnEscape(true, onClose);
	const form = useForm({
		defaultValues: { name: course.name },
		onSubmit: ({ value }) => {
			setRenameError('');
			try {
				const validated = renameWorkoutFormSchema.parse(value);
				onRename(course.id, validated.name);
				onClose();
			} catch (error) {
				setRenameError(errorMessage(error));
			}
		},
		validators: {
			onChange: renameWorkoutFormSchema,
			onSubmit: renameWorkoutFormSchema,
		},
	});
	const canSubmit = useSelector(form.store, (state) => state.canSubmit);
	const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

	useEffect(() => {
		form.reset({ name: course.name });
		setRenameError('');
	}, [course.name, form]);

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<section
				aria-labelledby="rename-workout-title"
				aria-modal="true"
				className="bg-panel w-full max-w-md rounded-2xl border border-slate-600 p-5 shadow-2xl shadow-black/50 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="text-2xl font-bold" id="rename-workout-title">
						Rename workout
					</h2>
					<button
						aria-label="Close rename workout dialog"
						className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>
				<form
					className="mt-5"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					<form.Field name="name">
						{(field) => (
							<label className="block text-sm font-semibold" htmlFor="workout-name">
								Workout name
								<input
									className="border-line focus:border-mint mt-2 h-11 w-full rounded-xl border bg-[#10151a] px-3 text-sm outline-none placeholder:text-slate-600"
									id="workout-name"
									maxLength={MAX_WORKOUT_NAME_LENGTH}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="Name this workout"
									ref={nameInputRef}
									value={field.state.value}
								/>
								<FormFieldError field={field} />
							</label>
						)}
					</form.Field>
					{renameError ? (
						<p aria-live="assertive" className="mt-2 text-xs text-rose-300">
							{renameError}
						</p>
					) : null}
					<div className="mt-5 flex justify-end gap-2">
						<button
							className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"
							onClick={onClose}
							type="button"
						>
							Cancel
						</button>
						<button
							className="bg-lime text-ink rounded-lg px-5 py-2.5 text-sm font-bold hover:bg-[#e4ff9c] disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!canSubmit || isSubmitting}
							type="submit"
						>
							Save name
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}
