import { describe, expect, test } from 'bun:test';
import { BUILD_PR_URL, buildPullRequestUrl, formatBuildTimestamp } from '../src/lib/build-info';

describe('build information', () => {
	test('links exact builds to their PR and defaults PR lists to closed', () => {
		expect(buildPullRequestUrl('https://github.com/lookfirst/RideControl/pull/12')).toBe(
			'https://github.com/lookfirst/RideControl/pull/12'
		);
		expect(buildPullRequestUrl('https://github.com/lookfirst/RideControl/pulls')).toBe(
			'https://github.com/lookfirst/RideControl/pulls?q=is%3Apr+is%3Aclosed'
		);
		expect(BUILD_PR_URL).toContain('q=is%3Apr+is%3Aclosed');
	});

	test('formats a UTC timestamp in the viewer timezone', () => {
		expect(formatBuildTimestamp('2026-07-18T19:44:00Z', 'America/Los_Angeles')).toBe(
			'Build: Jul 18th, 2026 12:44PM'
		);
	});

	test('formats ordinal edge cases and invalid timestamps', () => {
		expect(formatBuildTimestamp('2026-07-01T00:00:00Z', 'UTC')).toContain('Jul 1st');
		expect(formatBuildTimestamp('2026-07-02T00:00:00Z', 'UTC')).toContain('Jul 2nd');
		expect(formatBuildTimestamp('2026-07-03T00:00:00Z', 'UTC')).toContain('Jul 3rd');
		expect(formatBuildTimestamp('2026-07-11T00:00:00Z', 'UTC')).toContain('Jul 11th');
		expect(formatBuildTimestamp('invalid', 'UTC')).toBe('Build: Unknown');
	});
});
