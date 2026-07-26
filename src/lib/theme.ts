export const UI_THEME = {
	DARK: 'dark',
	LIGHT: 'light',
} as const;

export type UiTheme = (typeof UI_THEME)[keyof typeof UI_THEME];

export const UI_THEME_STORAGE_KEY = 'ride-control-theme';

export function isUiTheme(value: string | null): value is UiTheme {
	return value === UI_THEME.DARK || value === UI_THEME.LIGHT;
}

export function storedUiTheme(
	storage: Pick<Storage, 'getItem'> = localStorage,
	preferredLight = globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ?? false
): UiTheme {
	const stored = storage.getItem(UI_THEME_STORAGE_KEY);
	if (isUiTheme(stored)) {
		return stored;
	}
	return preferredLight ? UI_THEME.LIGHT : UI_THEME.DARK;
}

export function applyUiTheme(theme: UiTheme, root: HTMLElement = document.documentElement): void {
	root.dataset.theme = theme;
	root.style.colorScheme = theme;
}
