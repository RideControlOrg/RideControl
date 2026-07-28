import { strToU8, zlibSync } from 'fflate';
import { z } from 'zod';
import type { SavedSession, SpeedUnit } from '../types';
import { apiUrl } from './api';
import { aggregateAverage, formatDuration } from './format';
import { getSessionAnalytics } from './saved-sessions';
import {
	SESSION_ANALYTICS_PEAK,
	type SessionAnalyticsCache,
	type SessionAnalyticsPeakKey,
} from './session-analytics';
import { formatDistance, formatElevation } from './units';

const SHARE_WINDOW_FEATURES = 'popup,width=720,height=720';
const X_INTENT_ROOT = 'https://x.com/intent/post';
const BASE64_PADDING_PATTERN = /[=]+$/u;
const MAXIMUM_VISUAL_POINTS = 48;
const VISUAL_SCALE = 1000;
const PUBLIC_WORKOUT_ID_PATTERN = /^[\w.~-]+$/u;

const workoutShareMetricSchema = z.object({
	label: z.string().min(1).max(32),
	value: z.string().min(1).max(32),
});

const workoutSharePointSchema = z.tuple([
	z.number().int().min(0).max(VISUAL_SCALE),
	z.number().int().min(0).max(VISUAL_SCALE),
]);

const publicWorkoutSchema = z.object({
	collectionId: z.string().min(1).max(80).regex(PUBLIC_WORKOUT_ID_PATTERN),
	providerId: z.string().min(1).max(80).regex(PUBLIC_WORKOUT_ID_PATTERN),
	routeId: z.string().min(1).max(80).regex(PUBLIC_WORKOUT_ID_PATTERN),
});

export const workoutShareSummarySchema = z.object({
	caption: z.string().min(1).max(280),
	date: z.string().min(1).max(80),
	metrics: z.array(workoutShareMetricSchema).min(3).max(8),
	personalBests: z.array(z.string().min(1).max(48)).max(9),
	publicWorkout: publicWorkoutSchema.optional(),
	title: z.string().min(1).max(120),
	version: z.literal(1),
	visual: z
		.object({
			elevation: z.array(workoutSharePointSchema).min(3).max(MAXIMUM_VISUAL_POINTS),
			map: z.array(workoutSharePointSchema).min(3).max(MAXIMUM_VISUAL_POINTS),
		})
		.optional(),
});

export type WorkoutShareSummary = z.infer<typeof workoutShareSummarySchema>;

const PERSONAL_BEST_LABELS: Record<SessionAnalyticsPeakKey, string> = {
	[SESSION_ANALYTICS_PEAK.CADENCE]: 'Peak cadence',
	[SESSION_ANALYTICS_PEAK.CALORIES]: 'Most calories',
	[SESSION_ANALYTICS_PEAK.CLIMB]: 'Most climbing',
	[SESSION_ANALYTICS_PEAK.DESCENT]: 'Most downhill',
	[SESSION_ANALYTICS_PEAK.DISTANCE]: 'Longest distance',
	[SESSION_ANALYTICS_PEAK.DURATION]: 'Longest time',
	[SESSION_ANALYTICS_PEAK.HEART_RATE]: 'Peak heart rate',
	[SESSION_ANALYTICS_PEAK.POWER]: 'Peak power',
	[SESSION_ANALYTICS_PEAK.SPEED]: 'Top speed',
};

const SHARE_METRIC_NUMBER = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 0,
});

const SHARE_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
});

function cardTitle(session: SavedSession): string {
	return session.workout ? session.workout.course.name.trim() || 'Indoor ride' : 'Indoor ride';
}

function sampledIndexes(length: number): number[] {
	const count = Math.min(length, MAXIMUM_VISUAL_POINTS);
	return Array.from({ length: count }, (_, index) =>
		Math.round((index * (length - 1)) / Math.max(count - 1, 1))
	);
}

function visualCoordinate(value: number): number {
	return Math.max(0, Math.min(VISUAL_SCALE, Math.round(value)));
}

function workoutVisual(session: SavedSession): WorkoutShareSummary['visual'] {
	const course = session.workout?.course;
	if (!course || course.points.length < 3) {
		return;
	}
	const indexes = sampledIndexes(course.points.length);
	let minimumElevation = Number.POSITIVE_INFINITY;
	let maximumElevation = Number.NEGATIVE_INFINITY;
	for (const point of course.points) {
		minimumElevation = Math.min(minimumElevation, point.elevation);
		maximumElevation = Math.max(maximumElevation, point.elevation);
	}
	const elevationRange = Math.max(maximumElevation - minimumElevation, 1);
	return {
		elevation: indexes.map((index) => {
			const point = course.points[index];
			return [
				visualCoordinate((point.distance / course.distance) * VISUAL_SCALE),
				visualCoordinate(
					((maximumElevation - point.elevation) / elevationRange) * VISUAL_SCALE
				),
			];
		}),
		map: indexes.map((index) => {
			const point = course.points[index];
			return [
				visualCoordinate((point.x / 100) * VISUAL_SCALE),
				visualCoordinate((point.y / 100) * VISUAL_SCALE),
			];
		}),
	};
}

