import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySession } from '../src/constants';
import { useSessionWorkflow } from '../src/hooks/use-session-workflow';
import { sessionWorkoutDistance } from '../src/lib/session-continuation';
import {
	SESSION_WORKFLOW_INTENT,
	SESSION_WORKFLOW_PHASE,
	type SessionWorkflow,
	sessionHistorySelectionAfterSave,
} from '../src/lib/session-workflow';
import { WORKOUT_COURSES } from '../src/lib/workouts';
import {
	createSessionStore,
	type SessionStore,
	sessionSnapshotFromState,
} from '../src/stores/session-store';
import {
	createSessionWorkflowStore,
	initialSessionWorkflowState,
} from '../src/stores/session-workflow-store';
import type { SavedSession, SessionSnapshot, StoredSession } from '../src/types';
import { savedSessionFixture } from './fixtures/saved-session';
import { requiredValue } from './test-values';

const course = requiredValue(WORKOUT_COURSES[0], 'built-in course');
const recordedSession: StoredSession = {
	...emptySession,
	...savedSessionFixture,
	continuation: {
		journeyId: 'earlier-journey',
		previousSessionId: 'earlier-session',
		workoutStartDistance: 5,
	},
	endedAt: 0,
	workout: { course },
};

function workflowForSession(store: SessionStore, settleResistance = () => undefined) {
	const session = {
		cancelEnd: store.actions.cancelEnd,
		get discarded() {
			return store.get().discarded;
		},
		get elapsedSeconds() {
			return store.get().elapsedSeconds;
		},
		get ended() {
			return store.get().ended;
		},
		endSession: () => store.actions.endSession(3000),
		extendFrom: (source: SessionSnapshot, previousSessionId?: string) =>
			store.actions.extendFrom(
				source,
				4000,
				source.continuation?.journeyId ?? previousSessionId ?? 'new-journey',
				previousSessionId
			),
		markDiscarded: store.actions.markDiscarded,
		markSaved: store.actions.markSaved,
		prepareToEnd: () => store.actions.prepareToEnd(2000),
		get savedSessionId() {
			return store.get().savedSessionId;
		},
		get selectedWorkout() {
			const current = store.get();
			return current.ended ? current.plannedWorkout : current.workout;
		},
		get snapshot() {
			return sessionSnapshotFromState(store.get());
		},
		startNew: () => store.actions.reset(store.get().controlMode, 4000),
	};
	let workflow: SessionWorkflow | undefined;
	function WorkflowHarness() {
		workflow = useSessionWorkflow(
			session,
			() => undefined,
			settleResistance,
			() => undefined
		);
		return null;
	}
	renderToStaticMarkup(createElement(WorkflowHarness));
	return requiredValue(workflow, 'rendered session workflow');
}

function expectFreshSession(store: SessionStore) {
	expect(store.get()).toMatchObject({
		aggregates: emptySession.aggregates,
		calories: 0,
		discarded: false,
		distance: 0,
		elapsedSeconds: 0,
		elevationTotals: emptySession.elevationTotals,
		ended: false,
		endedAt: 0,
		history: [],
		maximums: emptySession.maximums,
		workout: { course },
	});
	expect(store.get().continuation).toBeUndefined();
	expect(store.get().savedSessionId).toBeUndefined();
	expect(sessionWorkoutDistance(store.get())).toBe(0);
}

