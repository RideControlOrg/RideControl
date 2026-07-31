import { useSelector } from '@tanstack/react-store';
import { useCallback, useRef } from 'react';
import { errorMessage, unreachable } from '../lib/errors';
import {
	createSavedSession,
	requestPersistentSessionStorage,
	saveSession,
} from '../lib/saved-sessions';
import {
	finishRideSession,
	SESSION_WORKFLOW_INTENT,
	SESSION_WORKFLOW_PHASE,
	type SessionWorkflowController,
	type SessionWorkflowIntent,
} from '../lib/session-workflow';
import { createSessionWorkflowStore } from '../stores/session-workflow-store';
import type { SavedSession, SessionMetadata, SessionSnapshot } from '../types';

export function useSessionWorkflow(
	session: SessionWorkflowController,
	setNotice: (notice: string) => void,
	settleTrainerResistance: () => void
) {
	const sessionIsResolved = Boolean(session.savedSessionId) || session.discarded;
	const storeRef = useRef<ReturnType<typeof createSessionWorkflowStore> | undefined>(undefined);
	storeRef.current ??= createSessionWorkflowStore(session.ended && !sessionIsResolved);
	const store = storeRef.current;
	const state = useSelector(store);
	const finishSession = useCallback(
		() => finishRideSession(session.endSession, settleTrainerResistance),
		[session.endSession, settleTrainerResistance]
	);
	const { extendFrom: extendFromSession, selectedWorkout, startNew: resetSession } = session;

	const startFromCurrent = useCallback(
		(sourceSession: SessionSnapshot, previousSessionId?: string) => {
			const { workout: sourceWorkout } = sourceSession;
			if (
				sourceWorkout &&
				selectedWorkout &&
				sourceWorkout.course.id === selectedWorkout.course.id
			) {
				extendFromSession(sourceSession, previousSessionId);
			} else {
				resetSession();
			}
		},
		[extendFromSession, resetSession, selectedWorkout]
	);

	const startNewSession = useCallback(() => {
		if (session.elapsedSeconds > 0) {
			startFromCurrent(session.snapshot, session.savedSessionId);
		} else {
			session.startNew();
		}
		store.actions.close();
		setNotice('New session ready.');
	}, [
		session.elapsedSeconds,
		session.savedSessionId,
		session.snapshot,
		session.startNew,
		startFromCurrent,
		setNotice,
		store,
	]);

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
			switch (intent.kind) {
				case SESSION_WORKFLOW_INTENT.EXTEND:
					session.extendFrom(intent.session, intent.session.id);
					setNotice(
						savedSession
							? 'Session saved. Course continuation ready with fresh ride metrics.'
							: 'Course continuation ready with fresh ride metrics.'
					);
					break;
				case SESSION_WORKFLOW_INTENT.NEW: {
					const sourceSession = savedSession || session.snapshot;
					const previousSessionId = savedSession
						? savedSession.id
						: session.savedSessionId;
					startFromCurrent(sourceSession, previousSessionId);
					setNotice(
						savedSession
							? 'Session saved. New linked session ready.'
							: 'New linked session ready.'
					);
					break;
				}
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
		},
		[
			session.extendFrom,
			session.markDiscarded,
			session.savedSessionId,
			session.snapshot,
			setNotice,
			startFromCurrent,
			store,
		]
	);

	const endSession = useCallback(() => {
		finishSession();
		store.actions.open({ kind: SESSION_WORKFLOW_INTENT.END });
	}, [finishSession, store]);

	const requestNewSession = useCallback(() => {
		if (session.ended) {
			if (sessionIsResolved) {
				startNewSession();
			} else {
				store.actions.open({ kind: SESSION_WORKFLOW_INTENT.NEW });
			}
			return;
		}
		if (session.elapsedSeconds > 0) {
			finishSession();
			store.actions.open({ kind: SESSION_WORKFLOW_INTENT.NEW });
			return;
		}
		startNewSession();
	}, [
		session.elapsedSeconds,
		session.ended,
		sessionIsResolved,
		finishSession,
		startNewSession,
		store,
	]);

	const requestExtension = useCallback(
		(savedSession: SavedSession) => {
			const currentNeedsSave =
				(session.ended && !sessionIsResolved) ||
				(!session.ended && session.elapsedSeconds > 0);
			if (!currentNeedsSave) {
				extendSession(savedSession);
				return;
			}
			if (!session.ended) {
				finishSession();
			}
			store.actions.open({ kind: SESSION_WORKFLOW_INTENT.EXTEND, session: savedSession });
		},
		[
			extendSession,
			session.elapsedSeconds,
			session.ended,
			sessionIsResolved,
			finishSession,
			store,
		]
	);

	const saveCurrentSession = useCallback(
		async (metadata: SessionMetadata) => {
			if (state.phase === SESSION_WORKFLOW_PHASE.CLOSED) {
				return;
			}
			const { intent } = state;
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
		[completeIntent, session.markSaved, session.snapshot, setNotice, state, store]
	);

	const proceedWithoutSaving = useCallback(() => {
		if (state.phase !== SESSION_WORKFLOW_PHASE.CLOSED) {
			completeIntent(state.intent);
		}
	}, [completeIntent, state]);
	const closeSaveDialog = useCallback(() => store.actions.close(), [store]);
	const openSaveDialog = useCallback(
		() => store.actions.open({ kind: SESSION_WORKFLOW_INTENT.END }),
		[store]
	);
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
