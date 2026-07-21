import type { SavedSession } from '../types';
import { nonNegativeNumber } from './numbers';
import { metersForKilometers, metersPerSecond } from './units';

export const ACTIVITY_FILE_FORMAT = {
	FIT: 'fit',
	TCX: 'tcx',
} as const;

export type ActivityFileFormat = (typeof ACTIVITY_FILE_FORMAT)[keyof typeof ACTIVITY_FILE_FORMAT];

export const IMPORTED_FIT_ID_PREFIX = 'fit:';

export function isActivityFileFormat(value: string): value is ActivityFileFormat {
	return value === ACTIVITY_FILE_FORMAT.FIT || value === ACTIVITY_FILE_FORMAT.TCX;
}

export function sessionActivityFilename(
	session: Pick<SavedSession, 'startedAt'>,
	format: ActivityFileFormat
): string {
	return `ride-control-${new Date(session.startedAt).toISOString().replaceAll(':', '-')}.${format}`;
}

export function sessionSampleDistances(session: SavedSession): number[] {
	let elapsed = 0;
	let distance = 0;
	const integrated = session.history.map((sample) => {
		const nextElapsed = nonNegativeNumber(sample.elapsedSeconds);
		const seconds = Math.max(0, nextElapsed - elapsed);
		distance += metersPerSecond(nonNegativeNumber(sample.speed)) * seconds;
		elapsed = nextElapsed;
		return distance;
	});
	const totalMeters = metersForKilometers(nonNegativeNumber(session.distance));
	if (distance > 0 && totalMeters > 0) {
		return integrated.map((meters) => (meters / distance) * totalMeters);
	}
	if (totalMeters > 0 && session.elapsedSeconds > 0) {
		return session.history.map(
			(sample) =>
				(Math.min(nonNegativeNumber(sample.elapsedSeconds), session.elapsedSeconds) /
					session.elapsedSeconds) *
				totalMeters
		);
	}
	return integrated;
}

export function sessionImportFingerprint(
	session: Pick<
		SavedSession,
		'calories' | 'distance' | 'elapsedSeconds' | 'history' | 'startedAt'
	>
): string {
	return [
		Math.round(nonNegativeNumber(session.startedAt)),
		Math.round(nonNegativeNumber(session.elapsedSeconds) * 1000),
		Math.round(nonNegativeNumber(session.distance) * 1_000_000),
		Math.round(nonNegativeNumber(session.calories)),
		session.history.length,
	].join(':');
}
