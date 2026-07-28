import { describe, expect, test } from 'bun:test';
import { emptySessionAnalyticsCache, SESSION_ANALYTICS_PEAK } from '../src/lib/session-analytics';
import {
	buildWorkoutShareSummary,
	sessionPersonalBests,
	workoutShareIntentUrl,
	workoutShareUrl,
} from '../src/lib/session-sharing';
import { WORKOUT_COURSES } from '../src/lib/workouts';
import { savedSessionFixture } from './fixtures/saved-session';

const WORKOUT_SHARE_URL_PATTERN = /^https:\/\/ridecontrol\.xyz\/api\/share\/workouts\/[\w-]+$/u;

describe('workout sharing', () => {
	test('uses cached peak ownership for accurate personal-best callouts', () => {
		const analytics = emptySessionAnalyticsCache(1);
		analytics.peaks[SESSION_ANALYTICS_PEAK.DISTANCE] = {
			sessionId: savedSessionFixture.id,
			value: savedSessionFixture.distance,
		};
		analytics.peaks[SESSION_ANALYTICS_PEAK.POWER] = {
			sessionId: 'another-session',
			value: 500,
		};

		expect(sessionPersonalBests(savedSessionFixture.id, analytics)).toEqual([
			'Longest distance',
		]);
	});

	test('builds a privacy-scoped, unit-aware share summary', () => {
		const analytics = emptySessionAnalyticsCache(1);
		analytics.peaks[SESSION_ANALYTICS_PEAK.CALORIES] = {
			sessionId: savedSessionFixture.id,
			value: savedSessionFixture.calories,
		};
		const summary = buildWorkoutShareSummary(savedSessionFixture, 'mph', analytics);

		expect(summary.title).toBe('Indoor ride');
		expect(summary.metrics).toEqual([
			{ label: 'Distance', value: '0.9 mi' },
			{ label: 'Time', value: '00:00:02' },
			{ label: 'Climbing', value: '0 ft' },
			{ label: 'Calories', value: '220 kcal' },
			{ label: 'Avg power', value: '205 W' },
			{ label: 'Avg heart rate', value: '141 bpm' },
		]);
		expect(summary.personalBests).toEqual(['Most calories']);
		expect(summary.caption).toContain('1 personal best');
		expect(JSON.stringify(summary)).not.toContain(savedSessionFixture.comments);
		expect(JSON.stringify(summary)).not.toContain(
			savedSessionFixture.profileSnapshot?.bikeName
		);
	});

	test('encodes a stateless public URL and builds an X intent around it', () => {
		const analytics = emptySessionAnalyticsCache(1);
		const summary = buildWorkoutShareSummary(savedSessionFixture, 'kmh', analytics);
		const shareUrl = workoutShareUrl(summary);
		const intent = new URL(workoutShareIntentUrl(summary, shareUrl));

		expect(shareUrl).toMatch(WORKOUT_SHARE_URL_PATTERN);
		expect(intent.origin).toBe('https://x.com');
		expect(intent.pathname).toBe('/intent/post');
		expect(intent.searchParams.get('text')).toBe(summary.caption);
		expect(intent.searchParams.get('url')).toBe(shareUrl);
	});

	test('includes a compact visual and exact link identity for a public workout', () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout fixture.');
		}
		const summary = buildWorkoutShareSummary(
			{
				...savedSessionFixture,
				workout: {
					course: {
						...course,
						publicSource: {
							collectionId: 'tour-de-france-2026',
							providerId: 'grand-tours',
							routeId: '1',
						},
					},
				},
			},
			'mph',
			emptySessionAnalyticsCache(1)
		);

		expect(summary.publicWorkout).toEqual({
			collectionId: 'tour-de-france-2026',
			providerId: 'grand-tours',
			routeId: '1',
		});
		expect(summary.visual?.map.length).toBeGreaterThanOrEqual(3);
		expect(summary.visual?.map.length).toBeLessThanOrEqual(48);
		expect(summary.visual?.elevation.length).toBe(summary.visual?.map.length);
		const token = new URL(workoutShareUrl(summary)).pathname.split('/').at(-1);
		expect(token?.length).toBeLessThan(JSON.stringify(summary).length);
		expect(token?.length).toBeLessThan(4097);
	});
});
