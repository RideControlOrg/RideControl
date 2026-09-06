import { useEffect, useRef } from 'react';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { ACTIVITY_FILE_FORMAT, type ActivityFileFormat } from '../lib/activity-file';

const FORMAT_COMPARISON = [
	{
		data: 'Core ride metrics (time, distance, power, heart rate, cadence and speed)',
		fit: 'Yes',
		tcx: 'Yes',
	},
	{
		data: 'Recorded resistance',
		fit: 'Yes',
		tcx: 'Yes',
	},
	{
		data: 'Virtual gear history / control mode',
		fit: 'No',
		tcx: 'Yes',
	},
	{
		data: 'Ride notes / feeling',
		fit: 'No',
		tcx: 'Yes',
	},
	{
		data: 'Rider/bike physics snapshot (weights, drivetrain and bike identity)',
		fit: 'No',
		tcx: 'Yes',
	},
	{
		data: 'Full workout route / progress',
		fit: 'Partial — the matching route must already exist in RideControl.',
		tcx: 'Embedded',
	},
	{
		data: 'Original session ID / continuation links',
		fit: 'No — an imported ID is generated.',
		tcx: 'Yes',
	},
];

export function SessionDownloadDialog({
	downloading,
	error,
	onClose,
	onDownload,
}: {
	downloading: boolean;
	error?: string;
	onClose: () => void;
	onDownload: (format: ActivityFileFormat) => void;
}) {
	const dialogRef = useRef<HTMLElement>(null);
	const detailsRef = useRef<HTMLDivElement>(null);
	const comparisonRef = useRef<HTMLElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const fitButtonRef = useRef<HTMLButtonElement>(null);
	const cancelButtonRef = useRef<HTMLButtonElement>(null);
	const tcxButtonRef = useDialogInitialFocus<HTMLButtonElement>();
	useCloseOnEscape(!downloading, onClose);

	useEffect(() => {
		const dialog = dialogRef.current;
		const containFocus = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') {
				return;
			}
			const targets = downloading
				? [detailsRef.current, comparisonRef.current]
				: [
						closeButtonRef.current,
						detailsRef.current,
						comparisonRef.current,
						tcxButtonRef.current,
						fitButtonRef.current,
						cancelButtonRef.current,
					];
			const currentIndex = targets.indexOf(
				event.target instanceof HTMLElement ? event.target : null
			);
			const direction = event.shiftKey ? -1 : 1;
			const nextIndex = (currentIndex + direction + targets.length) % targets.length;
			event.preventDefault();
			targets[nextIndex]?.focus();
		};
		dialog?.addEventListener('keydown', containFocus);
		return () => dialog?.removeEventListener('keydown', containFocus);
	}, [downloading, tcxButtonRef]);

	useEffect(() => {
		if (downloading) {
			detailsRef.current?.focus();
		}
	}, [downloading]);

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/70 p-3 backdrop-blur-sm sm:p-4">
			<button
				aria-label="Dismiss download options"
				className="absolute inset-0 h-full w-full cursor-default"
				disabled={downloading}
				onClick={onClose}
				tabIndex={-1}
				type="button"
			/>
			<section
				aria-describedby="session-download-description"
				aria-labelledby="session-download-title"
				aria-modal="true"
				className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/60 sm:max-h-[calc(100dvh-2rem)]"
				ref={dialogRef}
				role="dialog"
			>
				<header className="flex shrink-0 items-start justify-between gap-4 border-line border-b px-5 py-4 sm:px-6">
					<h2 className="font-bold text-2xl" id="session-download-title">
						Download all sessions
					</h2>
					<button
						aria-label="Close download options"
						className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-50"
						disabled={downloading}
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						×
					</button>
				</header>
				<div
					aria-label="Download format details"
					className="min-h-0 space-y-4 overflow-y-auto px-5 py-5 text-sm sm:px-6"
					ref={detailsRef}
					role="document"
					tabIndex={-1}
				>
					<p className="text-slate-300 leading-relaxed" id="session-download-description">
						Choose a format for all sessions. TCX is recommended for importing back into
						RideControl because it preserves RideControl-specific data. FIT is useful
						for uploads to external fitness services.
					</p>
					<p className="text-slate-400 leading-relaxed">
						This comparison covers data restored from RideControl&apos;s own downloads
						when reimported into RideControl, not the full capabilities of each format.
					</p>
					<section
						aria-label="TCX and FIT comparison; scroll horizontally to view all columns"
						className="overflow-x-auto rounded-xl border border-line"
						ref={comparisonRef}
						tabIndex={-1}
					>
						<table className="w-full min-w-xl text-left text-sm">
							<caption className="sr-only">
								Data preserved when reimported into RideControl
							</caption>
							<thead className="bg-slate-800/70">
								<tr>
									<th className="w-2/5 px-4 py-3 font-semibold" scope="col">
										Session data
									</th>
									<th
										className="w-1/5 px-4 py-3 font-semibold text-lime"
										scope="col"
									>
										TCX
										<span className="mt-1 block font-normal text-xs">
											Recommended
										</span>
									</th>
									<th className="w-2/5 px-4 py-3 font-semibold" scope="col">
										FIT
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-line">
								{FORMAT_COMPARISON.map((row) => (
									<tr className="align-top" key={row.data}>
										<th
											className="px-4 py-3 font-medium text-slate-200"
											scope="row"
										>
											{row.data}
										</th>
										<td className="px-4 py-3 text-slate-300">{row.tcx}</td>
										<td className="px-4 py-3 text-slate-300">{row.fit}</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
					<p className="text-slate-400 leading-relaxed">
						TCX retains the extra RideControl data through RideControl-specific
						extensions. Another service may strip these extensions when re-exporting, so
						keep the original TCX files for a complete RideControl round trip.
					</p>
					{error ? (
						<p
							className="wrap-break-word whitespace-pre-wrap rounded-xl border border-rose-400/25 bg-rose-950/25 p-4 text-rose-200 leading-relaxed"
							role="alert"
						>
							{error}
						</p>
					) : null}
				</div>
				<footer className="shrink-0 space-y-3 border-line border-t px-5 py-4 sm:px-6">
					<p className="text-slate-300 text-sm empty:hidden" role="status">
						{downloading ? 'Preparing your download…' : ''}
					</p>
					<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
						<button
							className="rounded-lg bg-lime px-5 py-2.5 font-bold text-ink text-sm hover:bg-[#e4ff9c] disabled:opacity-50"
							disabled={downloading}
							onClick={() => onDownload(ACTIVITY_FILE_FORMAT.TCX)}
							ref={tcxButtonRef}
							type="button"
						>
							Download TCX
						</button>
						<button
							className="rounded-lg border border-slate-600 px-5 py-2.5 font-semibold text-slate-200 text-sm hover:bg-slate-700 disabled:opacity-50"
							disabled={downloading}
							onClick={() => onDownload(ACTIVITY_FILE_FORMAT.FIT)}
							ref={fitButtonRef}
							type="button"
						>
							Download FIT
						</button>
						<button
							className="rounded-lg px-5 py-2.5 font-semibold text-slate-400 text-sm hover:bg-slate-700 hover:text-white disabled:opacity-50"
							disabled={downloading}
							onClick={onClose}
							ref={cancelButtonRef}
							type="button"
						>
							Cancel
						</button>
					</div>
				</footer>
			</section>
		</div>
	);
}
