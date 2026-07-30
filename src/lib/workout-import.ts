import type { WorkoutCourse } from '../types';
import { apiUrl } from './api';
import { errorMessage } from './errors';
import { isRecord, isString } from './type-guards';
import { MAX_GPX_FILE_BYTES, readWorkoutFile } from './workout-file';
import { restoreWorkoutCourse } from './workouts';

export const GPX_IMPORT_PROCESSOR = {
	LOCAL: 'local',
	WORKER: 'worker',
} as const;

export type GpxImportProcessor = (typeof GPX_IMPORT_PROCESSOR)[keyof typeof GPX_IMPORT_PROCESSOR];

export interface WorkoutImportResult {
	course: WorkoutCourse;
	fileName: string;
	processor: GpxImportProcessor;
	warnings: string[];
}

const GPX_FILE_EXTENSION = /(?:\.workout)?\.gpx$/iu;
const WORKER_IMPORT_TIMEOUT_MILLISECONDS = 30_000;
const MAXIMUM_WORKER_WARNINGS = 10;
const MAXIMUM_WORKER_WARNING_LENGTH = 500;
const noStartingCityLookup = () => Promise.resolve(undefined);

export function gpxUploadValidationError(file: Pick<File, 'name' | 'size'>): string | undefined {
	if (!GPX_FILE_EXTENSION.test(file.name)) {
		return 'Choose a file with a .gpx extension.';
	}
	if (file.size <= 0) {
		return 'The selected GPX file is empty.';
	}
	if (file.size > MAX_GPX_FILE_BYTES) {
		return 'The GPX file is larger than the 2 MiB import limit.';
	}
}

async function workerError(response: Response): Promise<string> {
	try {
		const value: unknown = await response.json();
		if (isRecord(value) && isString(value.error)) {
			return value.error;
		}
	} catch {
		// A non-JSON platform error is reported with the safe status fallback below.
	}
	return `The route processor returned ${response.status}.`;
}

async function processWithWorker(
	file: File,
	fetcher: typeof fetch,
	signal: AbortSignal
): Promise<{ course: WorkoutCourse; warnings: string[] }> {
	const response = await fetcher(apiUrl('/gpx/import'), {
		body: file,
		cache: 'no-store',
		headers: {
			'Content-Type': 'application/gpx+xml',
			'X-RideControl-File-Name': encodeURIComponent(file.name),
		},
		method: 'POST',
		signal,
	});
	if (!response.ok) {
		throw new Error(await workerError(response));
	}
	const value: unknown = await response.json();
	const course = isRecord(value) ? restoreWorkoutCourse(value.course) : undefined;
	if (!course) {
		throw new Error('The route processor returned an invalid workout.');
	}
	const warnings =
		isRecord(value) &&
		Array.isArray(value.warnings) &&
		value.warnings.length <= MAXIMUM_WORKER_WARNINGS &&
		value.warnings.every(
			(warning) => isString(warning) && warning.length <= MAXIMUM_WORKER_WARNING_LENGTH
		)
			? value.warnings
			: [];
	return { course, warnings };
}

export async function importWorkoutFile(
	file: File,
	processor: GpxImportProcessor,
	fetcher: typeof fetch = fetch
): Promise<WorkoutImportResult> {
	const validationError = gpxUploadValidationError(file);
	if (validationError) {
		throw new Error(validationError);
	}
	if (processor === GPX_IMPORT_PROCESSOR.LOCAL) {
		return {
			course: await readWorkoutFile(file, noStartingCityLookup),
			fileName: file.name,
			processor,
			warnings: [],
		};
	}
	try {
		const processed = await processWithWorker(
			file,
			fetcher,
			AbortSignal.timeout(WORKER_IMPORT_TIMEOUT_MILLISECONDS)
		);
		return {
			course: processed.course,
			fileName: file.name,
			processor,
			warnings: processed.warnings,
		};
	} catch (workerFailure) {
		try {
			return {
				course: await readWorkoutFile(file, noStartingCityLookup),
				fileName: file.name,
				processor: GPX_IMPORT_PROCESSOR.LOCAL,
				warnings: [
					`Enhanced processing was unavailable (${errorMessage(workerFailure)}). The route was processed locally instead.`,
				],
			};
		} catch (localFailure) {
			throw new Error(
				`Enhanced processing failed: ${errorMessage(workerFailure)} Local processing also failed: ${errorMessage(localFailure)}`,
				{ cause: localFailure }
			);
		}
	}
}
