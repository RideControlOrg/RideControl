import type { SavedSession, SessionMetadata, SessionSnapshot } from '../types';

export interface SessionWorkflowController {
	cancelEnd: () => void;
	discarded: boolean;
	elapsedSeconds: number;
	ended: boolean;
	endSession: () => void;
	extendFrom: (snapshot: SessionSnapshot, previousSessionId?: string) => void;
	markDiscarded: () => void;
	markSaved: (id: string) => void;
	prepareToEnd: () => void;
	savedSessionId?: string;
	snapshot: SessionSnapshot;
	startNew: () => void;
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

export interface SessionWorkflow {
	closeSaveDialog: () => void;
	endSession: () => void;
	openSaveDialog: () => void;
	proceedWithoutSaving: () => void;
	requestExtension: (session: SavedSession) => void;
	requestNewSession: () => void;
	requestPersistentStorage: () => Promise<boolean>;
	saveCurrentSession: (metadata: SessionMetadata) => Promise<void>;
	saveDialogIntent: SessionWorkflowIntent['kind'];
	saveDialogOpen: boolean;
	saving: boolean;
	sessionIsResolved: boolean;
}

export function sessionHistorySelectionAfterSave(
	intent: SessionWorkflowIntent,
	savedSession?: SavedSession
): string | undefined {
	return intent.kind === SESSION_WORKFLOW_INTENT.END ? savedSession?.id : undefined;
}

export type SessionWorkflowState =
	| { phase: typeof SESSION_WORKFLOW_PHASE.CLOSED }
	| {
			intent: SessionWorkflowIntent;
			phase: typeof SESSION_WORKFLOW_PHASE.PROMPT | typeof SESSION_WORKFLOW_PHASE.SAVING;
	  };
