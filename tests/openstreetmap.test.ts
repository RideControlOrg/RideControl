import { describe, expect, test } from 'bun:test';
import { openStreetMapRouteUrl } from '../src/lib/openstreetmap';

describe('OpenStreetMap workout links', () => {
	test('frames the route and marks its starting coordinate', () => {
		const routeUrl = openStreetMapRouteUrl([
			{ latitude: 60.1, longitude: 19.9 },
			{ latitude: 60.2, longitude: 20.1 },
		]);
		if (!routeUrl) {
			throw new Error('Expected an OpenStreetMap route URL');
		}
		const url = new URL(routeUrl);
		expect(url.origin).toBe('https://www.openstreetmap.org');
		expect(url.searchParams.get('mlat')).toBe('60.100000');
		expect(url.searchParams.get('mlon')).toBe('19.900000');
		expect(url.searchParams.get('minlat')).toBe('60.092000');
		expect(url.searchParams.get('maxlat')).toBe('60.208000');
		expect(url.searchParams.get('minlon')).toBe('19.884000');
		expect(url.searchParams.get('maxlon')).toBe('20.116000');
	});

	test('does not create a map link without route coordinates', () => {
		expect(openStreetMapRouteUrl([])).toBeUndefined();
	});
});
