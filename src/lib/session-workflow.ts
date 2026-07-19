import type { SavedSession, SessionSnapshot } from '../types';

export interface SessionWorkflowController {
	continueFrom: (snapshot: SessionSnapshot) => void;
	elapsedSeconds: number;
	ended: boolean;
	endSession: () => void;
	markSaved: (id: string) => void;
	savedSessionId?: string;
	snapshot: SessionSnapshot;
	startNew: () => void;
}

export type SessionWorkflowIntent =
	| { kind: 'end' }
	| { kind: 'new' }
	| { kind: 'continue'; session: SavedSession };

export type SessionWorkflowState =
	| { phase: 'closed' }
	| { intent: SessionWorkflowIntent; phase: 'prompt' | 'saving' };

export type SessionWorkflowAction =
	| { type: 'close' }
	| { intent: SessionWorkflowIntent; type: 'open' }
	| { type: 'save-failed' }
	| { type: 'start-saving' };

export function initialSessionWorkflowState(open: boolean): SessionWorkflowState {
	return open ? { intent: { kind: 'end' }, phase: 'prompt' } : { phase: 'closed' };
}

export function sessionWorkflowReducer(
	state: SessionWorkflowState,
	action: SessionWorkflowAction
): SessionWorkflowState {
	switch (action.type) {
		case 'close':
			return { phase: 'closed' };
		case 'open':
			return { intent: action.intent, phase: 'prompt' };
		case 'save-failed':
			return state.phase === 'saving' ? { ...state, phase: 'prompt' } : state;
		case 'start-saving':
			return state.phase === 'prompt' ? { ...state, phase: 'saving' } : state;
		default:
			return state;
	}
}
