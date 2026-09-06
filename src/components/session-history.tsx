import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionHistory } from '../hooks/use-session-history';
import { useSessionInsights } from '../hooks/use-session-insights';
import type { ActivityFileFormat } from '../lib/activity-file';
import { APP_OVERLAY } from '../lib/app-overlay';
import {
	eventTargetsEditableControl,
	eventTargetsInteractiveControl,
	keyboardEventHasModifiers,
} from '../lib/dom';
import { errorMessage } from '../lib/errors';
import {
	type HistoryShortcut,
	historyKeyboardShortcuts,
	historyShortcutForKey,
} from '../lib/keyboard';
import type { RiderWeightEntry } from '../lib/profile';
import { adjacentSession } from '../lib/saved-sessions';
import {
	sessionCalendarMonth,
	sessionCalendarMonthFromKey,
	sessionCalendarMonthKey,
} from '../lib/session-calendar';
import {
	loadSessionHistoryView,
	SESSION_HISTORY_VIEW,
	SESSION_HISTORY_VIEW_OPTIONS,
	type SessionHistoryView,
	saveSessionHistoryView,
} from '../lib/session-history-view';
import { preferencesStore } from '../stores/preferences-store';
import type { ChartMode, SavedSession, SpeedUnit } from '../types';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import { SessionCalendar } from './session-calendar';
import { SessionDetail } from './session-detail';
import { SessionDownloadDialog } from './session-download-dialog';
import { SessionHistoryList } from './session-history-list';
import { SessionImportResultDialog } from './session-import-dialog';
import { SessionStatistics } from './session-statistics';
import { SideTray } from './side-tray';
import { Tabs } from './tabs';

function shouldIgnoreHistoryAction(event: KeyboardEvent) {
	return (
		event.defaultPrevented ||
		keyboardEventHasModifiers(event) ||
		eventTargetsEditableControl(event)
	);
}

function SessionHistoryStatus({ status, total }: { status: string; total: number }) {
	const count = total.toLocaleString();
	const sessions = `${count} ${total === 1 ? 'session' : 'sessions'}`;
	return (
		<p
			aria-label={`${sessions}${status ? `, ${status}` : ''}`}
			aria-live="polite"
			className="max-w-xl truncate text-slate-500 text-xs"
			role="status"
			title={`${sessions}${status ? ` · ${status}` : ''}`}
		>
			{count}
			{status ? <span className="text-cyan-300"> · {status}</span> : null}
		</p>
	);
}

