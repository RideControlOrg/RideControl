export const WELCOME_DISMISSED_STORAGE_KEY = 'ride-control-welcome-dismissed';

export function shouldShowWelcome(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
	try {
		return storage.getItem(WELCOME_DISMISSED_STORAGE_KEY) !== 'true';
	} catch {
		return true;
	}
}

export function rememberWelcomeDismissal(
	storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
	try {
		storage.setItem(WELCOME_DISMISSED_STORAGE_KEY, 'true');
		return true;
	} catch {
		return false;
	}
}