export function sessionPersonalBests(
	sessionId: string,
	analytics: Pick<SessionAnalyticsCache, 'peaks'>
): string[] {
	return Object.entries(analytics.peaks).flatMap(([key, peak]) =>
		peak?.sessionId === sessionId ? [PERSONAL_BEST_LABELS[key as SessionAnalyticsPeakKey]] : []
	);
}

export function buildWorkoutShareSummary(
	session: SavedSession,
	speedUnit: SpeedUnit,
	analytics: Pick<SessionAnalyticsCache, 'peaks'>
): WorkoutShareSummary {
	const personalBests = sessionPersonalBests(session.id, analytics);
	const distance = formatDistance(session.distance, speedUnit, 1);
	const title = cardTitle(session);
	const visual = workoutVisual(session);
	const publicWorkoutSource = session.workout ? session.workout.course.publicSource : undefined;
	const publicWorkout = publicWorkoutSchema.safeParse(publicWorkoutSource);
	const achievement =
		personalBests.length === 0
			? ''
			: ` · ${personalBests.length} personal best${personalBests.length === 1 ? '' : 's'}`;
	return workoutShareSummarySchema.parse({
		caption: `${title}: ${distance} in ${formatDuration(session.elapsedSeconds)} with Ride Control${achievement}.`,
		date: SHARE_DATE_FORMATTER.format(new Date(session.startedAt)),
		metrics: [
			{ label: 'Distance', value: distance },
			{ label: 'Time', value: formatDuration(session.elapsedSeconds) },
			{
				label: 'Climbing',
				value: formatElevation(session.elevationTotals.ascent, speedUnit),
			},
			{ label: 'Calories', value: `${SHARE_METRIC_NUMBER.format(session.calories)} kcal` },
			{
				label: 'Avg power',
				value: `${SHARE_METRIC_NUMBER.format(aggregateAverage(session.aggregates.power))} W`,
			},
			{
				label: 'Avg heart rate',
				value: `${SHARE_METRIC_NUMBER.format(
					aggregateAverage(session.aggregates.heartRate)
				)} bpm`,
			},
		],
		personalBests,
		...(publicWorkout.success ? { publicWorkout: publicWorkout.data } : {}),
		title,
		version: 1,
		...(visual ? { visual } : {}),
	});
}

function compactPoints(points: [number, number][]): number[] {
	let previousX = 0;
	let previousY = 0;
	return points.flatMap(([x, y], index) => {
		const encoded = index === 0 ? [x, y] : [x - previousX, y - previousY];
		previousX = x;
		previousY = y;
		return encoded;
	});
}

function compactShareSummary(summary: WorkoutShareSummary) {
	return [
		summary.version,
		summary.caption,
		summary.date,
		summary.metrics.map(({ label, value }) => [label, value]),
		summary.personalBests,
		summary.publicWorkout
			? [
					summary.publicWorkout.providerId,
					summary.publicWorkout.collectionId,
					summary.publicWorkout.routeId,
				]
			: null,
		summary.title,
		summary.visual
			? [compactPoints(summary.visual.map), compactPoints(summary.visual.elevation)]
			: null,
	] as const;
}

function base64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(BASE64_PADDING_PATTERN, '');
}

export function workoutShareUrl(summary: WorkoutShareSummary): string {
	const validated = workoutShareSummarySchema.parse(summary);
	const payload = strToU8(JSON.stringify(compactShareSummary(validated)));
	const token = base64Url(zlibSync(payload, { level: 9 }));
	const path = apiUrl(`/share/workouts/${token}`);
	const origin =
		typeof window === 'undefined' ? 'https://ridecontrol.xyz' : window.location.origin;
	return new URL(path, origin).href;
}

export function workoutShareIntentUrl(summary: WorkoutShareSummary, shareUrl: string): string {
	const intent = new URL(X_INTENT_ROOT);
	intent.searchParams.set('text', workoutShareSummarySchema.parse(summary).caption);
	intent.searchParams.set('url', shareUrl);
	return intent.href;
}

export async function shareSessionOnX(session: SavedSession, speedUnit: SpeedUnit): Promise<void> {
	const shareWindow = window.open('about:blank', 'ridecontrol-share', SHARE_WINDOW_FEATURES);
	if (shareWindow) {
		shareWindow.opener = null;
	}
	try {
		const analytics = await getSessionAnalytics();
		const summary = buildWorkoutShareSummary(session, speedUnit, analytics);
		const shareUrl = workoutShareUrl(summary);
		const intentUrl = workoutShareIntentUrl(summary, shareUrl);
		if (shareWindow) {
			shareWindow.location.href = intentUrl;
		} else {
			window.location.assign(intentUrl);
		}
	} catch (error) {
		shareWindow?.close();
		throw error;
	}
}
