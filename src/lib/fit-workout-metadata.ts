import type {
	DeveloperDataIdMesg,
	DeveloperFields,
	FieldDescriptionMesg,
	Mesg,
} from '@garmin/fitsdk';
import type { SessionContinuation, SessionWorkout } from '../types';
import { nonNegativeNumber } from './numbers';
import { isFiniteNumber, isString } from './type-guards';

export const FIT_WORKOUT_DEVELOPER_FIELD = {
	COURSE_ID: 0,
	START_DISTANCE: 1,
} as const;

const FIT_DEVELOPER_DATA_INDEX = 0;
const FIT_DEVELOPER_APPLICATION_VERSION = 1;
const FIT_BASE_TYPE = {
	FLOAT64: 0x09,
	STRING: 0x07,
} as const;
const MAX_FIT_STRING_BYTES = 254;
const RIDE_CONTROL_DEVELOPER_ID = [
	0x72, 0x69, 0x64, 0x65, 0x63, 0x6f, 0x6e, 0x74, 0x72, 0x6f, 0x6c, 0, 0, 0, 0, 1,
];

export interface FitWorkoutDeveloperFieldDefinition {
	fieldDescriptionMesg: FieldDescriptionMesg;
	key: number;
}

export interface FitWorkoutMetadata {
	courseId: string;
	startDistance: number;
}

export function fitWorkoutDeveloperDataId(): DeveloperDataIdMesg {
	return {
		applicationId: [...RIDE_CONTROL_DEVELOPER_ID],
		applicationVersion: FIT_DEVELOPER_APPLICATION_VERSION,
		developerDataIndex: FIT_DEVELOPER_DATA_INDEX,
		developerId: [...RIDE_CONTROL_DEVELOPER_ID],
		manufacturerId: 'development',
	};
}

export function fitWorkoutDeveloperFieldDefinitions(): FitWorkoutDeveloperFieldDefinition[] {
	return [
		{
			fieldDescriptionMesg: {
				developerDataIndex: FIT_DEVELOPER_DATA_INDEX,
				fieldDefinitionNumber: FIT_WORKOUT_DEVELOPER_FIELD.COURSE_ID,
				fieldName: 'ride_control_course_id',
				fitBaseTypeId: FIT_BASE_TYPE.STRING,
			},
			key: FIT_WORKOUT_DEVELOPER_FIELD.COURSE_ID,
		},
		{
			fieldDescriptionMesg: {
				developerDataIndex: FIT_DEVELOPER_DATA_INDEX,
				fieldDefinitionNumber: FIT_WORKOUT_DEVELOPER_FIELD.START_DISTANCE,
				fieldName: 'ride_control_start_distance',
				fitBaseTypeId: FIT_BASE_TYPE.FLOAT64,
				units: 'km',
			},
			key: FIT_WORKOUT_DEVELOPER_FIELD.START_DISTANCE,
		},
	];
}

export function fitWorkoutDeveloperFields(
	workout: SessionWorkout | undefined,
	continuation: SessionContinuation | undefined
): DeveloperFields | undefined {
	if (!workout) {
		return;
	}
	const courseId = workout.course.id.trim();
	if (!(courseId && new TextEncoder().encode(courseId).byteLength <= MAX_FIT_STRING_BYTES)) {
		return;
	}
	return {
		[FIT_WORKOUT_DEVELOPER_FIELD.COURSE_ID]: courseId,
		[FIT_WORKOUT_DEVELOPER_FIELD.START_DISTANCE]: nonNegativeNumber(
			continuation?.workoutStartDistance
		),
	};
}

export function restoreFitWorkoutMetadata(
	message: Pick<Mesg, 'developerFields'> | undefined
): FitWorkoutMetadata | undefined {
	const courseId = message?.developerFields?.[String(FIT_WORKOUT_DEVELOPER_FIELD.COURSE_ID)];
	const startDistance =
		message?.developerFields?.[String(FIT_WORKOUT_DEVELOPER_FIELD.START_DISTANCE)];
	if (!(isString(courseId) && courseId.trim() && isFiniteNumber(startDistance))) {
		return;
	}
	return {
		courseId: courseId.trim(),
		startDistance: nonNegativeNumber(startDistance),
	};
}
