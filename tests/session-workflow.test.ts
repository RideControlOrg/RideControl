import { describe, expect, test } from 'bun:test';
import { initialSessionWorkflowState, sessionWorkflowReducer } from '../src/lib/session-workflow';
import type { SavedSession } from '../src/types';

describe('session workflow reducer', () => {
	test('opens with the ended-session intent when an unsaved session is restored', () => {
		expect(initialSessionWorkflowState(true)).toEqual({
			intent: { kind: 'end' },
			phase: 'prompt',
		});
		expect(initialSessionWorkflowState(false)).toEqual({ phase: 'closed' });
	});

	test('preserves the requested next session while saving', () => {
		const session = { id: 'saved-session' } as SavedSession;
		const prompt = sessionWorkflowReducer(
			{ phase: 'closed' },
			{ intent: { kind: 'continue', session }, type: 'open' }
		);
		expect(prompt).toEqual({ intent: { kind: 'continue', session }, phase: 'prompt' });
		const saving = sessionWorkflowReducer(prompt, { type: 'start-saving' });
		expect(saving).toEqual({ intent: { kind: 'continue', session }, phase: 'saving' });
		expect(sessionWorkflowReducer(saving, { type: 'save-failed' })).toEqual(prompt);
	});

	test('ignores invalid transitions and closes atomically', () => {
		const closed = { phase: 'closed' } as const;
		expect(sessionWorkflowReducer(closed, { type: 'start-saving' })).toBe(closed);
		expect(sessionWorkflowReducer(closed, { type: 'save-failed' })).toBe(closed);
		expect(
			sessionWorkflowReducer({ intent: { kind: 'new' }, phase: 'prompt' }, { type: 'close' })
		).toEqual(closed);
	});
});
