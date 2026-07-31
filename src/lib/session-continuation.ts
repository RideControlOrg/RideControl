import { emptyMetrics, emptySession } from '../constants';
import type {
	MetricAggregate,
	SavedSession,
	SessionContinuation,
	SessionSnapshot,
	StoredSession,
} from '../types';
import { CONTROL_MODE } from './control-mode';
import { nonNegativeNumber } from './numbers';
import { isFiniteNumber, isRecord, isString } from './type-guards';

export interface CombinedSessionJourney {
	partCount: number;
	partNumber: number;
	session: SavedSession;
}

export function restoreSessionContinuation(value: unknown): SessionContinuation | undefined {
	if (!(isRecord(value) && isString(value.journeyId) && value.journeyId.length > 0)) {
		return;
	}
	return {
		journeyId: value.journeyId,
		previousSessionId:
			isString(value.previousSessionId) && value.previousSessionId.length > 0
				? value.previousSessionId
				: undefined,
		workoutStartDistance: isFiniteNumber(value.workoutStartDistance)
			? nonNegativeNumber(value.workoutStartDistance)
			: 0,
	};
}

export function sessionWorkoutDistance(
	session: Pick<SessionSnapshot, 'continuation' | 'distance'>
): number {
	return nonNegativeNumber(session.continuation?.workoutStartDistance) + session.distance;
}

export function freshSessionExtension(
	source: SessionSnapshot,
	startedAt: number,
	journeyId: string,
	previousSessionId?: string
): StoredSession {
	return {
		...emptySession,
		aggregates: emptySession.aggregates,
		continuation: {
			journeyId,
			previousSessionId,
			workoutStartDistance: sessionWorkoutDistance(source),
		},
		controlMode: source.controlMode,
		maximums: emptyMetrics,
		startedAt,
		workout: source.workout,
	};
}

function combinedAggregate(aggregates: MetricAggregate[]): MetricAggregate {
	return aggregates.reduce<MetricAggregate>(
		(combined, aggregate) => ({
			count: combined.count + aggregate.count,
			maximum: Math.max(
				nonNegativeNumber(combined.maximum),
				nonNegativeNumber(aggregate.maximum)
			),
			sum: combined.sum + aggregate.sum,
		}),
		{ count: 0, sum: 0 }
	);
}

function ancestryForSession(
	sessions: readonly SavedSession[],
	selected: SavedSession
): SavedSession[] {
	const sessionsById = new Map(sessions.map((session) => [session.id, session]));
	const ancestry: SavedSession[] = [];
	const visited = new Set<string>();
	let current: SavedSession | undefined = selected;
	while (current && !visited.has(current.id)) {
		visited.add(current.id);
		ancestry.unshift(current);
		const previousSessionId: string | undefined = current.continuation?.previousSessionId;
		current = previousSessionId ? sessionsById.get(previousSessionId) : undefined;
	}
	const journeyId = selected.continuation?.journeyId;
	const root = journeyId ? sessionsById.get(journeyId) : undefined;
	if (root && !visited.has(root.id)) {
		ancestry.unshift(root);
	}
	return ancestry;
}

export function combineSessionJourney(
	sessions: readonly SavedSession[],
	selectedId: string
): CombinedSessionJourney | undefined {
	const selected = sessions.find((session) => session.id === selectedId);
	if (!selected) {
		return;
	}
	const ancestry = ancestryForSession(sessions, selected).sort(
		(left, right) => left.startedAt - right.startedAt
	);
	if (ancestry.length < 2) {
		return;
	}
	let elapsedOffset = 0;
	const history = ancestry.flatMap((session) => {
		const shifted = session.history.map((sample) => ({
			...sample,
			elapsedSeconds: elapsedOffset + sample.elapsedSeconds,
		}));
		elapsedOffset += session.elapsedSeconds;
		return shifted;
	});
	const first = ancestry[0] ?? selected;
	const last = ancestry.at(-1) ?? selected;
	const maximumKeys = ['cadence', 'heartRate', 'power', 'speed'] as const;
	const combined: SavedSession = {
		...selected,
		aggregates: {
			cadence: combinedAggregate(ancestry.map((session) => session.aggregates.cadence)),
			gear: combinedAggregate(ancestry.map((session) => session.aggregates.gear)),
			heartRate: combinedAggregate(ancestry.map((session) => session.aggregates.heartRate)),
			power: combinedAggregate(ancestry.map((session) => session.aggregates.power)),
			resistance: combinedAggregate(ancestry.map((session) => session.aggregates.resistance)),
		},
		calories: ancestry.reduce((sum, session) => sum + session.calories, 0),
		comments: '',
		continuation: undefined,
		controlMode: ancestry.some((session) => session.controlMode === CONTROL_MODE.GEAR)
			? CONTROL_MODE.GEAR
			: CONTROL_MODE.RESISTANCE,
		distance: ancestry.reduce((sum, session) => sum + session.distance, 0),
		elapsedSeconds: ancestry.reduce((sum, session) => sum + session.elapsedSeconds, 0),
		elevationTotals: {
			ascent: ancestry.reduce((sum, session) => sum + session.elevationTotals.ascent, 0),
			descent: ancestry.reduce((sum, session) => sum + session.elevationTotals.descent, 0),
		},
		endedAt: last.endedAt,
		feeling: undefined,
		history,
		id: `journey:${selected.continuation?.journeyId ?? first.id}`,
		importedAt: undefined,
		maximums: {
			...emptyMetrics,
			...Object.fromEntries(
				maximumKeys.map((key) => [
					key,
					Math.max(...ancestry.map((session) => session.maximums[key])),
				])
			),
		},
		profileSnapshot: last.profileSnapshot,
		startedAt: first.startedAt,
		workout: last.workout ?? first.workout,
	};
	return {
		partCount: ancestry.length,
		partNumber: ancestry.findIndex((session) => session.id === selected.id) + 1,
		session: combined,
	};
}
