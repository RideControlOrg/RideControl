import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_FILE_FORMAT, type ActivityFileFormat } from '../lib/activity-file';
import {
	type ActivityImportResult,
	activityImportResultMessage,
	importActivityUpload,
} from '../lib/activity-import';
import { errorMessage } from '../lib/errors';
import { downloadSessionFitArchive } from '../lib/fit-archive';
import {
	countSavedSessions,
	deleteSavedSession,
	getSavedSession,
	listAllSavedSessions,
	listSavedSessionJourney,
	listSavedSessions,
	sessionListAfterDelete,
} from '../lib/saved-sessions';
import { type CombinedSessionJourney, combineSessionJourney } from '../lib/session-continuation';
import { loadSelectedSessionId, saveSelectedSessionId } from '../lib/session-history-preferences';
import { downloadSessionTcxArchive } from '../lib/tcx-archive';
import type { SavedSession, SavedSessionSummary } from '../types';

const PAGE_SIZE = 30;

export function useSessionHistory(
	open: boolean,
	preferredSessionId?: string,
	onSelectSessionId?: (sessionId: string) => void
) {
	const [summaries, setSummaries] = useState<SavedSessionSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [selected, setSelected] = useState<SavedSession>();
	const [combinedJourney, setCombinedJourney] = useState<CombinedSessionJourney>();
	const [selectedId, setSelectedId] = useState(
		() => preferredSessionId ?? loadSelectedSessionId()
	);
	const selectedIdRef = useRef(selectedId);
	const [loading, setLoading] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [importing, setImporting] = useState(false);
	const [importResult, setImportResult] = useState<{
		error?: string;
		fileName: string;
		result?: ActivityImportResult;
	}>();
	const [historyStatus, setHistoryStatus] = useState('');
	const [highlightedSessionIds, setHighlightedSessionIds] = useState<string[]>([]);
	const [error, setError] = useState('');
	const [revision, setRevision] = useState(0);
	const deleteInProgress = useRef(false);
	const importGeneration = useRef(0);
	const historyOpen = useRef(open);
	const historyLoadGeneration = useRef(0);
	const historyInitialized = useRef(false);

	const rememberSelectedSession = useCallback(
		(id: string | undefined) => {
			selectedIdRef.current = id;
			setSelectedId(id);
			saveSelectedSessionId(id);
			if (id) {
				onSelectSessionId?.(id);
			}
		},
		[onSelectSessionId]
	);

	const selectSession = useCallback(
		async (id: string) => {
			rememberSelectedSession(id);
			setLoading(true);
			try {
				const session = await getSavedSession(id);
				setSelected(session);
				setCombinedJourney(
					session
						? combineSessionJourney(await listSavedSessionJourney(session), session.id)
						: undefined
				);
				setError('');
			} catch (loadError) {
				setError(errorMessage(loadError));
			} finally {
				setLoading(false);
			}
		},
		[rememberSelectedSession]
	);

	const loadHistory = useCallback(
		async (requestedSessionId?: string, includeAll = false) => {
			const generation = historyLoadGeneration.current + 1;
			historyLoadGeneration.current = generation;
			const [sessions, count] = await Promise.all([
				listSavedSessions(includeAll ? Number.MAX_SAFE_INTEGER : PAGE_SIZE),
				countSavedSessions(),
			]);
			if (generation !== historyLoadGeneration.current) {
				return;
			}
			setSummaries(sessions);
			setTotal(count);
			setRevision((current) => current + 1);
			setError('');
			const nextSessionId = sessions.some((session) => session.id === requestedSessionId)
				? requestedSessionId
				: sessions[0]?.id;
			if (nextSessionId) {
				await selectSession(nextSessionId);
			} else {
				setSelected(undefined);
				setCombinedJourney(undefined);
				rememberSelectedSession(undefined);
			}
		},
		[rememberSelectedSession, selectSession]
	);
	useEffect(
		() => () => {
			importGeneration.current += 1;
		},
		[]
	);

	useEffect(() => {
		historyOpen.current = open;
		if (!open) {
			historyLoadGeneration.current += 1;
			historyInitialized.current = false;
			setHistoryStatus('');
			setHighlightedSessionIds([]);
			return;
		}
		if (
			historyInitialized.current &&
			(!preferredSessionId || preferredSessionId === selectedIdRef.current)
		) {
			return;
		}
		const requestedSessionId = preferredSessionId ?? selectedIdRef.current;
		loadHistory(requestedSessionId, requestedSessionId !== undefined)
			.then(() => {
				historyInitialized.current = true;
			})
			.catch((loadError: unknown) => setError(errorMessage(loadError)));
	}, [loadHistory, open, preferredSessionId]);

	const clearImportResult = useCallback(() => setImportResult(undefined), []);

	const refreshImportedHistory = useCallback(
		async (result: ActivityImportResult, generation: number) => {
			const newestImported = result.importedSessions.reduce<SavedSession | undefined>(
				(newest, session) =>
					!newest || session.endedAt > newest.endedAt ? session : newest,
				undefined
			);
			if (!(newestImported && historyOpen.current)) {
				return;
			}
			try {
				await loadHistory(newestImported.id, true);
			} catch (loadError) {
				if (generation === importGeneration.current) {
					setError(errorMessage(loadError));
				}
			}
		},
		[loadHistory]
	);

	const importActivityFile = useCallback(
		async (file: File) => {
			const generation = importGeneration.current + 1;
			importGeneration.current = generation;
			setImporting(true);
			setImportResult(undefined);
			setHistoryStatus('');
			setHighlightedSessionIds([]);
			try {
				const result = await importActivityUpload(file);
				if (generation !== importGeneration.current) {
					return;
				}
				setHistoryStatus(activityImportResultMessage(result));
				setHighlightedSessionIds(result.importedSessions.map((session) => session.id));
				await refreshImportedHistory(result, generation);
				if (generation === importGeneration.current && result.failures.length > 0) {
					setImportResult({ fileName: file.name, result });
				}
			} catch (importError) {
				if (generation === importGeneration.current) {
					setImportResult({ error: errorMessage(importError), fileName: file.name });
				}
			} finally {
				if (generation === importGeneration.current) {
					setImporting(false);
				}
			}
		},
		[refreshImportedHistory]
	);

	const downloadAllActivityFiles = useCallback(async (format: ActivityFileFormat) => {
		setExporting(true);
		setHistoryStatus('');
		try {
			const sessions = await listAllSavedSessions();
			if (format === ACTIVITY_FILE_FORMAT.FIT) {
				await downloadSessionFitArchive(sessions);
			} else {
				await downloadSessionTcxArchive(sessions);
			}
			const label = format.toUpperCase();
			setHistoryStatus(
				`Downloaded ${sessions.length} ${label} ${sessions.length === 1 ? 'file' : 'files'} in one ZIP`
			);
			setError('');
		} finally {
			setExporting(false);
		}
	}, []);

	const deleteSelectedSession = useCallback(async () => {
		if (!selected || deleteInProgress.current) {
			return false;
		}
		deleteInProgress.current = true;
		setDeleting(true);
		try {
			await deleteSavedSession(selected.id);
			setHighlightedSessionIds((current) => current.filter((id) => id !== selected.id));
			const updated = sessionListAfterDelete(summaries, selected.id);
			setSummaries(updated.sessions);
			setTotal((current) => Math.max(0, current - 1));
			setRevision((current) => current + 1);
			setError('');
			if (updated.next) {
				await selectSession(updated.next.id);
			} else {
				setSelected(undefined);
				setCombinedJourney(undefined);
				rememberSelectedSession(undefined);
			}
			return true;
		} catch (deleteError) {
			setError(errorMessage(deleteError));
			return false;
		} finally {
			deleteInProgress.current = false;
			setDeleting(false);
		}
	}, [rememberSelectedSession, selected, selectSession, summaries]);

	const loadMore = useCallback(async () => {
		const last = summaries.at(-1);
		if (!last) {
			return;
		}
		try {
			const more = await listSavedSessions(PAGE_SIZE, last.endedAt);
			setSummaries((current) => [...current, ...more]);
			setError('');
		} catch (loadError) {
			setError(errorMessage(loadError));
		}
	}, [summaries]);

	return {
		clearImportResult,
		combinedJourney,
		deleteSelectedSession,
		deleting,
		downloadAllActivityFiles,
		error,
		exporting,
		highlightedSessionIds,
		historyStatus,
		importActivityFile,
		importing,
		importResult,
		loading,
		loadMore,
		revision,
		selected,
		selectedId,
		selectSession,
		summaries,
		total,
	};
}
