export type AppShortcut = 'history' | 'pause' | 'shortcuts';

export function appShortcutForKey({ code, key }: Pick<KeyboardEvent, 'code' | 'key'>) {
	if (key.toLowerCase() === 'h') {
		return 'history' satisfies AppShortcut;
	}
	if (key === '?') {
		return 'shortcuts' satisfies AppShortcut;
	}
	if (code === 'Space') {
		return 'pause' satisfies AppShortcut;
	}
}
