export function loadScrollPosition(
	key: string,
	storage: Pick<Storage, 'getItem'> = localStorage
): number {
	try {
		const position = Number(storage.getItem(key));
		return Number.isFinite(position) && position > 0 ? position : 0;
	} catch {
		return 0;
	}
}

export function saveScrollPosition(
	key: string,
	position: number,
	storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
	try {
		const safePosition = Number.isFinite(position) ? Math.max(0, Math.round(position)) : 0;
		storage.setItem(key, String(safePosition));
		return true;
	} catch {
		return false;
	}
}
