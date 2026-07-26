import { describe, expect, test } from 'bun:test';
import { createPreferencesStore } from '../src/stores/preferences-store';

function memoryStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		values,
	};
}

describe('preferences store', () => {
	test('restores and persists shared display preferences', () => {
		const storage = memoryStorage({
			'ride-control-theme': 'light',
			'speed-unit': 'kmh',
			'trainer-chart-mode': 'power',
		});
		const store = createPreferencesStore(storage);

		expect(store.get()).toEqual({ chartMode: 'power', speedUnit: 'kmh', theme: 'light' });

		store.actions.selectChartMode('cadence');
		store.actions.selectSpeedUnit('mph');
		store.actions.selectTheme('dark');

		expect(store.get()).toEqual({ chartMode: 'cadence', speedUnit: 'mph', theme: 'dark' });
		expect(storage.values.get('ride-control-theme')).toBe('dark');
		expect(storage.values.get('trainer-chart-mode')).toBe('cadence');
		expect(storage.values.get('speed-unit')).toBe('mph');
	});
});
