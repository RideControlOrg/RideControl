const DEFAULT_BUILD_PR_URL = 'https://github.com/RideControlOrg/RideControl/pulls';
const FRONTEND_PULL_REQUEST_ROOT = 'https://github.com/RideControlOrg/RideControl/pull/';
const RECENT_PULL_REQUEST_LIMIT = 10;

export interface BuildPullRequest {
	mergedAt: string;
	number: number;
	title: string;
	url: string;
}

export function buildPullRequestUrl(url: string) {
	return url.endsWith('/pulls') ? `${url}?q=is%3Apr+is%3Aclosed` : url;
}

export const BUILD_PR_URL = buildPullRequestUrl(
	import.meta.env.RIDE_CONTROL_BUILD_PR_URL ?? DEFAULT_BUILD_PR_URL
);
export const BUILD_TIMESTAMP_UTC =
	import.meta.env.RIDE_CONTROL_BUILD_TIMESTAMP_UTC ?? new Date().toISOString();

function isBuildPullRequest(value: unknown): value is BuildPullRequest {
	if (!(typeof value === 'object' && value !== null)) {
		return false;
	}
	const candidate = value as Partial<BuildPullRequest>;
	return (
		typeof candidate.title === 'string' &&
		candidate.title.trim().length > 0 &&
		typeof candidate.url === 'string' &&
		candidate.url.startsWith(FRONTEND_PULL_REQUEST_ROOT) &&
		typeof candidate.mergedAt === 'string' &&
		Number.isFinite(new Date(candidate.mergedAt).getTime()) &&
		typeof candidate.number === 'number' &&
		Number.isInteger(candidate.number) &&
		candidate.number > 0
	);
}

export function parseBuildPullRequests(source: string | undefined): BuildPullRequest[] {
	if (!source) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(source);
		return Array.isArray(parsed)
			? parsed.filter(isBuildPullRequest).slice(0, RECENT_PULL_REQUEST_LIMIT)
			: [];
	} catch {
		return [];
	}
}

export const BUILD_RECENT_PULL_REQUESTS = parseBuildPullRequests(
	import.meta.env.RIDE_CONTROL_BUILD_RECENT_PRS
);

export function formatBuildIdentifier(timestampUtc: string) {
	const timestamp = new Date(timestampUtc);
	if (Number.isNaN(timestamp.getTime())) {
		return 'Unknown';
	}
	const datePart = timestamp.toISOString().slice(0, 10).replaceAll('-', '.');
	const timePart = timestamp.toISOString().slice(11, 19).replaceAll(':', '');
	return `${datePart}.${timePart}`;
}

export function formatBuildPullRequestDate(mergedAt: string, timeZone?: string) {
	const timestamp = new Date(mergedAt);
	if (Number.isNaN(timestamp.getTime())) {
		return 'Unknown date';
	}
	return new Intl.DateTimeFormat('en-US', {
		day: 'numeric',
		month: 'short',
		timeZone,
		year: 'numeric',
	}).format(timestamp);
}

function ordinalSuffix(day: number) {
	const finalTwoDigits = day % 100;
	if (finalTwoDigits >= 11 && finalTwoDigits <= 13) {
		return 'th';
	}
	switch (day % 10) {
		case 1:
			return 'st';
		case 2:
			return 'nd';
		case 3:
			return 'rd';
		default:
			return 'th';
	}
}

export function formatBuildTimestamp(timestampUtc: string, timeZone?: string) {
	const timestamp = new Date(timestampUtc);
	if (Number.isNaN(timestamp.getTime())) {
		return 'Build: Unknown';
	}
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			day: 'numeric',
			hour: 'numeric',
			hour12: true,
			minute: '2-digit',
			month: 'short',
			timeZone,
			year: 'numeric',
		})
			.formatToParts(timestamp)
			.map(({ type, value }) => [type, value])
	);
	const day = Number(parts.day);
	return `Build: ${parts.month} ${day}${ordinalSuffix(day)}, ${parts.year} ${parts.hour}:${parts.minute}${parts.dayPeriod}`;
}
