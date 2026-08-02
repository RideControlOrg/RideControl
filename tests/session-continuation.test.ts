import { describe, expect, test } from 'bun:test';
import {
	combineSessionJourney,
	restoreSessionContinuation,
	sessionWorkoutDistance,
} from '../src/lib/session-continuation';
import type { SavedSession } from '../src/types';
import { savedSessionFixture } from './fixtures/saved-session';

function linkedSession({
	distance,
	elapsedSeconds,
	id,
	previousSessionId,
	startedAt,
}: {
	distance: number;
	elapsedSeconds: number;
	id: string;
	previousSessionId: string;
	startedAt: number;
}): SavedSession {
	const [firstSample] = savedSessionFixture.history;
	if (!firstSample) {
		throw new Error('Expected a saved session sample');
	}
	return {
		...savedSessionFixture,
		aggregates: {
			...savedSessionFixture.aggregates,
			power: { count: 1, maximum: 250, sum: 250 },
		},
		calories: distance * 100,
		continuation: {
			journeyId: savedSessionFixture.id,
			previousSessionId,
			workoutStartDistance: distance === 2 ? 1.5 : 3.5,
		},
		distance,
		elapsedSeconds,
		endedAt: startedAt + elapsedSeconds * 1000,
		history: [
			{
				...firstSample,
				elapsedSeconds,
				power: 250,
			},
		],
		id,
		maximums: { ...savedSessionFixture.maximums, power: 250 },
		startedAt,
	};
}

describe('linked session continuations', () => {
	test('validates persisted lineage and derives absolute workout distance', () => {
		expect(
			restoreSessionContinuation({
				journeyId: 'journey-1',
				previousSessionId: 'session-1',
				workoutStartDistance: 12.5,
			})
		).toEqual({
			journeyId: 'journey-1',
			previousSessionId: 'session-1',
			workoutStartDistance: 12.5,
		});
		expect(
			restoreSessionContinuation({ journeyId: '', workoutStartDistance: 4 })
		).toBeUndefined();
		expect(
			sessionWorkoutDistance({
				continuation: {
					journeyId: 'journey-1',
					workoutStartDistance: 12.5,
				},
				distance: 3,
			})
		).toBe(15.5);
	});

	test('combines and navigates the complete continuation path without crossing branches', () => {
		const second = linkedSession({
			distance: 2,
			elapsedSeconds: 3,
			id: 'session-2',
			previousSessionId: savedSessionFixture.id,
			startedAt: savedSessionFixture.endedAt + 86_400_000,
		});
		const third = linkedSession({
			distance: 3,
			elapsedSeconds: 4,
			id: 'session-3',
			previousSessionId: second.id,
			startedAt: second.endedAt + 86_400_000,
		});
		const branch = linkedSession({
			distance: 10,
			elapsedSeconds: 10,
			id: 'other-branch',
			previousSessionId: savedSessionFixture.id,
			startedAt: third.endedAt + 86_400_000,
		});

		const journey = combineSessionJourney(
			[branch, third, savedSessionFixture, second],
			third.id
		);
		if (!journey) {
			throw new Error('Expected a combined journey');
		}
		expect(journey).toMatchObject({
			partCount: 3,
			partNumber: 3,
			previousSessionId: second.id,
		});
		expect(journey.session).toMatchObject({
			calories: savedSessionFixture.calories + 200 + 300,
			distance: 6.5,
			elapsedSeconds: 9,
			startedAt: savedSessionFixture.startedAt,
		});
		expect(journey.session.continuation).toBeUndefined();
		expect(journey.session.aggregates.power).toEqual({
			count: savedSessionFixture.aggregates.power.count + 2,
			maximum: 250,
			sum: savedSessionFixture.aggregates.power.sum + 500,
		});
		expect(journey.session.history.map((sample) => sample.elapsedSeconds)).toEqual([
			1, 2, 5, 9,
		]);

		const middleJourney = combineSessionJourney(
			[branch, third, savedSessionFixture, second],
			second.id
		);
		expect(middleJourney).toMatchObject({
			nextSessionId: third.id,
			partCount: 3,
			partNumber: 2,
			previousSessionId: savedSessionFixture.id,
			session: { distance: 6.5, elapsedSeconds: 9 },
		});

		const branchedJourney = combineSessionJourney(
			[branch, third, savedSessionFixture, second],
			branch.id
		);
		expect(branchedJourney).toMatchObject({
			partCount: 2,
			partNumber: 2,
			previousSessionId: savedSessionFixture.id,
			session: {
				distance: savedSessionFixture.distance + branch.distance,
			},
		});
	});
});
