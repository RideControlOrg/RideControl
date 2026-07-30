import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { formatDistance, formatElevation } from '../lib/units';
import {
	GPX_IMPORT_PROCESSOR,
	type GpxImportProcessor,
	type WorkoutImportResult,
} from '../lib/workout-import';
import { workoutMaximumGrade } from '../lib/workout-metrics';
import { workoutDifficultyLabel } from '../lib/workouts';
import type { SpeedUnit } from '../types';

export function GpxImportChoiceDialog({
	fileName,
	onCancel,
	onChoose,
}: {
	fileName: string;
	onCancel: () => void;
	onChoose: (processor: GpxImportProcessor) => void;
}) {
	const enhancedButtonRef = useDialogInitialFocus<HTMLButtonElement>();
	useCloseOnEscape(true, onCancel);
	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
			<section
				aria-labelledby="gpx-import-choice-title"
				aria-modal="true"
				className="w-full max-w-lg rounded-2xl border border-slate-600 bg-panel p-5 shadow-2xl shadow-black/60 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h2 className="font-bold text-2xl" id="gpx-import-choice-title">
							Import GPX route
						</h2>
						<p className="mt-1 truncate text-slate-400 text-sm">{fileName}</p>
					</div>
					<button
						aria-label="Cancel GPX import"
						className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onCancel}
						type="button"
					>
						×
					</button>
				</div>
				<p className="mt-5 text-slate-300 text-sm leading-relaxed">
					Enhanced processing removes unusable points, smooths elevation noise and
					implausible grade spikes, and calculates a more accurate terrain profile. The
					file is sent securely to the Ride Control Worker for this request and is not
					stored.
				</p>
				<p className="mt-3 text-slate-400 text-xs leading-relaxed">
					You can keep the file entirely on this device instead. Local processing is less
					complete but still validates the route and creates the best workout it can.
				</p>
				<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						className="rounded-lg px-4 py-2.5 font-semibold text-slate-300 text-sm hover:bg-slate-800 hover:text-white"
						onClick={() => onChoose(GPX_IMPORT_PROCESSOR.LOCAL)}
						type="button"
					>
						Process on this device
					</button>
					<button
						className="rounded-lg bg-lime px-5 py-2.5 font-bold text-ink text-sm hover:bg-[#e4ff9c]"
						onClick={() => onChoose(GPX_IMPORT_PROCESSOR.WORKER)}
						ref={enhancedButtonRef}
						type="button"
					>
						Use enhanced processing
					</button>
				</div>
			</section>
		</div>
	);
}

export function GpxImportResultDialog({
	error,
	fileName,
	onClose,
	result,
	speedUnit,
}: {
	error?: string;
	fileName: string;
	onClose: () => void;
	result?: WorkoutImportResult;
	speedUnit: SpeedUnit;
}) {
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>();
	useCloseOnEscape(true, onClose);
	const course = result?.course;
	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
			<section
				aria-labelledby="gpx-import-result-title"
				aria-modal="true"
				className="w-full max-w-lg rounded-2xl border border-slate-600 bg-panel p-5 shadow-2xl shadow-black/60 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h2 className="font-bold text-2xl" id="gpx-import-result-title">
							{course ? 'GPX route imported' : 'GPX import failed'}
						</h2>
						<p className="mt-1 truncate text-slate-400 text-sm">{fileName}</p>
					</div>
					<button
						aria-label="Close GPX import summary"
						className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>
				{course && result ? (
					<>
						<dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
							<div>
								<dt className="font-semibold text-slate-500 text-xs">Route</dt>
								<dd className="mt-1 font-semibold text-white">{course.name}</dd>
							</div>
							<div>
								<dt className="font-semibold text-slate-500 text-xs">Processing</dt>
								<dd className="mt-1 font-semibold text-white">
									{result.processor === GPX_IMPORT_PROCESSOR.WORKER
										? 'Enhanced Worker'
										: 'On this device'}
								</dd>
							</div>
							<div>
								<dt className="font-semibold text-slate-500 text-xs">Distance</dt>
								<dd className="mt-1 font-semibold text-white">
									{formatDistance(course.distance, speedUnit, 1)}
								</dd>
							</div>
							<div>
								<dt className="font-semibold text-slate-500 text-xs">Climbing</dt>
								<dd className="mt-1 font-semibold text-white">
									{formatElevation(course.elevationGain, speedUnit)}
								</dd>
							</div>
							<div>
								<dt className="font-semibold text-slate-500 text-xs">
									Route points
								</dt>
								<dd className="mt-1 font-semibold text-white">
									{course.points.length.toLocaleString()}
								</dd>
							</div>
							<div>
								<dt className="font-semibold text-slate-500 text-xs">Terrain</dt>
								<dd className="mt-1 font-semibold text-white">
									{workoutDifficultyLabel(course.difficulty)} · up to +
									{workoutMaximumGrade(course).toFixed(1)}%
								</dd>
							</div>
						</dl>
						<div className="mt-5 border-line border-t pt-4">
							<h3 className="font-semibold text-slate-300 text-sm">Import checks</h3>
							{result.warnings.length > 0 ? (
								<ul className="mt-2 space-y-2 text-amber-200 text-xs leading-relaxed">
									{result.warnings.map((warning) => (
										<li key={warning}>• {warning}</li>
									))}
								</ul>
							) : (
								<p className="mt-2 text-mint text-xs">
									No import errors were found.
								</p>
							)}
						</div>
					</>
				) : (
					<p
						aria-live="assertive"
						className="mt-5 rounded-xl border border-rose-400/25 bg-rose-950/25 p-4 text-rose-200 text-sm leading-relaxed"
					>
						{error || 'The file could not be imported.'}
					</p>
				)}
				<div className="mt-6 flex justify-end">
					<button
						className="rounded-lg bg-lime px-5 py-2.5 font-bold text-ink text-sm hover:bg-[#e4ff9c]"
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						Done
					</button>
				</div>
			</section>
		</div>
	);
}
