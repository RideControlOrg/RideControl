import { describe, expect, test } from 'bun:test';
import { reverseGeocodeStartingCity } from '../src/lib/reverse-geocode';

describe('starting-city reverse geocoding', () => {
	test('requests the starting coordinate and caches the resolved city', async () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};
		let requestCount = 0;
		const fetcher = ((input: string | URL | Request) => {
			requestCount += 1;
			const url = new URL(String(input));
			expect(url.origin).toBe('https://nominatim.openstreetmap.org');
			expect(url.searchParams.get('lat')).toBe('36.9741');
			expect(url.searchParams.get('lon')).toBe('-122.0308');
			expect(url.searchParams.get('zoom')).toBe('10');
			return Promise.resolve(
				Response.json({
					features: [{ properties: { geocoding: { city: 'Santa Cruz' } } }],
				})
			);
		}) as typeof fetch;
		const point = { latitude: 36.9741, longitude: -122.0308 };

		expect(
			await reverseGeocodeStartingCity(point, {
				fetcher,
				language: 'en-US',
				storage,
			})
		).toBe('Santa Cruz');
		expect(await reverseGeocodeStartingCity(point, { fetcher, storage })).toBe('Santa Cruz');
		expect(requestCount).toBe(1);
	});
});
