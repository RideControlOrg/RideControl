import type {
	ActivityMesg,
	DeviceInfoMesg,
	EventMesg,
	FileIdMesg,
	LapMesg,
	RecordMesg,
	SessionMesg,
} from '@garmin/fitsdk';
import type { MetricSample, SavedSession } from '../types';
import {
	ACTIVITY_FILE_FORMAT,
	sessionActivityFilename,
	sessionSampleDistances,
} from './activity-file';
import { downloadBrowserFile } from './download';
import { aggregateAverage } from './format';
import { nonNegativeNumber } from './numbers';
import { metersForKilometers, metersPerSecond, millisecondsForSeconds } from './units';

export const FIT_MIME_TYPE = 'application/vnd.ant.fit';
const MAX_UINT8 = 254;
const MAX_UINT16 = 65_534;
const MAX_UINT32 = 4_294_967_294;
const MAX_STANDARD_SPEED_METERS_PER_SECOND = MAX_UINT16 / 1000;
const FIT_EPOCH_MILLISECONDS = 631_065_600_000;

function fitLocalTimestamp(timestamp: number): number {
	return Math.floor(
		(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000 - FIT_EPOCH_MILLISECONDS) /
			1000
	);
}

function filenameToken(id: string): string {
	let hash = 2_166_136_261;
	for (const character of id) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36);
}

function uint8(value: number): number {
	return Math.min(MAX_UINT8, Math.round(nonNegativeNumber(value)));
}

function uint16(value: number): number {
	return Math.min(MAX_UINT16, Math.round(nonNegativeNumber(value)));
}

function optionalPositiveUint8(value: number): number | undefined {
	return value > 0 ? uint8(value) : undefined;
}

function optionalSampleValue(value: number | undefined): number | undefined {
	return value === undefined ? undefined : nonNegativeNumber(value);
}

function recordMessage(sample: MetricSample, timestamp: Date, distance: number): RecordMesg {
	const speed = metersPerSecond(nonNegativeNumber(sample.speed));
	return {
		altitude: optionalSampleValue(sample.elevation),
		cadence: uint8(sample.cadence),
		distance: nonNegativeNumber(distance),
		enhancedAltitude: optionalSampleValue(sample.elevation),
		enhancedSpeed: speed,
		grade: sample.grade,
		heartRate: optionalPositiveUint8(sample.heartRate),
		power: uint16(sample.power),
		resistance: sample.resistance === undefined ? undefined : uint8(sample.resistance),
		speed: Math.min(speed, MAX_STANDARD_SPEED_METERS_PER_SECOND),
		timestamp,
	};
}

function summaryFields(session: SavedSession, elapsedSeconds: number) {
	const averageSpeed =
		elapsedSeconds > 0
			? metersForKilometers(nonNegativeNumber(session.distance)) / elapsedSeconds
			: 0;
	const maximumSpeed = metersPerSecond(nonNegativeNumber(session.maximums.speed));
	const averageHeartRate = aggregateAverage(session.aggregates.heartRate);
	const averageCadence = aggregateAverage(session.aggregates.cadence);
	const averagePower = aggregateAverage(session.aggregates.power);
	return {
		avgCadence: session.aggregates.cadence.count > 0 ? uint8(averageCadence) : undefined,
		avgHeartRate: optionalPositiveUint8(averageHeartRate),
		avgPower: session.aggregates.power.count > 0 ? uint16(averagePower) : undefined,
		avgSpeed: Math.min(averageSpeed, MAX_STANDARD_SPEED_METERS_PER_SECOND),
		enhancedAvgSpeed: averageSpeed,
		enhancedMaxSpeed: maximumSpeed,
		maxCadence: uint8(session.maximums.cadence),
		maxHeartRate: optionalPositiveUint8(session.maximums.heartRate),
		maxPower: uint16(session.maximums.power),
		maxSpeed: Math.min(maximumSpeed, MAX_STANDARD_SPEED_METERS_PER_SECOND),
		totalAscent: uint16(session.elevationTotals.ascent),
		totalCalories: uint16(session.calories),
		totalCycles:
			session.aggregates.cadence.count > 0
				? Math.min(MAX_UINT32, Math.round((averageCadence * elapsedSeconds) / 60))
				: undefined,
		totalDescent: uint16(session.elevationTotals.descent),
		totalDistance: metersForKilometers(nonNegativeNumber(session.distance)),
		totalElapsedTime: elapsedSeconds,
		totalTimerTime: elapsedSeconds,
		totalWork: Math.min(MAX_UINT32, Math.round(averagePower * elapsedSeconds)),
	};
}

