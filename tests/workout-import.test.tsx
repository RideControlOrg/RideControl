import { describe, expect, mock, test } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import { renderToStaticMarkup } from 'react-dom/server';
import { GpxImportChoiceDialog, GpxImportResultDialog } from '../src/components/gpx-import-dialog';
import {
	MAX_GPX_FILE_BYTES,
	MAX_GPX_ROUTE_POINTS,
	parseWorkoutFile,
} from '../src/lib/workout-file';
import {
	GPX_IMPORT_PROCESSOR,
	gpxUploadValidationError,
	importWorkoutFile,
} from '../src/lib/workout-import';

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: DOMParser });

const VALID_GPX = `<?xml version="1.0"?>
<gpx version="1.1">
	<trk>
		<name>Safe uploaded route</name>
		<desc>A test route</desc>
		<trkseg>
			<trkpt lat="37.0000" lon="-122.0000"><ele>10</ele></trkpt>
			<trkpt lat="37.0010" lon="-122.0010"><ele>20</ele></trkpt>
			<trkpt lat="37.0020" lon="-122.0020"><ele>15</ele></trkpt>
		</trkseg>
	</trk>
</gpx>`;

function gpxFile(source = VALID_GPX, name = 'safe-route.gpx'): File {
	return new File([source], name, { type: 'application/gpx+xml' });
}

describe('GPX workout imports', () => {
	test('uses enhanced Worker output only after that processor is selected', async () => {
		const workerCourse = parseWorkoutFile(VALID_GPX);
		const fetcher = mock((request: string | URL | Request, init?: RequestInit) => {
			expect(String(request)).toEndWith('/gpx/import');
			expect(init?.method).toBe('POST');
			expect(init?.body).toBeInstanceOf(File);
			expect(new Headers(init?.headers).get('X-RideControl-File-Name')).toBe(
				encodeURIComponent('safe-route.gpx')
			);
			return Response.json({
				course: workerCourse,
				warnings: ['Skipped 1 route point without valid elevation.'],
			});
		}) as unknown as typeof fetch;

		const result = await importWorkoutFile(gpxFile(), GPX_IMPORT_PROCESSOR.WORKER, fetcher);

		expect(result.processor).toBe(GPX_IMPORT_PROCESSOR.WORKER);
		expect(result.course.name).toBe('Safe uploaded route');
		expect(result.warnings).toEqual(['Skipped 1 route point without valid elevation.']);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	test('keeps declined imports local and skips every Worker request', async () => {
		const fetcher = mock(() => {
			throw new Error('The Worker must not be called');
		}) as unknown as typeof fetch;

		const result = await importWorkoutFile(gpxFile(), GPX_IMPORT_PROCESSOR.LOCAL, fetcher);

		expect(result.processor).toBe(GPX_IMPORT_PROCESSOR.LOCAL);
		expect(result.course.name).toBe('Safe uploaded route');
		expect(fetcher).not.toHaveBeenCalled();
	});

	test('falls back locally when enhanced processing is unavailable', async () => {
		const fetcher = mock(() =>
			Response.json({ error: 'Processor unavailable.' }, { status: 503 })
		) as unknown as typeof fetch;

		const result = await importWorkoutFile(gpxFile(), GPX_IMPORT_PROCESSOR.WORKER, fetcher);

		expect(result.processor).toBe(GPX_IMPORT_PROCESSOR.LOCAL);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('Processor unavailable');
	});

	test('reports both processing failures without accepting malformed XML', async () => {
		const fetcher = mock(() =>
			Response.json({ error: 'Invalid route.' }, { status: 422 })
		) as unknown as typeof fetch;

		await expect(
			importWorkoutFile(gpxFile('<gpx><broken'), GPX_IMPORT_PROCESSOR.WORKER, fetcher)
		).rejects.toThrow('Local processing also failed');
	});

	test('rejects unsafe, unsupported, empty, and oversized files before processing', async () => {
		expect(gpxUploadValidationError(gpxFile(VALID_GPX, 'route.txt'))).toContain('.gpx');
		expect(gpxUploadValidationError(gpxFile('', 'empty.gpx'))).toContain('empty');
		expect(
			gpxUploadValidationError(gpxFile('x'.repeat(MAX_GPX_FILE_BYTES + 1), 'oversized.gpx'))
		).toContain('2 MiB');
		await expect(
			importWorkoutFile(gpxFile('<!DOCTYPE gpx><gpx />'), GPX_IMPORT_PROCESSOR.LOCAL)
		).rejects.toThrow('document type');
		await expect(
			importWorkoutFile(
				gpxFile(
					`<gpx><trk><trkseg>${'<trkpt />'.repeat(MAX_GPX_ROUTE_POINTS + 1)}</trkseg></trk></gpx>`
				),
				GPX_IMPORT_PROCESSOR.LOCAL
			)
		).rejects.toThrow('route points');
	});

	test('renders a processing choice and a complete success or error summary', () => {
		const choice = renderToStaticMarkup(
			<GpxImportChoiceDialog
				fileName="safe-route.gpx"
				onCancel={() => undefined}
				onChoose={() => undefined}
			/>
		);
		expect(choice).toContain('Use enhanced processing');
		expect(choice).toContain('Process on this device');

		const result = {
			course: parseWorkoutFile(VALID_GPX),
			fileName: 'safe-route.gpx',
			processor: GPX_IMPORT_PROCESSOR.LOCAL,
			warnings: ['Enhanced processing was unavailable.'],
		};
		const summary = renderToStaticMarkup(
			<GpxImportResultDialog
				fileName={result.fileName}
				onClose={() => undefined}
				result={result}
				speedUnit="mph"
			/>
		);
		expect(summary).toContain('GPX route imported');
		expect(summary).toContain('Enhanced processing was unavailable.');
		expect(summary).toContain('Route points');

		const failure = renderToStaticMarkup(
			<GpxImportResultDialog
				error="The file is malformed."
				fileName="broken.gpx"
				onClose={() => undefined}
				speedUnit="mph"
			/>
		);
		expect(failure).toContain('GPX import failed');
		expect(failure).toContain('The file is malformed.');
	});
});
