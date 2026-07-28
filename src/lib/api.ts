const CONFIGURED_API_ROOT = import.meta.env.VITE_RIDECONTROL_API_URL || '/api';

export const API_ROOT = CONFIGURED_API_ROOT.replace(/\/$/u, '');

export function apiUrl(path: string): string {
	return `${API_ROOT}${path}`;
}
