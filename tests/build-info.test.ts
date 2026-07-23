import { describe, expect, test } from 'bun:test';
import {
	BUILD_PR_URL,
	buildPullRequestUrl,
	formatBuildIdentifier,
	formatBuildPullRequestDate,
	formatBuildTimestamp,
	parseBuildPullRequests,
} from '../src/lib/build-info';

describe('build information', () => {
	test('links exact builds to their PR and defaults PR lists to closed', () => {
		expect(buildPullRequestUrl('https://github.com/RideControlOrg/RideControl/pull/12')).toBe(
			'https://github.com/RideControlOrg/RideControl/pull/12'
		);
		expect(buildPullRequestUrl('https://github.com/RideControlOrg/RideControl/pulls')).toBe(
			'https://github.com/RideControlOrg/RideControl/pulls?q=is%3Apr+is%3Aclosed'
		);
		expect(BUILD_PR_URL).toContain('q=is%3Apr+is%3Aclosed');
	});

	test('formats a UTC timestamp in the viewer timezone', () => {
		expect(formatBuildTimestamp('2026-07-18T19:44:00Z', 'America/Los_Angeles')).toBe(
			'Build: Jul 18th, 2026 12:44PM'
		);
		expect(formatBuildIdentifier('2026-07-18T19:44:07Z')).toBe('2026.07.18.194407');
		expect(formatBuildPullRequestDate('2026-07-18T19:44:07Z', 'UTC')).toBe('Jul 18, 2026');
	});

	test('formats ordinal edge cases and invalid timestamps', () => {
		expect(formatBuildTimestamp('2026-07-01T00:00:00Z', 'UTC')).toContain('Jul 1st');
		expect(formatBuildTimestamp('2026-07-02T00:00:00Z', 'UTC')).toContain('Jul 2nd');
		expect(formatBuildTimestamp('2026-07-03T00:00:00Z', 'UTC')).toContain('Jul 3rd');
		expect(formatBuildTimestamp('2026-07-11T00:00:00Z', 'UTC')).toContain('Jul 11th');
		expect(formatBuildTimestamp('invalid', 'UTC')).toBe('Build: Unknown');
		expect(formatBuildIdentifier('invalid')).toBe('Unknown');
		expect(formatBuildPullRequestDate('invalid', 'UTC')).toBe('Unknown date');
	});

	test('validates and limits embedded production pull request metadata', () => {
		const validPullRequests = Array.from({ length: 12 }, (_, index) => ({
			mergedAt: `2026-07-${String(20 - index).padStart(2, '0')}T12:00:00Z`,
			number: 100 - index,
			title: `Improve feature ${index + 1}`,
			url: `https://github.com/RideControlOrg/RideControl/pull/${100 - index}`,
		}));
		expect(parseBuildPullRequests(JSON.stringify(validPullRequests))).toHaveLength(10);
		expect(parseBuildPullRequests('not json')).toEqual([]);
		expect(
			parseBuildPullRequests(
				JSON.stringify([
					...validPullRequests.slice(0, 1),
					{
						mergedAt: 'invalid',
						number: 2,
						title: 'Bad metadata',
						url: 'https://example.com/pull/2',
					},
				])
			)
		).toEqual(validPullRequests.slice(0, 1));
	});
});
