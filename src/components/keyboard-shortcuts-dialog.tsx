import { Fragment } from 'react';
import { useCloseOnEscape } from '../hooks/use-dialog-behavior';
import { dashboardKeyboardShortcuts, type KeyboardShortcutDescription } from '../lib/keyboard';

export function KeyboardShortcutsDialog({
	handleEscape = true,
	onClose,
	open,
	shortcuts = dashboardKeyboardShortcuts,
	title = 'Keyboard controls',
}: {
	handleEscape?: boolean;
	onClose: () => void;
	open: boolean;
	shortcuts?: KeyboardShortcutDescription[];
	title?: string;
}) {
	useCloseOnEscape(handleEscape && open, onClose);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<section
				aria-labelledby="keyboard-shortcuts-title"
				aria-modal="true"
				className="bg-panel w-full max-w-md rounded-2xl border border-slate-600 p-5 shadow-2xl shadow-black/50 sm:p-6"
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="text-2xl font-bold" id="keyboard-shortcuts-title">
						{title}
					</h2>
					<button
						aria-label="Close keyboard controls"
						className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>
				<div className="border-line mt-5 overflow-hidden rounded-xl border bg-[#12171d]">
					{shortcuts.map((shortcut, index) => (
						<Fragment key={shortcut.label}>
							{shortcut.group && shortcut.group !== shortcuts[index - 1]?.group ? (
								<div className="border-line bg-slate-800/40 px-3.5 py-2 text-[10px] font-bold tracking-[.14em] text-slate-500 not-first:border-t">
									{shortcut.group.toUpperCase()}
								</div>
							) : null}
							<div className="border-line flex min-h-12 items-center justify-between gap-5 px-3.5 py-2.5 not-first:border-t">
								<span className="text-sm text-slate-300">{shortcut.label}</span>
								<span className="flex shrink-0 gap-1.5">
									{shortcut.keys.map((key) => (
										<kbd
											className="min-w-8 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-center font-mono text-xs font-semibold text-slate-200 shadow-sm"
											key={key}
										>
											{key}
										</kbd>
									))}
								</span>
							</div>
						</Fragment>
					))}
				</div>
			</section>
		</div>
	);
}
