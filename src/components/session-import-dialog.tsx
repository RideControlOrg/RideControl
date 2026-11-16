import { useEffect, useRef } from 'react';
import { useCloseOnEscape, useDialogInitialFocus } from '../hooks/use-dialog-behavior';
import { type ActivityImportResult, activityImportResultMessage } from '../lib/activity-import';

export function SessionImportResultDialog({
	error,
	fileName,
	onClose,
	result,
}: {
	error?: string;
	fileName: string;
	onClose: () => void;
	result?: ActivityImportResult;
}) {
	const dialogRef = useRef<HTMLElement>(null);
	const detailsRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const doneButtonRef = useDialogInitialFocus<HTMLButtonElement>();
	useCloseOnEscape(true, onClose);

	useEffect(() => {
		const dialog = dialogRef.current;
		const containFocus = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') {
				return;
			}
			let target: HTMLElement | null = detailsRef.current;
			if (event.target === detailsRef.current) {
				target = event.shiftKey ? closeButtonRef.current : doneButtonRef.current;
			} else if (event.shiftKey && event.target === closeButtonRef.current) {
				target = doneButtonRef.current;
			} else if (!event.shiftKey && event.target === doneButtonRef.current) {
				target = closeButtonRef.current;
			}
			event.preventDefault();
			target?.focus();
		};
		dialog?.addEventListener('keydown', containFocus);
		return () => dialog?.removeEventListener('keydown', containFocus);
	}, [doneButtonRef]);

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/70 p-3 backdrop-blur-sm sm:p-4">
			<button
				aria-label="Dismiss session import summary"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={onClose}
				tabIndex={-1}
				type="button"
			/>
			<section
				aria-describedby="session-import-result-description"
				aria-labelledby="session-import-result-title"
				aria-modal="true"
				className="bg-panel relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-600 shadow-2xl shadow-black/60 sm:max-h-[calc(100dvh-2rem)]"
				ref={dialogRef}
				role="dialog"
			>
				<header className="border-line flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
					<div className="min-w-0">
						<h2 className="text-2xl font-bold" id="session-import-result-title">
							{result && result.importedSessions.length > 0
								? 'Sessions imported with errors'
								: 'Session import failed'}
						</h2>
						<p className="mt-1 text-sm break-all text-slate-400">{fileName}</p>
					</div>
					<button
						aria-label="Close session import summary"
						className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						×
					</button>
				</header>
				<div
					aria-label="Session import details"
					className="space-y-4 overflow-y-auto px-5 py-5 text-sm sm:px-6"
					ref={detailsRef}
					role="document"
					tabIndex={-1}
				>
					<p className="text-slate-300" id="session-import-result-description">
						{result
							? activityImportResultMessage(result)
							: 'The selected file could not be imported.'}
					</p>
					{error ? (
						<p className="rounded-xl border border-rose-400/25 bg-rose-950/25 p-4 leading-relaxed wrap-break-word whitespace-pre-wrap text-rose-200">
							{error}
						</p>
					) : null}
					{result ? (
						<ul aria-label="Files that could not be imported" className="space-y-3">
							{result.failures.map((failure) => (
								<li
									className="rounded-xl border border-rose-400/25 bg-rose-950/25 p-4"
									key={failure.fileName}
								>
									<p className="font-semibold break-all text-slate-100">
										{failure.fileName}
									</p>
									<p className="mt-1 leading-relaxed wrap-break-word whitespace-pre-wrap text-rose-200">
										{failure.message}
									</p>
								</li>
							))}
						</ul>
					) : null}
					<p className="leading-relaxed text-slate-400">
						Review the errors, fix or export the affected files again, then retry the
						import. Any successfully imported sessions are saved; existing sessions will
						be skipped as duplicates when you retry.
					</p>
				</div>
				<footer className="border-line flex shrink-0 justify-end border-t px-5 py-4 sm:px-6">
					<button
						className="bg-lime text-ink rounded-lg px-5 py-2.5 text-sm font-bold hover:bg-[#e4ff9c]"
						onClick={onClose}
						ref={doneButtonRef}
						type="button"
					>
						Done
					</button>
				</footer>
			</section>
		</div>
	);
}
