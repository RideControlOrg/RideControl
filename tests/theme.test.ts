import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { applyUiTheme, isUiTheme, storedUiTheme, UI_THEME_STORAGE_KEY } from '../src/lib/theme';

const stylesheet = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const routeMapSource = await readFile(
	new URL('../src/components/workout-route-map.tsx', import.meta.url),
	'utf8'
);

function cssBlock(selector: string): string {
	const start = stylesheet.indexOf(`${selector} {`);
	if (start === -1) {
		throw new Error(`Missing CSS block: ${selector}`);
	}
	const contentStart = stylesheet.indexOf('{', start) + 1;
	let depth = 1;
	for (let index = contentStart; index < stylesheet.length; index += 1) {
		if (stylesheet[index] === '{') {
			depth += 1;
		}
		if (stylesheet[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return stylesheet.slice(contentStart, index);
			}
		}
	}
	throw new Error(`Unclosed CSS block: ${selector}`);
}

function cssVariable(block: string, name: string): string {
	const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
	if (!match) {
		throw new Error(`Missing hexadecimal CSS variable: ${name}`);
	}
	return match[1];
}

function relativeLuminance(hex: string): number {
	const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
	const linearChannels = channels.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.040_45 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return linearChannels[0] * 0.2126 + linearChannels[1] * 0.7152 + linearChannels[2] * 0.0722;
}

