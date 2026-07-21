import type { RecordMesg, SessionMesg } from '@garmin/fitsdk';
import { emptyMetrics, emptySession, MAX_SESSION_HISTORY_SAMPLES } from '../constants';
import type { MetricAggregate, MetricSample, SavedSession, SessionAggregates } from '../types';
import { IMPORTED_FIT_ID_PREFIX, sessionImportFingerprint } from './activity-file';
import { evenlySample } from './arrays';
import { CONTROL_MODE } from './control-mode';
import { elevationTotalsForSamples } from './elevation';
import { nonNegativeNumber } from './numbers';
import { clampResistance } from './resistance';
import { addMetricAggregates } from './session';
import {
	KILOMETERS_PER_HOUR_PER_METER_PER_SECOND,
	kilometersForMeters,
	secondsForMilliseconds,
} from './units';

function timestampValue(value: unknown): number | undefined {
	if (value instanceof Date) {
		const timestamp = value.getTime();
		return Number.isFinite(timestamp) ? timestamp : undefined;
	}
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return;
	}
	return value * 1000 + 631_065_600_000;
}

function maximum(values: (number | undefined)[]): number {
	return values.reduce<number>((highest, value) => Math.max(highest, value ?? 0), 0);
}

function aggregateFallback(average?: number, maximumValue?: number): MetricAggregate {
	if (average === undefined || average < 0) {
		return { count: 0, sum: 0 };
	}
	return {
		count: 1,
		maximum: Math.max(nonNegativeNumber(average), nonNegativeNumber(maximumValue)),
		sum: nonNegativeNumber(average),
	};
}

function withAggregateFallback(
	aggregates: SessionAggregates,
	key: keyof SessionAggregates,
	fallback: MetricAggregate
): SessionAggregates {
	return aggregates[key].count > 0 || fallback.count === 0
		? aggregates
		: { ...aggregates, [key]: fallback };
}

function recordTimestamp(record: RecordMesg): number | undefined {
	return timestampValue(record.timestamp);
}

function sessionRecords(records: RecordMesg[], startedAt: number, endedAt?: number): RecordMesg[] {
	return records.filter((record) => {
		const timestamp = recordTimestamp(record);
		return (
			timestamp !== undefined &&
			timestamp >= startedAt &&
			(endedAt === undefined || timestamp <= endedAt)
		);
	});
}

function recordSample(record: RecordMesg, startedAt: number): MetricSample {
	const timestamp = recordTimestamp(record) ?? startedAt;
	const speed = record.enhancedSpeed ?? record.speed ?? 0;
	const elevation = record.enhancedAltitude ?? record.altitude;
	return {
		cadence: nonNegativeNumber(record.cadence),
		elapsedSeconds: Math.max(0, secondsForMilliseconds(timestamp - startedAt)),
		elevation: elevation === undefined ? undefined : nonNegativeNumber(elevation),
		grade: record.grade,
		heartRate: nonNegativeNumber(record.heartRate),
		power: nonNegativeNumber(record.power),
		resistance:
			record.resistance === undefined ? undefined : clampResistance(record.resistance),
		speed: nonNegativeNumber(speed) * KILOMETERS_PER_HOUR_PER_METER_PER_SECOND,
	};
}

