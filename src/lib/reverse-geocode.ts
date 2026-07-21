import type { GeographicRoutePoint } from '../types';
import { isRecord, isString } from './type-guards';

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const CITY_CACHE_STORAGE_KEY = 'ride-control-reverse-geocode-cache';
const CACHE_COORDINATE_PRECISION = 5;
const MAX_CACHED_CITIES = 100;
const MINIMUM_REQUEST_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 5000;

interface ReverseGeocodeOptions {
	fetcher?: typeof fetch;
	language?: string;
	storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

interface CityCacheEntry {
	city: string;
	coordinates: string;
}

let requestQueue = Promise.resolve();
let lastRequestStartedAt = 0;

function coordinateKey(point: Pick<GeographicRoutePoint, 'latitude' | 'longitude'>): string {
	return `${point.latitude.toFixed(CACHE_COORDINATE_PRECISION)},${point.longitude.toFixed(CACHE_COORDINATE_PRECISION)}`;
}

function cacheEntries(value: unknown): CityCacheEntry[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((entry) => {
		if (!(isRecord(entry) && isString(entry.city) && isString(entry.coordinates))) {
			return [];
		}
		const city = entry.city.trim();
		const coordinates = entry.coordinates.trim();
		return city && coordinates ? [{ city, coordinates }] : [];
	});
}

function readCityCache(storage: Pick<Storage, 'getItem'> | undefined): CityCacheEntry[] {
	if (!storage) {
		return [];
	}
	try {
		const saved = storage.getItem(CITY_CACHE_STORAGE_KEY);
		return saved ? cacheEntries(JSON.parse(saved)) : [];
	} catch {
		return [];
	}
}

function saveCity(
	storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
	entry: CityCacheEntry
): void {
	if (!storage) {
		return;
	}
	try {
		const entries = readCityCache(storage).filter(
			(cached) => cached.coordinates !== entry.coordinates
		);
		storage.setItem(
			CITY_CACHE_STORAGE_KEY,
			JSON.stringify([entry, ...entries].slice(0, MAX_CACHED_CITIES))
		);
	} catch {
		// A city label is optional, so unavailable browser storage must not block import.
	}
}

function geocodedCity(value: unknown): string | undefined {
	if (!(isRecord(value) && Array.isArray(value.features))) {
		return;
	}
	const [feature] = value.features;
	if (!(isRecord(feature) && isRecord(feature.properties))) {
		return;
	}
	const { geocoding } = feature.properties;
	if (!isRecord(geocoding)) {
		return;
	}
	for (const candidate of [geocoding.city, geocoding.locality, geocoding.name]) {
		if (isString(candidate) && candidate.trim()) {
			return candidate.trim();
		}
	}
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function queuedRequest<T>(request: () => Promise<T>): Promise<T> {
	const result = requestQueue.then(async () => {
		const delay = Math.max(0, lastRequestStartedAt + MINIMUM_REQUEST_INTERVAL_MS - Date.now());
		if (delay > 0) {
			await wait(delay);
		}
		lastRequestStartedAt = Date.now();
		return request();
	});
	requestQueue = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		// Browser privacy modes can make local storage unavailable.
	}
}

export async function reverseGeocodeStartingCity(
	point: Pick<GeographicRoutePoint, 'latitude' | 'longitude'>,
	options: ReverseGeocodeOptions = {}
): Promise<string | undefined> {
	const coordinates = coordinateKey(point);
	const storage = options.storage ?? browserStorage();
	const cached = readCityCache(storage).find((entry) => entry.coordinates === coordinates);
	if (cached) {
		return cached.city;
	}

	const url = new URL(NOMINATIM_REVERSE_URL);
	url.searchParams.set('addressdetails', '1');
	url.searchParams.set('format', 'geocodejson');
	url.searchParams.set('lat', String(point.latitude));
	url.searchParams.set('layer', 'address');
	url.searchParams.set('lon', String(point.longitude));
	url.searchParams.set('zoom', '10');
	const language = options.language ?? globalThis.navigator?.language;
	if (language) {
		url.searchParams.set('accept-language', language);
	}

	try {
		const city = await queuedRequest(async () => {
			const abortController = new AbortController();
			const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
			try {
				const response = await (options.fetcher ?? fetch)(url, {
					headers: { Accept: 'application/json' },
					signal: abortController.signal,
				});
				return response.ok ? geocodedCity(await response.json()) : undefined;
			} finally {
				clearTimeout(timeout);
			}
		});
		if (city) {
			saveCity(storage, { city, coordinates });
		}
		return city;
	} catch {
		// City lookup is optional and must never prevent a valid GPX import.
	}
}
