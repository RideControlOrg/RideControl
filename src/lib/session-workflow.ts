import type { SavedSession, SessionSnapshot, SessionWorkout } from '../types';

export interface SessionWorkflowController {
	discarded: boolean;
	elapsedSeconds: number;
	ended: boolean;
	endSession: () => void;
	extendFrom: (snapshot: SessionSnapshot, previousSessionId?: string) => void;
	markDiscarded: () => void;
	markSaved: (id: string) => void;
	savedSessionId?: string;
	selectedWorkout?: SessionWorkout;
	snapshot: SessionSnapshot;
	startNew: () => void;
}

export function finishRideSession(endSession: () => void, settleTrainerResistance: () => void) {
	endSession();
	settleTrainerResistance();
}

export const SESSION_WORKFLOW_INTENT = {
	END: 'end',
	EXTEND: 'extend',
	NEW: 'new',
} as const;

export const SESSION_WORKFLOW_PHASE = {
	CLOSED: 'closed',
	PROMPT: 'prompt',
	SAVING: 'saving',
} as const;

export type SessionWorkflowIntent =
	| { kind: typeof SESSION_WORKFLOW_INTENT.END }
	| { kind: typeof SESSION_WORKFLOW_INTENT.NEW }
	| { kind: typeof SESSION_WORKFLOW_INTENT.EXTEND; session: SavedSession };

export type SessionWorkflowState =
	| { phase: typeof SESSION_WORKFLOW_PHASE.CLOSED }
	| {
			intent: SessionWorkflowIntent;
			phase: typeof SESSION_WORKFLOW_PHASE.PROMPT | typeof SESSION_WORKFLOW_PHASE.SAVING;
	  };
