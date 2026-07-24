import { describe, expect, test } from 'bun:test';
import {
	deploymentVersionChanged,
	deploymentVersionCheckDue,
	fetchDeploymentVersion,
	VERSION_CHECK_INTERVAL_MS,
	VERSION_MARKER_PATH,
} from '../src/lib/version-update';

describe('deployment version updates', () => {
	test('checks the static marker no more frequently than hourly', () => {
		expect(VERSION_CHECK_INTERVAL_MS).toBe(3_600_000);
		expect(VERSION_MARKER_PATH).toBe('/version.json');
		expect(deploymentVersionCheckDue(undefined, 100)).toBe(true);
		expect(deploymentVersionCheckDue(100, 100 + VERSION_CHECK_INTERVAL_MS - 1)).toBe(false);
		expect(deploymentVersionCheckDue(100, 100 + VERSION_CHECK_INTERVAL_MS)).toBe(true);
	});

	test('detects a different deployed build', () => {
		expect(
			deploymentVersionChanged('2026-07-23T12:00:00.000Z', '2026-07-23T13:00:00.000Z')
		).toBe(true);
		expect(deploymentVersionChanged('same-build', 'same-build')).toBe(false);
	});

	test('revalidates and parses the deployed static marker', async () => {
		const requests: Array<{ input: string; cache?: RequestCache }> = [];
		const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push({ cache: init?.cache, input: String(input) });
			return Promise.resolve(Response.json({ version: 'new-build' }));
		};

		expect(await fetchDeploymentVersion(fetcher)).toBe('new-build');
		expect(requests).toEqual([{ cache: 'no-cache', input: '/version.json' }]);
	});

	test('silently ignores missing, invalid, and failed markers', async () => {
		const missing = () => Promise.resolve(new Response('', { status: 404 }));
		const invalid = () => Promise.resolve(Response.json({ version: '' }));
		const failed = () => Promise.reject(new Error('offline'));

		expect(await fetchDeploymentVersion(missing)).toBeUndefined();
		expect(await fetchDeploymentVersion(invalid)).toBeUndefined();
		expect(await fetchDeploymentVersion(failed)).toBeUndefined();
	});
});
