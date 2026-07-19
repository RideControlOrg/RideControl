import { useCallback, useState } from 'react';
import { errorMessage } from '../lib/errors';
import {
	createSavedSession,
	requestPersistentSessionStorage,
	saveSession,
} from '../lib/saved-sessions';
import {
	initialSessionWorkflowState,
	type SessionWorkflowController,
	type SessionWorkflowIntent,
	sessionWorkflowReducer,
} from '../lib/session-workflow';
import type { SavedSession, SessionMetadata } from '../types';

export function useSessionWorkflow(
	session: SessionWorkflowController,
	setNotice: (notice: string) => void
) {
	const sessionIsSaved = Boolean(session.savedSessionId);
	const [state, setState] = useState(() =>
		initialSessionWorkflowState(session.ended && !sessionIsSaved)
	);
	const dispatch = useCallback((action: Parameters<typeof sessionWorkflowReducer>[1]) => {
		setState((current) => sessionWorkflowReducer(current, action));
	}, []);

	const startNewSession = useCallback(() => {
		session.startNew();
		dispatch({ type: 'close' });
		setNotice('New session ready.');
	}, [dispatch, session.startNew, setNotice]);

	const continueSession = useCallback(
		(savedSession: SavedSession) => {
			session.continueFrom(savedSession);
			dispatch({ type: 'close' });
			setNotice('Session continued.');
		},
		[dispatch, session.continueFrom, setNotice]
	);

	const completeIntent = useCallback(
		(intent: SessionWorkflowIntent, saved: boolean) => {
			if (intent.kind === 'continue') {
				session.continueFrom(intent.session);
				setNotice(
					saved ? 'Session saved. Selected session continued.' : 'Session continued.'
				);
			} else if (intent.kind === 'new' || !saved) {
				session.startNew();
				setNotice(saved ? 'Session saved. New session ready.' : 'New session ready.');
			} else {
				setNotice('Session saved.');
			}
			dispatch({ type: 'close' });
		},
		[dispatch, session.continueFrom, session.startNew, setNotice]
	);

	const endSession = useCallback(() => {
		session.endSession();
		dispatch({ intent: { kind: 'end' }, type: 'open' });
	}, [dispatch, session.endSession]);

	const requestNewSession = useCallback(() => {
		if (session.ended) {
			if (sessionIsSaved) {
				startNewSession();
			} else {
				dispatch({ intent: { kind: 'new' }, type: 'open' });
			}
			return;
		}
		if (session.elapsedSeconds > 0) {
			session.endSession();
			dispatch({ intent: { kind: 'new' }, type: 'open' });
			return;
		}
		startNewSession();
	}, [
		session.elapsedSeconds,
		session.endSession,
		session.ended,
		sessionIsSaved,
		startNewSession,
		dispatch,
	]);

	const requestContinuation = useCallback(
		(savedSession: SavedSession) => {
			const currentNeedsSave =
				(session.ended && !sessionIsSaved) ||
				(!session.ended && session.elapsedSeconds > 0);
			if (!currentNeedsSave) {
				continueSession(savedSession);
				return;
			}
			if (!session.ended) {
				session.endSession();
			}
			dispatch({ intent: { kind: 'continue', session: savedSession }, type: 'open' });
		},
		[
			continueSession,
			dispatch,
			session.elapsedSeconds,
			session.endSession,
			session.ended,
			sessionIsSaved,
		]
	);

	const saveCurrentSession = useCallback(
		async (metadata: SessionMetadata) => {
			if (state.phase === 'closed') {
				return;
			}
			const { intent } = state;
			dispatch({ type: 'start-saving' });
			try {
				const savedSession = createSavedSession(session.snapshot, metadata);
				await saveSession(savedSession);
				session.markSaved(savedSession.id);
				completeIntent(intent, true);
			} catch (error) {
				dispatch({ type: 'save-failed' });
				setNotice(`Session could not be saved: ${errorMessage(error)}`);
			}
		},
		[completeIntent, dispatch, session.markSaved, session.snapshot, setNotice, state]
	);

	const proceedWithoutSaving = useCallback(() => {
		if (state.phase !== 'closed') {
			completeIntent(state.intent, false);
		}
	}, [completeIntent, state]);
	const closeSaveDialog = useCallback(() => dispatch({ type: 'close' }), [dispatch]);
	const openSaveDialog = useCallback(
		() => dispatch({ intent: { kind: 'end' }, type: 'open' }),
		[dispatch]
	);
	const requestPersistentStorage = useCallback(
		() => requestPersistentSessionStorage().catch(() => false),
		[]
	);

	return {
		closeSaveDialog,
		continuing: state.phase !== 'closed' && state.intent.kind === 'continue',
		endSession,
		openSaveDialog,
		proceedWithoutSaving,
		requestContinuation,
		requestNewSession,
		requestPersistentStorage,
		saveCurrentSession,
		saveDialogOpen: state.phase !== 'closed',
		saving: state.phase === 'saving',
		sessionIsSaved,
	};
}
