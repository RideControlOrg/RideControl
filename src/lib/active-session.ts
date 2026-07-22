import { emptySession } from '../constants';
import type { StoredSession } from '../types';
import { loadActiveSession, persistActiveSession } from './saved-sessions';
import { loadStoredSession, SESSION_STORAGE_KEY } from './session';

// Remove this module-level migration after the localStorage upgrade window has passed.
export const ACTIVE_SESSION_LOCAL_STORAGE_MIGRATION_VERSION = 1;

type LegacySessionStorage = Pick<Storage, 'getItem' | 'removeItem'>;

interface ActiveSessionStorage {
	load: () => Promise<StoredSession | undefined>;
	persist: (session: StoredSession) => Promise<void>;
}

const indexedDbActiveSessionStorage: ActiveSessionStorage = {
	load: loadActiveSession,
	persist: persistActiveSession,
};

export async function loadInitialSession(
	legacyStorage: LegacySessionStorage = localStorage,
	activeStorage: ActiveSessionStorage = indexedDbActiveSessionStorage
): Promise<StoredSession> {
	try {
		const active = await activeStorage.load();
		if (active) {
			legacyStorage.removeItem(SESSION_STORAGE_KEY);
			return active;
		}
		if (legacyStorage.getItem(SESSION_STORAGE_KEY) === null) {
			return emptySession;
		}
		const legacy = loadStoredSession(legacyStorage);
		await activeStorage.persist(legacy);
		legacyStorage.removeItem(SESSION_STORAGE_KEY);
		return legacy;
	} catch {
		return loadStoredSession(legacyStorage);
	}
}

export function createActiveSessionWriter(
	write: (session: StoredSession) => Promise<void> = persistActiveSession
): (session: StoredSession) => Promise<void> {
	let pending = Promise.resolve();
	return (session) => {
		pending = pending.catch(() => undefined).then(() => write(session));
		return pending;
	};
}
