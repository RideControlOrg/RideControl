import { useSelector } from '@tanstack/react-store';
import { useCallback, useRef } from 'react';
import { errorMessage, unreachable } from '../lib/errors';
import {
	createSavedSession,
	requestPersistentSessionStorage,
	saveSession,
} from '../lib/saved-sessions';
import {
	SESSION_WORKFLOW_INTENT,
	SESSION_WORKFLOW_PHASE,
	type SessionWorkflow,
	type SessionWorkflowController,
	type SessionWorkflowIntent,
	sessionHistorySelectionAfterSave,
} from '../lib/session-workflow';
import { createSessionWorkflowStore } from '../stores/session-workflow-store';
import type { SavedSession, SessionMetadata } from '../types';

export function useSessionWorkflow(
	session: SessionWorkflowController,
	setNotice: (notice: string) => void,
	settleTrainerResistance: () => void,
	onEndedSessionSaved: (sessionId: string) => void
): SessionWorkflow {
	const sessionIsResolved = Boolean(session.savedSessionId) || session.discarded;
	const storeRef = useRef<ReturnType<typeof createSessionWorkflowStore> | undefined>(undefined);
	storeRef.current ??= createSessionWorkflowStore(session.ended && !sessionIsResolved);
	const store = storeRef.current;
	const state = useSelector(store);

	const startNewSession = useCallback(() => {
		session.startNew();
		store.actions.close();
		setNotice('New session ready.');
	}, [session.startNew, setNotice, store]);

	const extendSession = useCallback(
		(savedSession: SavedSession) => {
			session.extendFrom(savedSession, savedSession.id);
			store.actions.close();
			setNotice('Course continuation ready with fresh ride metrics.');
		},
		[session.extendFrom, setNotice, store]
	);

	const completeIntent = useCallback(
		(intent: SessionWorkflowIntent, savedSession?: SavedSession) => {
			const historySelection = sessionHistorySelectionAfterSave(intent, savedSession);
			session.endSession();
			settleTrainerResistance();
			switch (intent.kind) {
				case SESSION_WORKFLOW_INTENT.EXTEND:
					session.extendFrom(intent.session, intent.session.id);
					setNotice(
						savedSession
							? 'Session saved. Course continuation ready with fresh ride metrics.'
							: 'Course continuation ready with fresh ride metrics.'
					);
					break;
				case SESSION_WORKFLOW_INTENT.NEW:
					session.startNew();
					setNotice(
						savedSession ? 'Session saved. New session ready.' : 'New session ready.'
					);
					break;
				case SESSION_WORKFLOW_INTENT.END:
					if (savedSession) {
						setNotice('Session saved.');
					} else {
						session.markDiscarded();
						setNotice('Session ended without saving.');
					}
					break;
				default:
					unreachable(intent);
			}
			store.actions.close();
			if (historySelection) {
				onEndedSessionSaved(historySelection);
			}
		},
		[
			onEndedSessionSaved,
			session.endSession,
			session.extendFrom,
			session.markDiscarded,
			session.startNew,
			setNotice,
			settleTrainerResistance,
			store,
		]
	);

	const openPrompt = useCallback(
		(intent: SessionWorkflowIntent) => {
			if (store.get().phase === SESSION_WORKFLOW_PHASE.SAVING) {
				return;
			}
			session.prepareToEnd();
			store.actions.open(intent);
		},
		[session.prepareToEnd, store]
	);

	const endSession = useCallback(() => {
		openPrompt({ kind: SESSION_WORKFLOW_INTENT.END });
	}, [openPrompt]);

	const requestNewSession = useCallback(() => {
		if (store.get().phase === SESSION_WORKFLOW_PHASE.SAVING) {
			return;
		}
		if (session.ended) {
			if (sessionIsResolved) {
				startNewSession();
			} else {
				openPrompt({ kind: SESSION_WORKFLOW_INTENT.NEW });
			}
			return;
		}
		if (session.elapsedSeconds > 0) {
			openPrompt({ kind: SESSION_WORKFLOW_INTENT.NEW });
			return;
		}
		startNewSession();
	}, [
		session.elapsedSeconds,
		session.ended,
		sessionIsResolved,
		openPrompt,
		startNewSession,
		store,
	]);

	const requestExtension = useCallback(
		(savedSession: SavedSession) => {
			if (store.get().phase === SESSION_WORKFLOW_PHASE.SAVING) {
				return;
			}
			const currentNeedsSave =
				(session.ended && !sessionIsResolved) ||
				(!session.ended && session.elapsedSeconds > 0);
			if (!currentNeedsSave) {
				extendSession(savedSession);
				return;
			}
			openPrompt({ kind: SESSION_WORKFLOW_INTENT.EXTEND, session: savedSession });
		},
		[extendSession, session.elapsedSeconds, session.ended, sessionIsResolved, openPrompt, store]
	);

	const saveCurrentSession = useCallback(
		async (metadata: SessionMetadata) => {
			const current = store.get();
			if (current.phase !== SESSION_WORKFLOW_PHASE.PROMPT) {
				return;
			}
			const { intent } = current;
			store.actions.startSaving();
			try {
				const savedSession = createSavedSession(session.snapshot, metadata);
				await saveSession(savedSession);
				session.markSaved(savedSession.id);
				completeIntent(intent, savedSession);
			} catch (error) {
				store.actions.saveFailed();
				setNotice(`Session could not be saved: ${errorMessage(error)}`);
			}
		},
		[completeIntent, session.markSaved, session.snapshot, setNotice, store]
	);

	const proceedWithoutSaving = useCallback(() => {
		const current = store.get();
		if (current.phase === SESSION_WORKFLOW_PHASE.PROMPT) {
			completeIntent(current.intent);
		}
	}, [completeIntent, store]);
	const closeSaveDialog = useCallback(() => {
		if (store.get().phase !== SESSION_WORKFLOW_PHASE.PROMPT) {
			return;
		}
		session.cancelEnd();
		store.actions.close();
	}, [session.cancelEnd, store]);
	const openSaveDialog = endSession;
	const requestPersistentStorage = useCallback(
		() => requestPersistentSessionStorage().catch(() => false),
		[]
	);

	return {
		closeSaveDialog,
		endSession,
		openSaveDialog,
		proceedWithoutSaving,
		requestExtension,
		requestNewSession,
		requestPersistentStorage,
		saveCurrentSession,
		saveDialogIntent:
			state.phase === SESSION_WORKFLOW_PHASE.CLOSED
				? SESSION_WORKFLOW_INTENT.END
				: state.intent.kind,
		saveDialogOpen: state.phase !== SESSION_WORKFLOW_PHASE.CLOSED,
		saving: state.phase === SESSION_WORKFLOW_PHASE.SAVING,
		sessionIsResolved,
	};
}