export function SessionHistory({
	onClose,
	onSelectCalendarMonth,
	onSelectSessionId,
	onSelectView,
	onStartNew,
	open,
	requestedSessionId,
	requestedSessionMonth,
	requestedView,
	speedUnit,
	weightHistory = [],
}: {
	onClose: () => void;
	onSelectCalendarMonth: (month: string) => void;
	onSelectSessionId?: (sessionId: string) => void;
	onSelectView: (view: SessionHistoryView) => void;
	onStartNew: (session: SavedSession) => void;
	open: boolean;
	requestedSessionId?: string;
	requestedSessionMonth?: string;
	requestedView?: SessionHistoryView;
	speedUnit: SpeedUnit;
	weightHistory?: readonly RiderWeightEntry[];
}) {
	const {
		clearImportResult,
		combinedJourney,
		deleteSelectedSession: deleteHistorySession,
		deleting,
		downloadAllActivityFiles,
		error,
		exporting,
		historyStatus,
		highlightedSessionIds,
		importActivityFile,
		importing,
		importResult,
		loading,
		loadMore,
		revision,
		selected,
		selectedId,
		selectSession: selectHistorySession,
		summaries,
		total,
	} = useSessionHistory(open, requestedSessionId, onSelectSessionId);
	const [storedHistoryView, setStoredHistoryView] =
		useState<SessionHistoryView>(loadSessionHistoryView);
	const historyView = requestedView ?? storedHistoryView;
	const calendarMonth = useMemo(
		() =>
			sessionCalendarMonthFromKey(requestedSessionMonth) ??
			sessionCalendarMonth(selected ? new Date(selected.startedAt) : new Date()),
		[requestedSessionMonth, selected]
	);
	const {
		analytics,
		calendarSummaries,
		error: insightsError,
		loading: insightsLoading,
	} = useSessionInsights(open, calendarMonth, revision);
	const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
	const [historyHelpOpen, setHistoryHelpOpen] = useState(false);
	const [selectedChartMode, setSelectedChartMode] = useState<ChartMode>(
		() => preferencesStore.get().chartMode
	);
	const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
	const [downloadError, setDownloadError] = useState('');
	const downloadButton = useRef<HTMLButtonElement>(null);
	const downloadInProgress = useRef(false);
	const downloadGeneration = useRef(0);
	const restoreDownloadFocus = useRef(false);
	const importInput = useRef<HTMLInputElement>(null);
	const importButton = useRef<HTMLButtonElement>(null);
	const restoreImportFocus = useRef(false);
	const transferring = exporting || importing;
	const navigationSummaries =
		historyView === SESSION_HISTORY_VIEW.CALENDAR ? calendarSummaries : summaries;

	useEffect(() => {
		if (!open) {
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
			setDownloadDialogOpen(false);
			setDownloadError('');
			downloadGeneration.current += 1;
			restoreDownloadFocus.current = false;
		}
	}, [open]);

	const closeImportResult = useCallback(() => {
		restoreImportFocus.current = true;
		clearImportResult();
	}, [clearImportResult]);

	useEffect(() => {
		if (importResult || !restoreImportFocus.current) {
			return;
		}
		restoreImportFocus.current = false;
		// The disabled upload button loses focus before the dialog can remember it.
		if (open) {
			importButton.current?.focus();
		}
	}, [importResult, open]);

	const closeDownloadDialog = useCallback(() => {
		if (downloadInProgress.current) {
			return;
		}
		restoreDownloadFocus.current = true;
		setDownloadDialogOpen(false);
	}, []);

	const downloadAllSessions = useCallback(
		async (format: ActivityFileFormat) => {
			if (downloadInProgress.current) {
				return;
			}
			downloadInProgress.current = true;
			const generation = downloadGeneration.current;
			setDownloadError('');
			try {
				await downloadAllActivityFiles(format);
				if (generation === downloadGeneration.current) {
					restoreDownloadFocus.current = true;
					setDownloadDialogOpen(false);
				}
			} catch (preparationError) {
				if (generation === downloadGeneration.current) {
					setDownloadError(errorMessage(preparationError));
				}
			} finally {
				downloadInProgress.current = false;
			}
		},
		[downloadAllActivityFiles]
	);

	useEffect(() => {
		if (downloadDialogOpen || !restoreDownloadFocus.current) {
			return;
		}
		restoreDownloadFocus.current = false;
		if (open) {
			downloadButton.current?.focus();
		}
	}, [downloadDialogOpen, open]);

	const selectSession = useCallback(
		(id: string) => {
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
			selectHistorySession(id);
		},
		[selectHistorySession]
	);
	const selectCalendarMonth = useCallback(
		(month: Date) => onSelectCalendarMonth(sessionCalendarMonthKey(month)),
		[onSelectCalendarMonth]
	);

	const deleteSelectedSession = useCallback(async () => {
		if (await deleteHistorySession()) {
			setDeleteConfirmationOpen(false);
		}
	}, [deleteHistorySession]);

	useEffect(() => {
		if (!open || importResult || downloadDialogOpen) {
			return;
		}
		const selectAdjacent = (event: KeyboardEvent, direction: 'next' | 'previous') => {
			if (
				deleteConfirmationOpen ||
				historyHelpOpen ||
				historyView === SESSION_HISTORY_VIEW.STATISTICS
			) {
				return;
			}
			event.preventDefault();
			const next = adjacentSession(navigationSummaries, selectedId, direction);
			if (next) {
				selectSession(next.id);
			}
		};
		const shortcutHandlers: Record<HistoryShortcut, (event: KeyboardEvent) => void> = {
			close: (event) => {
				event.preventDefault();
				if (historyHelpOpen) {
					setHistoryHelpOpen(false);
				} else if (deleteConfirmationOpen) {
					setDeleteConfirmationOpen(false);
				} else {
					onClose();
				}
			},
			confirmDelete: (event) => {
				if (
					historyView === SESSION_HISTORY_VIEW.STATISTICS ||
					!deleteConfirmationOpen ||
					eventTargetsInteractiveControl(event)
				) {
					return;
				}
				event.preventDefault();
				deleteSelectedSession();
			},
			deleteSession: (event) => {
				if (
					deleteConfirmationOpen ||
					historyHelpOpen ||
					historyView === SESSION_HISTORY_VIEW.STATISTICS ||
					!selected
				) {
					return;
				}
				event.preventDefault();
				setDeleteConfirmationOpen(true);
			},
			help: (event) => {
				if (deleteConfirmationOpen || historyHelpOpen) {
					return;
				}
				event.preventDefault();
				setHistoryHelpOpen(true);
			},
			nextSession: (event) => selectAdjacent(event, 'next'),
			previousSession: (event) => selectAdjacent(event, 'previous'),
		};
		const handleHistoryKeys = (event: KeyboardEvent) => {
			const shortcut = historyShortcutForKey(event.key);
			if (!shortcut || (shortcut !== 'close' && shouldIgnoreHistoryAction(event))) {
				return;
			}
			shortcutHandlers[shortcut](event);
		};
		window.addEventListener('keydown', handleHistoryKeys);
		return () => window.removeEventListener('keydown', handleHistoryKeys);
	}, [
		deleteConfirmationOpen,
		deleteSelectedSession,
		downloadDialogOpen,
		historyHelpOpen,
		historyView,
		importResult,
		onClose,
		open,
		selectSession,
		selected,
		selectedId,
		navigationSummaries,
	]);

	const selectHistoryView = useCallback(
		(view: SessionHistoryView) => {
			setDeleteConfirmationOpen(false);
			setHistoryHelpOpen(false);
			setStoredHistoryView(view);
			saveSessionHistoryView(view);
			onSelectView(view);
		},
		[onSelectView]
	);
	const selectStatisticsSession = useCallback(
		(id: string) => {
			selectHistorySession(id);
			selectHistoryView(SESSION_HISTORY_VIEW.LIST);
		},
		[selectHistorySession, selectHistoryView]
	);

	let detail: ReactNode = null;
	if (loading) {
		detail = (
			<div className="grid min-h-64 flex-1 place-items-center text-slate-500 text-sm">
				Loading session…
			</div>
		);
	} else if (selected) {
		detail = (
			<SessionDetail
				chartKeyboardEnabled={
					open &&
					!(
						deleteConfirmationOpen ||
						historyHelpOpen ||
						importResult ||
						downloadDialogOpen
					)
				}
				combinedJourney={combinedJourney}
				deleteConfirmationOpen={deleteConfirmationOpen}
				deleting={deleting}
				key={selected.id}
				onCancelDelete={() => setDeleteConfirmationOpen(false)}
				onConfirmDelete={() => deleteSelectedSession()}
				onDelete={() => setDeleteConfirmationOpen(true)}
				onSelectChartMode={setSelectedChartMode}
				onSelectLinkedSession={selectSession}
				onStartNew={() => onStartNew(selected)}
				selectedChartMode={selectedChartMode}
				session={selected}
				speedUnit={speedUnit}
			/>
		);
	} else if (summaries.length > 0) {
		detail = (
			<div className="grid min-h-64 flex-1 place-items-center text-slate-500 text-sm">
				Select a session
			</div>
		);
	} else {
		detail = (
			<div className="grid min-h-64 flex-1 place-items-center p-6 text-center">
				<div>
					<p className="font-bold text-lg">No saved sessions yet</p>
					<p className="mt-1 max-w-sm text-slate-500 text-sm">
						End a session or import a FIT or TCX file to fill your calendar and build
						ride statistics.
					</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<SideTray
				closeLabel="Close session history"
				closeOnEscape={false}
				labelledBy="session-history-title"
				onClose={onClose}
				open={open}
				panelClassName="flex max-w-6xl flex-col overflow-hidden sm:w-[min(72rem,calc(100vw-2rem))]"
				tray={APP_OVERLAY.HISTORY}
			>
				<header className="relative flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 pr-24 pb-0 pl-5 sm:px-5 sm:pt-2 sm:pb-0">
					<div className="mr-auto flex min-w-0 items-center gap-2">
						<h2 className="font-bold text-xl" id="session-history-title">
							Sessions
						</h2>
						<SessionHistoryStatus status={historyStatus} total={total} />
					</div>
					<div className="flex flex-wrap items-center gap-1">
						<input
							accept=".fit,.tcx,.zip,application/vnd.ant.fit,application/vnd.garmin.tcx+xml,application/zip"
							className="hidden"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = '';
								if (file) {
									importActivityFile(file);
								}
							}}
							ref={importInput}
							type="file"
						/>
						<button
							className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-wait disabled:opacity-60"
							disabled={transferring}
							onClick={() => importInput.current?.click()}
							ref={importButton}
							type="button"
						>
							{importing ? 'Importing…' : 'Import FIT/TCX'}
						</button>
						<button
							className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-300 text-xs hover:border-cyan-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
							data-testid="download-all-sessions"
							disabled={transferring || total === 0}
							onClick={() => {
								setDownloadError('');
								setDeleteConfirmationOpen(false);
								setHistoryHelpOpen(false);
								setDownloadDialogOpen(true);
							}}
							ref={downloadButton}
							type="button"
						>
							{exporting ? 'Preparing…' : 'Download all'}
						</button>
						<button
							aria-label="Show history keyboard controls"
							className="absolute top-2 right-14 grid h-9 w-9 place-items-center rounded-lg font-bold text-slate-400 text-sm hover:bg-slate-700 hover:text-white sm:static"
							onClick={() => {
								setDeleteConfirmationOpen(false);
								setHistoryHelpOpen(true);
							}}
							type="button"
						>
							?
						</button>
						<button
							aria-label="Close session history"
							className="absolute top-2 right-3 grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white sm:static"
							onClick={onClose}
							type="button"
						>
							×
						</button>
					</div>
				</header>
				<Tabs
					ariaLabel="Session history views"
					idPrefix="session-history"
					onChange={selectHistoryView}
					options={SESSION_HISTORY_VIEW_OPTIONS}
					value={historyView}
				/>
				<div
					aria-labelledby={`session-history-tab-${historyView}`}
					className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none md:flex-row"
					id={`session-history-panel-${historyView}`}
					role="tabpanel"
				>
					{historyView === SESSION_HISTORY_VIEW.STATISTICS ? (
						<SessionStatistics
							analytics={analytics}
							error={insightsError}
							loading={insightsLoading}
							onSelectSession={selectStatisticsSession}
							speedUnit={speedUnit}
							weightHistory={weightHistory}
						/>
					) : (
						<>
							{historyView === SESSION_HISTORY_VIEW.CALENDAR ? (
								<SessionCalendar
									error={insightsError}
									loading={insightsLoading}
									month={calendarMonth}
									onChangeMonth={selectCalendarMonth}
									onSelect={selectSession}
									selectedId={selectedId}
									speedUnit={speedUnit}
									summaries={calendarSummaries}
								/>
							) : (
								<SessionHistoryList
									error={error}
									highlightedSessionIds={highlightedSessionIds}
									onLoadMore={loadMore}
									onSelect={selectSession}
									open={open}
									selectedId={selectedId}
									speedUnit={speedUnit}
									summaries={summaries}
									total={total}
								/>
							)}
							{detail}
						</>
					)}
				</div>
			</SideTray>
			<KeyboardShortcutsDialog
				handleEscape={false}
				onClose={() => setHistoryHelpOpen(false)}
				open={historyHelpOpen}
				shortcuts={historyKeyboardShortcuts}
				title="History keyboard controls"
			/>
			{open && downloadDialogOpen ? (
				<SessionDownloadDialog
					downloading={exporting}
					error={downloadError}
					onClose={closeDownloadDialog}
					onDownload={downloadAllSessions}
				/>
			) : null}
			{open && importResult ? (
				<SessionImportResultDialog
					error={importResult.error}
					fileName={importResult.fileName}
					onClose={closeImportResult}
					result={importResult.result}
				/>
			) : null}
		</>
	);
}
