export const MAXIMUM_SESSION_DESCRIPTION_LENGTH = 500;

export function normalizeSessionDescription(value: unknown): string {
	return typeof value === 'string'
		? value.trim().slice(0, MAXIMUM_SESSION_DESCRIPTION_LENGTH)
		: '';
}