function parseFitSession(session: SessionMesg | undefined, allRecords: RecordMesg[]): SavedSession {
	const firstRecordTimestamp = allRecords
		.map(recordTimestamp)
		.find((value) => value !== undefined);
	const startedAt = timestampValue(session?.startTime) ?? firstRecordTimestamp;
	if (startedAt === undefined) {
		throw new Error('The FIT activity has no valid start time.');
	}
	const recordedEnd = timestampValue(session?.timestamp);
	const records = session ? sessionRecords(allRecords, startedAt, recordedEnd) : allRecords;
	const samples = records.map((record) => recordSample(record, startedAt));
	const lastRecordTimestamp = records
		.map(recordTimestamp)
		.findLast((value) => value !== undefined);
	const recordedElapsed = nonNegativeNumber(session?.totalElapsedTime ?? session?.totalTimerTime);
	const sampleElapsed = samples.at(-1)?.elapsedSeconds ?? 0;
	const elapsedSeconds = Math.max(recordedElapsed, sampleElapsed);
	const endedAt = Math.max(
		startedAt,
		recordedEnd ?? 0,
		lastRecordTimestamp ?? 0,
		startedAt + elapsedSeconds * 1000
	);
	const recordDistance = maximum(records.map((record) => record.distance));
	const distanceMeters = Math.max(nonNegativeNumber(session?.totalDistance), recordDistance);
	let aggregates = samples.reduce(addMetricAggregates, emptySession.aggregates);
	aggregates = withAggregateFallback(
		aggregates,
		'cadence',
		aggregateFallback(session?.avgCadence, session?.maxCadence)
	);
	aggregates = withAggregateFallback(
		aggregates,
		'heartRate',
		aggregateFallback(session?.avgHeartRate, session?.maxHeartRate)
	);
	aggregates = withAggregateFallback(
		aggregates,
		'power',
		aggregateFallback(session?.avgPower, session?.maxPower)
	);
	const sampledElevationTotals = elevationTotalsForSamples(samples);
	const sessionWithoutId: Omit<SavedSession, 'id'> = {
		aggregates,
		calories: nonNegativeNumber(session?.totalCalories),
		comments: '',
		controlMode: CONTROL_MODE.RESISTANCE,
		distance: kilometersForMeters(distanceMeters),
		elapsedSeconds,
		elevationTotals: {
			ascent: nonNegativeNumber(session?.totalAscent ?? sampledElevationTotals.ascent),
			descent: nonNegativeNumber(session?.totalDescent ?? sampledElevationTotals.descent),
		},
		endedAt,
		history: evenlySample(samples, MAX_SESSION_HISTORY_SAMPLES),
		maximums: {
			...emptyMetrics,
			cadence: Math.max(
				maximum(samples.map((sample) => sample.cadence)),
				session?.maxCadence ?? 0
			),
			heartRate: Math.max(
				maximum(samples.map((sample) => sample.heartRate)),
				session?.maxHeartRate ?? 0
			),
			power: Math.max(maximum(samples.map((sample) => sample.power)), session?.maxPower ?? 0),
			speed: Math.max(
				maximum(samples.map((sample) => sample.speed)),
				nonNegativeNumber(session?.enhancedMaxSpeed ?? session?.maxSpeed) *
					KILOMETERS_PER_HOUR_PER_METER_PER_SECOND
			),
		},
		startedAt,
	};
	return {
		...sessionWithoutId,
		id: `${IMPORTED_FIT_ID_PREFIX}${sessionImportFingerprint(sessionWithoutId)}`,
	};
}

export async function parseFitSessions(contents: Uint8Array): Promise<SavedSession[]> {
	const { Decoder, Stream } = await import('@garmin/fitsdk');
	const stream = Stream.fromArrayBuffer(contents.slice().buffer);
	const decoder = new Decoder(stream);
	if (!decoder.isFIT()) {
		throw new Error('The file is not a FIT document.');
	}
	if (!decoder.checkIntegrity()) {
		throw new Error('The FIT file failed its integrity check.');
	}
	const { errors, messages } = decoder.read();
	if (errors.length > 0) {
		throw new Error(errors[0]?.message ?? 'The FIT file could not be decoded.');
	}
	const fileType = messages.fileIdMesgs?.[0]?.type;
	if (fileType !== 'activity' && fileType !== 4) {
		throw new Error('The FIT file is not an activity file.');
	}
	const records = messages.recordMesgs ?? [];
	const sessions = messages.sessionMesgs ?? [];
	if (sessions.length === 0 && records.length === 0) {
		throw new Error('The FIT file contains no activity sessions.');
	}
	return sessions.length > 0
		? sessions.map((session) => parseFitSession(session, records))
		: [parseFitSession(undefined, records)];
}
