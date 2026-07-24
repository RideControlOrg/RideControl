import { z } from 'zod';

export const VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const VERSION_MARKER_PATH = '/version.json';

const versionMarkerSchema = z.object({
	version: z.string().min(1),
});

type DeploymentVersionFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function deploymentVersionChanged(currentVersion: string, deployedVersion: string): boolean {
	return currentVersion !== deployedVersion;
}

export function deploymentVersionCheckDue(lastCheckedAt: number | undefined, now: number): boolean {
	return lastCheckedAt === undefined || now - lastCheckedAt >= VERSION_CHECK_INTERVAL_MS;
}

export async function fetchDeploymentVersion(
	fetcher: DeploymentVersionFetcher = globalThis.fetch
): Promise<string | undefined> {
	try {
		const response = await fetcher(VERSION_MARKER_PATH, {
			cache: 'no-cache',
		});
		if (!response.ok) {
			return;
		}
		const marker = versionMarkerSchema.safeParse(await response.json());
		return marker.success ? marker.data.version : undefined;
	} catch {
		// Network and parsing failures are retried at the next scheduled check.
	}
}