describe('session workflow lifecycle', () => {
	test('cancels a finish without changing recorded data or permanently settling resistance', () => {
		const store = createSessionStore(recordedSession);
		store.actions.syncRiding(true);
		const before = sessionSnapshotFromState(store.get());
		let resistance = 60;
		const workflow = workflowForSession(store, () => {
			resistance = 20;
		});

		workflow.endSession();
		expect(store.get()).toMatchObject({ ended: true, isRiding: false });
		expect(resistance).toBe(60);
		workflow.closeSaveDialog();
		store.actions.syncRiding(true);
		expect(store.get()).toMatchObject({ ended: false, isRiding: true });
		expect(sessionSnapshotFromState(store.get())).toEqual(before);
		expect(resistance).toBe(60);

		workflow.endSession();
		workflow.proceedWithoutSaving();
		workflow.closeSaveDialog();
		expect(store.get()).toMatchObject({ discarded: true, ended: true, isRiding: false });
		expect(resistance).toBe(20);
	});

	test('closing a saved completed ride keeps its end time and saved identity', () => {
		const store = createSessionStore({
			...recordedSession,
			ended: true,
			endedAt: 1000,
			savedSessionId: 'saved',
		});
		const workflow = workflowForSession(store);
		workflow.openSaveDialog();
		workflow.closeSaveDialog();
		store.actions.syncRiding(true);
		expect(store.get()).toMatchObject({
			ended: true,
			endedAt: 1000,
			isRiding: false,
			savedSessionId: 'saved',
		});
	});

	test('starts an ordinary new ride at course zero after a saved ride', () => {
		const store = createSessionStore({
			...recordedSession,
			ended: true,
			plannedWorkout: { course },
			savedSessionId: 'saved',
		});
		workflowForSession(store).requestNewSession();
		expectFreshSession(store);
	});

	test('starts an ordinary new ride at course zero after discarding the current ride', () => {
		const store = createSessionStore(recordedSession);
		const workflow = workflowForSession(store);
		workflow.requestNewSession();
		workflow.proceedWithoutSaving();
		expectFreshSession(store);
	});

	test('cancels a new-ride request back into the previous manual pause', () => {
		const store = createSessionStore(recordedSession);
		store.actions.togglePause(true);
		const before = sessionSnapshotFromState(store.get());
		const workflow = workflowForSession(store);
		workflow.requestNewSession();
		workflow.closeSaveDialog();
		store.actions.syncRiding(true);
		expect(store.get()).toMatchObject({
			ended: false,
			isRiding: false,
			manuallyPaused: true,
		});
		expect(sessionSnapshotFromState(store.get())).toEqual(before);
	});

	test('only an explicit saved-history extension continues its course position and lineage', () => {
		const store = createSessionStore(recordedSession);
		const source: SavedSession = {
			...savedSessionFixture,
			continuation: {
				journeyId: 'selected-history-journey',
				previousSessionId: 'selected-history-parent',
				workoutStartDistance: 10,
			},
			workout: { course },
		};
		const workflow = workflowForSession(store);
		workflow.requestExtension(source);
		workflow.closeSaveDialog();
		expect(sessionSnapshotFromState(store.get())).toEqual(
			sessionSnapshotFromState(createSessionStore(recordedSession).get())
		);

		workflow.requestExtension(source);
		workflow.proceedWithoutSaving();
		expect(store.get()).toMatchObject({
			continuation: {
				journeyId: source.continuation?.journeyId,
				previousSessionId: source.id,
				workoutStartDistance: 11.5,
			},
			distance: 0,
			elapsedSeconds: 0,
			ended: false,
			history: [],
		});
		expect(store.get().savedSessionId).toBeUndefined();
		expect(sessionWorkoutDistance(store.get())).toBe(11.5);
	});
});

describe('session workflow store', () => {
	test('opens with the ended-session intent when an unsaved session is restored', () => {
		expect(initialSessionWorkflowState(true)).toEqual({
			intent: { kind: SESSION_WORKFLOW_INTENT.END },
			phase: SESSION_WORKFLOW_PHASE.PROMPT,
		});
		expect(initialSessionWorkflowState(false)).toEqual({
			phase: SESSION_WORKFLOW_PHASE.CLOSED,
		});
	});

	test('selects a saved ended session without interrupting new or extended ride flows', () => {
		const savedSession = { id: 'saved-session' } as SavedSession;
		expect(
			sessionHistorySelectionAfterSave({ kind: SESSION_WORKFLOW_INTENT.END }, savedSession)
		).toBe(savedSession.id);
		expect(
			sessionHistorySelectionAfterSave({ kind: SESSION_WORKFLOW_INTENT.NEW }, savedSession)
		).toBeUndefined();
		expect(
			sessionHistorySelectionAfterSave(
				{ kind: SESSION_WORKFLOW_INTENT.EXTEND, session: savedSession },
				savedSession
			)
		).toBeUndefined();
	});

	test('preserves the requested next session while saving', () => {
		const session = { id: 'saved-session' } as SavedSession;
		const store = createSessionWorkflowStore(false);
		store.actions.open({ kind: SESSION_WORKFLOW_INTENT.EXTEND, session });
		const prompt = store.get();
		expect(prompt).toEqual({
			intent: { kind: SESSION_WORKFLOW_INTENT.EXTEND, session },
			phase: SESSION_WORKFLOW_PHASE.PROMPT,
		});
		store.actions.startSaving();
		expect(store.get()).toEqual({
			intent: { kind: SESSION_WORKFLOW_INTENT.EXTEND, session },
			phase: SESSION_WORKFLOW_PHASE.SAVING,
		});
		store.actions.saveFailed();
		expect(store.get()).toEqual(prompt);
	});

	test('ignores invalid transitions and closes atomically', () => {
		const store = createSessionWorkflowStore(false);
		const closed = store.get();
		store.actions.startSaving();
		expect(store.get()).toBe(closed);
		store.actions.saveFailed();
		expect(store.get()).toBe(closed);
		store.actions.open({ kind: SESSION_WORKFLOW_INTENT.NEW });
		store.actions.close();
		expect(store.get()).toEqual({ phase: SESSION_WORKFLOW_PHASE.CLOSED });
	});
});
