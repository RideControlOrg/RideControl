import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';

export function RemoveWorkoutDialog({
	courseName,
	onCancel,
	onConfirm,
	open,
}: {
	courseName: string;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}) {
	const confirmButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	useCloseOnEscape(open, onCancel);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<button
				aria-label="Cancel workout removal"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onCancel}
				type="button"
			/>
			<section
				aria-describedby="remove-workout-description"
				aria-labelledby="remove-workout-title"
				aria-modal="true"
				className="relative z-10 w-full max-w-sm rounded-2xl border border-rose-400/40 bg-panel p-5 shadow-2xl shadow-black/60"
				role="alertdialog"
			>
				<h2 className="font-bold text-lg" id="remove-workout-title">
					Remove this workout?
				</h2>
				<p
					className="mt-2 text-slate-400 text-sm leading-6"
					id="remove-workout-description"
				>
					<span className="font-semibold text-slate-200">{courseName}</span> will be
					removed from this device. Existing saved rides will keep their recorded workout
					details.
				</p>
				<div className="mt-5 flex justify-end gap-2">
					<button
						className="rounded-lg px-3 py-2 font-semibold text-slate-400 text-sm hover:bg-slate-800 hover:text-white"
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="rounded-lg bg-rose-700 px-3 py-2 font-bold text-sm text-white hover:bg-rose-600"
						onClick={onConfirm}
						ref={confirmButtonRef}
						type="button"
					>
						Remove workout
					</button>
				</div>
			</section>
		</div>
	);
}
