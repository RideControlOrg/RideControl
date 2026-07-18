import { describe, expect, test } from 'bun:test';
import { distanceBetween, parseGpx } from '../src/lib/gpx';

function point(lat: string, lon: string, elevation?: string) {
	return {
		getAttribute: (name: string) => (name === 'lat' ? lat : lon),
		querySelector: () => (elevation === undefined ? null : { textContent: elevation }),
	} as unknown as Element;
}

describe('GPX utilities', () => {
	test('computes great-circle distance', () => {
		expect(distanceBetween(0, 0, 0, 1)).toBeCloseTo(111_194.9, 0);
		expect(distanceBetween(34, -118, 34, -118)).toBe(0);
	});

	test('parses route points and cumulative kilometers', () => {
		const points = [point('0', '0', '10'), point('0', '1', '20')];
		const parser = {
			parseFromString: () => ({ querySelectorAll: () => points }),
		} as unknown as DOMParser;
		const route = parseGpx('<gpx />', parser);
		expect(route[0]).toEqual({ distance: 0, elevation: 10 });
		expect(route[1]?.distance).toBeCloseTo(111.195, 2);
		expect(route[1]?.elevation).toBe(20);
	});
});
