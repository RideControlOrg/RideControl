const DEFAULT_BUILD_PR_URL = 'https://github.com/RideControlOrg/RideControl/pulls';

export function buildPullRequestUrl(url: string) {
	return url.endsWith('/pulls') ? `${url}?q=is%3Apr+is%3Aclosed` : url;
}

export const BUILD_PR_URL = buildPullRequestUrl(
	import.meta.env.RIDE_CONTROL_BUILD_PR_URL ?? DEFAULT_BUILD_PR_URL
);
export const BUILD_TIMESTAMP_UTC =
	import.meta.env.RIDE_CONTROL_BUILD_TIMESTAMP_UTC ?? new Date().toISOString();

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
