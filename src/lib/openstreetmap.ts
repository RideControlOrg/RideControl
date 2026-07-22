import type { GeographicRoutePoint } from '../types';
import { valueRange } from './arrays';

const OPENSTREETMAP_URL = 'https://www.openstreetmap.org/';
const MINIMUM_ROUTE_PADDING_DEGREES = 0.001;
const ROUTE_PADDING_RATIO = 0.08;
const COORDINATE_PRECISION = 6;

function coordinate(value: number): string {
	return value.toFixed(COORDINATE_PRECISION);
}

export function openStreetMapRouteUrl(
	points: readonly Pick<GeographicRoutePoint, 'latitude' | 'longitude'>[]
): string | undefined {
	const [start] = points;
	if (!start) {
		return;
	}
	const latitudeRange = valueRange(points, (point) => point.latitude);
	const longitudeRange = valueRange(points, (point) => point.longitude);
	if (!(latitudeRange && longitudeRange)) {
		return;
	}
	const { maximum: maximumLatitude, minimum: minimumLatitude } = latitudeRange;
	const { maximum: maximumLongitude, minimum: minimumLongitude } = longitudeRange;
	const latitudePadding = Math.max(
		(maximumLatitude - minimumLatitude) * ROUTE_PADDING_RATIO,
		MINIMUM_ROUTE_PADDING_DEGREES
	);
	const longitudePadding = Math.max(
		(maximumLongitude - minimumLongitude) * ROUTE_PADDING_RATIO,
		MINIMUM_ROUTE_PADDING_DEGREES
	);
	const url = new URL(OPENSTREETMAP_URL);
	url.searchParams.set('minlon', coordinate(minimumLongitude - longitudePadding));
	url.searchParams.set('minlat', coordinate(minimumLatitude - latitudePadding));
	url.searchParams.set('maxlon', coordinate(maximumLongitude + longitudePadding));
	url.searchParams.set('maxlat', coordinate(maximumLatitude + latitudePadding));
	url.searchParams.set('mlat', coordinate(start.latitude));
	url.searchParams.set('mlon', coordinate(start.longitude));
	return url.toString();
}