function contrastRatio(first: string, second: string): number {
	const luminances = [relativeLuminance(first), relativeLuminance(second)].sort(
		(left, right) => right - left
	);
	return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

describe('interface theme', () => {
	test('restores supported themes and follows the system before a preference is saved', () => {
		const storage = {
			getItem: (key: string) => (key === UI_THEME_STORAGE_KEY ? 'light' : null),
		};
		expect(storedUiTheme(storage, false)).toBe('light');
		expect(storedUiTheme({ getItem: () => null }, true)).toBe('light');
		expect(storedUiTheme({ getItem: () => 'sepia' }, false)).toBe('dark');
		expect(isUiTheme('dark')).toBe(true);
		expect(isUiTheme('sepia')).toBe(false);
	});

	test('applies the selected theme to the document root immediately', () => {
		const root = {
			dataset: {} as DOMStringMap,
			style: {} as CSSStyleDeclaration,
		} as HTMLElement;
		applyUiTheme('light', root);
		expect(root.dataset.theme).toBe('light');
		expect(root.style.colorScheme).toBe('light');
	});

	test('keeps semantic text and chart colors legible in both themes', () => {
		const darkTheme = `${cssBlock('@theme')}\n${cssBlock(':root')}`;
		const lightTheme = cssBlock('html[data-theme="light"]');
		const textColors = [
			'--color-cyan-100',
			'--color-cyan-200',
			'--color-cyan-300',
			'--color-cyan-400',
			'--color-sky-100',
			'--color-sky-200',
			'--color-sky-300',
			'--color-sky-400',
			'--color-violet-300',
			'--color-violet-400',
			'--color-rose-200',
			'--color-rose-300',
			'--color-rose-400',
			'--color-amber-100',
			'--color-amber-200',
			'--color-amber-300',
			'--color-amber-400',
			'--color-yellow-300',
			'--color-yellow-400',
			'--metric-speed',
			'--metric-power',
			'--metric-cadence',
			'--metric-heart-rate',
			'--metric-gear',
			'--metric-resistance',
			'--metric-grade',
			'--metric-elevation',
			'--metric-distance',
			'--metric-downhill',
			'--metric-rides',
		];
		for (const theme of [darkTheme, lightTheme]) {
			const surfaces = [
				cssVariable(theme, '--color-panel'),
				cssVariable(theme, '--surface-muted'),
			];
			for (const colorName of textColors) {
				const color = cssVariable(theme, colorName);
				for (const surface of surfaces) {
					expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
				}
			}
		}
	});

	test('keeps chart series distinct from the plotting surface in both themes', () => {
		const darkTheme = `${cssBlock('@theme')}\n${cssBlock(':root')}`;
		const lightTheme = cssBlock('html[data-theme="light"]');
		const chartColors = [
			'--metric-speed',
			'--metric-power',
			'--metric-cadence',
			'--metric-heart-rate',
			'--metric-gear',
			'--metric-resistance',
			'--metric-grade',
			'--metric-elevation',
		];
		for (const theme of [darkTheme, lightTheme]) {
			const surface = cssVariable(theme, '--chart-surface');
			for (const colorName of chartColors) {
				expect(
					contrastRatio(cssVariable(theme, colorName), surface)
				).toBeGreaterThanOrEqual(3);
			}
		}
	});

	test('keeps plot bands darker than the surrounding page in both themes', () => {
		const darkTheme = `${cssBlock('@theme')}\n${cssBlock(':root')}`;
		const lightTheme = cssBlock('html[data-theme="light"]');
		for (const theme of [darkTheme, lightTheme]) {
			expect(relativeLuminance(cssVariable(theme, '--chart-surface'))).toBeLessThan(
				relativeLuminance(cssVariable(theme, '--color-ink'))
			);
		}
	});

	test('keeps dividers and chart guides distinguishable in both themes', () => {
		const darkTheme = `${cssBlock('@theme')}\n${cssBlock(':root')}`;
		const lightTheme = cssBlock('html[data-theme="light"]');
		for (const theme of [darkTheme, lightTheme]) {
			const surfaces = [
				cssVariable(theme, '--color-panel'),
				cssVariable(theme, '--surface-muted'),
			];
			for (const colorName of ['--color-line', '--chart-grid']) {
				const color = cssVariable(theme, colorName);
				for (const surface of surfaces) {
					expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(3);
				}
			}
		}
	});

	test('keeps resistance ramp progress obvious in both themes', () => {
		const darkTheme = `${cssBlock('@theme')}\n${cssBlock(':root')}`;
		const lightTheme = cssBlock('html[data-theme="light"]');
		for (const theme of [darkTheme, lightTheme]) {
			const fill = cssVariable(theme, '--resistance-ramp-fill');
			const rest = cssVariable(theme, '--resistance-ramp-rest');
			expect(contrastRatio(fill, rest)).toBeGreaterThanOrEqual(4.5);
		}
		expect(stylesheet).toContain(
			'linear-gradient(var(--resistance-thumb-marker) 0 0) center /'
		);
		expect(stylesheet).toContain('0.375rem 0.375rem no-repeat');
		expect(stylesheet).not.toContain('radial-gradient(circle, var(--color-mint)');
	});

	test('keeps route endpoints and the bike visible over map tiles', () => {
		const endpoint = cssBlock('.ride-control-route-endpoint');
		const bike = cssBlock('.ride-control-bike-marker__body');
		expect(endpoint).toContain('width: 14px');
		expect(endpoint).toContain('height: 14px');
		expect(endpoint).toContain('border: 3px solid #071018');
		expect(cssBlock('.ride-control-route-endpoint--start')).toContain('border-radius: 50%');
		expect(cssBlock('.ride-control-route-endpoint--finish')).toContain(
			'background: var(--color-amber-400)'
		);
		expect(cssBlock('.ride-control-route-endpoint--finish')).toContain('border-radius: 0');
		expect(cssBlock('.ride-control-route-endpoint--shared')).toContain(
			'var(--color-mint) 0 50%'
		);
		expect(bike).toContain('background: #071018');
		expect(bike).toContain('border: 2px solid #071018');
		expect(bike).toContain('0 0 0 2px #f4f7f5');
		expect(bike).toContain('0 0 0 4px rgb(103 232 249 / 95%)');
		expect(cssBlock('.ride-control-bike-marker__image')).toContain('object-fit: cover');
		expect(routeMapSource).toContain('src="/favicon.png"');
	});
});
