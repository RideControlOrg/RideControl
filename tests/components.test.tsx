import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/app';
import { ConnectionControl } from '../src/components/connection-control';
import { Icon } from '../src/components/icon';
import { KeyboardShortcutsDialog } from '../src/components/keyboard-shortcuts-dialog';
import { Metric, metricAccentClass, metricIconClass, SmallMetric } from '../src/components/metrics';
import { Notification } from '../src/components/notification';
import { ResistanceControl } from '../src/components/resistance-control';
import { SessionDetail, SessionHistory } from '../src/components/session-history';
import { SessionSaveDialog } from '../src/components/session-save-dialog';
import { CHROME_BLUETOOTH_PERMISSION_MESSAGE, emptyMetrics, emptySession } from '../src/constants';

const render = (element: React.ReactNode) => renderToStaticMarkup(element);
const enabledEndSessionButton = /<button(?![^>]*disabled)[^>]*>End session<\/button>/;

describe('view components', () => {
	test('renders known and fallback icons', () => {
		expect(render(<Icon name="heart" />)).toContain('<title>heart</title>');
		expect(render(<Icon name="unknown" />)).toContain('<title>unknown</title>');
	});

	test('renders metric values and accent classes', () => {
		const html = render(
			<Metric
				accent="yellow"
				average="180"
				label="POWER"
				maximum="300"
				unit="watts"
				value="200"
			/>
		);
		expect(html).toContain('POWER');
		expect(html).toContain('200');
		expect(metricAccentClass('rose')).toBe('bg-rose-400');
		expect(metricAccentClass('other')).toBe('bg-mint');
		expect(metricIconClass('violet')).toBe('text-violet-400');
		expect(metricIconClass('other')).toBe('text-sky-400');
	});

	test('renders a compact session metric', () => {
		expect(render(<SmallMetric label="TIME" value="01:02:03" />)).toContain('01:02:03');
	});

	test('renders enabled and disabled resistance controls', () => {
		const enabled = render(
			<ResistanceControl
				disabled={false}
				max={100}
				min={0}
				onChange={() => undefined}
				step={1}
				value={20}
			/>
		);
		const disabled = render(
			<ResistanceControl
				disabled
				max={100}
				min={0}
				onChange={() => undefined}
				step={1}
				value={20}
			/>
		);
		expect(enabled).toContain('aria-label="Resistance"');
		expect(enabled).toContain('value="20"');
		expect(disabled).toContain('disabled');
	});

	test('renders connection, busy, and connected states', () => {
		expect(
			render(
				<ConnectionControl
					busy={false}
					connected={false}
					onCancel={() => undefined}
					onConnect={() => undefined}
					onDisconnect={() => undefined}
					status="Ready"
				/>
			)
		).toContain('Connect trainer');
		const busy = render(
			<ConnectionControl
				busy
				connected={false}
				onCancel={() => undefined}
				onConnect={() => undefined}
				onDisconnect={() => undefined}
				status="Connecting…"
			/>
		);
		expect(busy).toContain('role="status"');
		expect(busy).toContain('Connecting…');
		expect(busy).toContain('Cancel');
		expect(busy).not.toContain('Connect trainer');
		expect(
			render(
				<ConnectionControl
					busy={false}
					connected
					deviceName="KICKR"
					onCancel={() => undefined}
					onConnect={() => undefined}
					onDisconnect={() => undefined}
					status="Connected"
				/>
			)
		).toContain('Disconnect');
	});

	test('hides empty notifications and expands setup guidance', () => {
		expect(
			render(<Notification connected={false} notice="" onDismiss={() => undefined} />)
		).toBe('');
		expect(
			render(
				<Notification connected notice="Trainer connected." onDismiss={() => undefined} />
			)
		).toContain('flex items-center gap-3');
		const html = render(
			<Notification
				connected={false}
				notice={CHROME_BLUETOOTH_PERMISSION_MESSAGE}
				onDismiss={() => undefined}
			/>
		);
		expect(html).toContain('persistent Bluetooth permissions');
		expect(html).toContain('chrome://flags/');
	});

	test('composes the application dashboard', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: () => null,
				removeItem: () => undefined,
				setItem: () => undefined,
			},
		});
		const html = render(<App />);
		expect(html).toContain('Resistance control');
		expect(html).not.toContain('Import GPX');
		expect(html).toContain('Connect trainer');
		expect(html).toContain('History');
		expect(html).toContain('Show keyboard controls');
		expect(html).toMatch(enabledEndSessionButton);
	});

	test('renders the keyboard controls reference', () => {
		const html = render(<KeyboardShortcutsDialog onClose={() => undefined} open />);
		expect(html).toContain('Keyboard controls');
		expect(html).toContain('Open session history');
		expect(html).toContain('Increase or decrease resistance');
		expect(html).toContain('Change the chart view');
	});

	test('renders the session save workflow', () => {
		const html = render(
			<SessionSaveDialog
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{
					aggregates: emptySession.aggregates,
					calories: 100,
					distance: 10,
					elapsedSeconds: 3600,
					history: [],
					maximums: emptyMetrics,
					startedAt: Date.now(),
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Save this session?');
		expect(html).toContain('How did it feel?');
		expect(html).toContain('Start new without saving');
	});

	test('renders an empty session history', () => {
		const html = render(<SessionHistory onClose={() => undefined} open speedUnit="kmh" />);
		expect(html).toContain('Session history');
		expect(html).toContain('No saved sessions yet');
	});

	test('styles an unrecorded feeling like the comments value', () => {
		const html = render(
			<SessionDetail
				session={{
					aggregates: emptySession.aggregates,
					calories: 0,
					comments: '',
					distance: 0,
					elapsedSeconds: 0,
					endedAt: Date.now(),
					history: [],
					id: 'empty-session',
					maximums: emptyMetrics,
					startedAt: Date.now(),
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('FELT');
		expect(html).toContain(
			'<p class="mt-1 whitespace-pre-wrap text-slate-300 text-sm">Not recorded</p>'
		);
	});
});