export async function sessionToFit(session: SavedSession): Promise<Uint8Array> {
	if (session.history.length === 0) {
		throw new Error('The session has no recorded samples to export.');
	}
	const { Encoder, Profile } = await import('@garmin/fitsdk');
	const encoder = new Encoder();
	const startedAt = new Date(session.startedAt);
	const elapsedSeconds = Math.max(
		nonNegativeNumber(session.elapsedSeconds),
		...session.history.map((sample) => nonNegativeNumber(sample.elapsedSeconds))
	);
	const endedAt = new Date(
		Math.max(session.startedAt, session.startedAt + millisecondsForSeconds(elapsedSeconds))
	);
	const distances = sessionSampleDistances(session);
	const summary = summaryFields(session, elapsedSeconds);

	const fileIdMessage: FileIdMesg = {
		manufacturer: 'development',
		product: 1,
		productName: 'Ride Control',
		timeCreated: startedAt,
		type: 'activity',
	};
	encoder.onMesg(Profile.MesgNum.FILE_ID, fileIdMessage);
	const deviceInfoMessage: DeviceInfoMesg = {
		deviceIndex: 'creator',
		manufacturer: 'development',
		product: 1,
		productName: 'Ride Control',
		timestamp: startedAt,
	};
	encoder.onMesg(Profile.MesgNum.DEVICE_INFO, deviceInfoMessage);
	const startEventMessage: EventMesg = {
		event: 'timer',
		eventType: 'start',
		timerTrigger: 'manual',
		timestamp: startedAt,
	};
	encoder.onMesg(Profile.MesgNum.EVENT, startEventMessage);
	for (const [index, sample] of session.history.entries()) {
		encoder.onMesg(
			Profile.MesgNum.RECORD,
			recordMessage(
				sample,
				new Date(
					session.startedAt +
						millisecondsForSeconds(nonNegativeNumber(sample.elapsedSeconds))
				),
				distances[index] ?? 0
			)
		);
	}
	const stopEventMessage: EventMesg = {
		event: 'timer',
		eventType: 'stopAll',
		timerTrigger: 'manual',
		timestamp: endedAt,
	};
	encoder.onMesg(Profile.MesgNum.EVENT, stopEventMessage);
	const lapMessage: LapMesg = {
		...summary,
		event: 'lap',
		eventType: 'stop',
		messageIndex: 0,
		startTime: startedAt,
		timestamp: endedAt,
	};
	encoder.onMesg(Profile.MesgNum.LAP, lapMessage);
	const sessionMessage: SessionMesg = {
		...summary,
		event: 'session',
		eventType: 'stop',
		messageIndex: 0,
		numLaps: 1,
		sport: 'cycling',
		startTime: startedAt,
		subSport: 'indoorCycling',
		timestamp: endedAt,
		trigger: 'activityEnd',
	};
	encoder.onMesg(Profile.MesgNum.SESSION, sessionMessage);
	const activityMessage: ActivityMesg = {
		event: 'activity',
		eventType: 'stop',
		localTimestamp: fitLocalTimestamp(endedAt.getTime()),
		numSessions: 1,
		timestamp: endedAt,
		totalTimerTime: summary.totalTimerTime,
		type: 'manual',
	};
	encoder.onMesg(Profile.MesgNum.ACTIVITY, activityMessage);
	return encoder.close();
}

export function sessionFitFilename(session: Pick<SavedSession, 'id' | 'startedAt'>): string {
	const filename = sessionActivityFilename(session, ACTIVITY_FILE_FORMAT.FIT);
	return `${filename.slice(0, -'.fit'.length)}-${filenameToken(session.id)}.fit`;
}

export async function downloadSessionFit(session: SavedSession): Promise<void> {
	const contents = await sessionToFit(session);
	const buffer = new ArrayBuffer(contents.byteLength);
	new Uint8Array(buffer).set(contents);
	downloadBrowserFile(buffer, sessionFitFilename(session), FIT_MIME_TYPE);
}
