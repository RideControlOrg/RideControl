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
	nextSessionId?: string;
	partCount: number;
	partNumber: number;
	previousSessionId?: string;
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

function journeyPathForSession(
	sessions: readonly SavedSession[],
	selected: SavedSession
): SavedSession[] {
	const path = ancestryForSession(sessions, selected);
	const visited = new Set(path.map((session) => session.id));
	let journeyId = selected.id;
	if (selected.continuation) {
		({ journeyId } = selected.continuation);
	}
	let current = selected;
	const nextSession = () => {
		const [next] = sessions
			.filter(
				(session) =>
					!visited.has(session.id) &&
					session.continuation?.journeyId === journeyId &&
					session.continuation.previousSessionId === current.id
			)
			.sort((left, right) => left.startedAt - right.startedAt);
		return next;
	};
	let next = nextSession();
	while (next) {
		path.push(next);
		visited.add(next.id);
		current = next;
		next = nextSession();
	}
	return path;
}

export function combineSessionJourney(
	sessions: readonly SavedSession[],
	selectedId: string
): CombinedSessionJourney | undefined {
	const selected = sessions.find((session) => session.id === selectedId);
	if (!selected) {
		return;
	}
	const journeyPath = journeyPathForSession(sessions, selected);
	if (journeyPath.length < 2) {
		return;
	}
	let elapsedOffset = 0;
	const history = journeyPath.flatMap((session) => {
		const shifted = session.history.map((sample) => ({
			...sample,
			elapsedSeconds: elapsedOffset + sample.elapsedSeconds,
		}));
		elapsedOffset += session.elapsedSeconds;
		return shifted;
	});
	const first = journeyPath[0] ?? selected;
	const last = journeyPath.at(-1) ?? selected;
	const selectedIndex = journeyPath.findIndex((session) => session.id === selected.id);
	const maximumKeys = ['cadence', 'heartRate', 'power', 'speed'] as const;
	const combined: SavedSession = {
		...selected,
		aggregates: {
			cadence: combinedAggregate(journeyPath.map((session) => session.aggregates.cadence)),
			gear: combinedAggregate(journeyPath.map((session) => session.aggregates.gear)),
			heartRate: combinedAggregate(
				journeyPath.map((session) => session.aggregates.heartRate)
			),
			power: combinedAggregate(journeyPath.map((session) => session.aggregates.power)),
			resistance: combinedAggregate(
				journeyPath.map((session) => session.aggregates.resistance)
			),
		},
		calories: journeyPath.reduce((sum, session) => sum + session.calories, 0),
		comments: '',
		continuation: undefined,
		controlMode: journeyPath.some((session) => session.controlMode === CONTROL_MODE.GEAR)
			? CONTROL_MODE.GEAR
			: CONTROL_MODE.RESISTANCE,
		distance: journeyPath.reduce((sum, session) => sum + session.distance, 0),
		elapsedSeconds: journeyPath.reduce((sum, session) => sum + session.elapsedSeconds, 0),
		elevationTotals: {
			ascent: journeyPath.reduce((sum, session) => sum + session.elevationTotals.ascent, 0),
			descent: journeyPath.reduce((sum, session) => sum + session.elevationTotals.descent, 0),
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
					Math.max(...journeyPath.map((session) => session.maximums[key])),
				])
			),
		},
		profileSnapshot: last.profileSnapshot,
		startedAt: first.startedAt,
		workout: last.workout ?? first.workout,
	};
	return {
		nextSessionId: journeyPath[selectedIndex + 1]?.id,
		partCount: journeyPath.length,
		partNumber: selectedIndex + 1,
		previousSessionId: journeyPath[selectedIndex - 1]?.id,
		session: combined,
	};
}
