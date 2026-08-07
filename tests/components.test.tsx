import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuildDetailsDialog } from '../src/components/build-details-dialog';
import { ConnectionControl } from '../src/components/connection-control';
import { DevicePairingButton, DevicePairingPanel } from '../src/components/device-pairing';
import { GearControl } from '../src/components/gear-control';
import { Icon } from '../src/components/icon';
import { InteractiveLineChart } from '../src/components/interactive-chart';
import { KeyboardShortcutsDialog } from '../src/components/keyboard-shortcuts-dialog';
import { PrivacyPolicyDialog, TermsOfServiceDialog } from '../src/components/legal-dialog';
import { Metric, SessionMetric, SmallMetric } from '../src/components/metrics';
import { Notification } from '../src/components/notification';
import { ProfilePanel, RemoveBikeDialog, RemoveImageDialog } from '../src/components/profile-panel';
import { RemoveWorkoutDialog } from '../src/components/remove-workout-dialog';
import { RenameWorkoutDialog } from '../src/components/rename-workout-dialog';
import { ResistanceControl } from '../src/components/resistance-control';
import { SelectMenu, SuggestionInput } from '../src/components/select-menu';
import { SessionCalendar } from '../src/components/session-calendar';
import { SessionChart } from '../src/components/session-chart';
import { SessionControls } from '../src/components/session-controls';
import { DeleteSessionDialog, SessionDetail } from '../src/components/session-detail';
import { SessionHistory } from '../src/components/session-history';
import { SessionHistoryList } from '../src/components/session-history-list';
import {
	SessionRecoveryNotice,
	sessionRecoveryConnectionsReady,
} from '../src/components/session-recovery-notice';
import { SessionSaveDialog } from '../src/components/session-save-dialog';
import { SessionStatistics } from '../src/components/session-statistics';
import { TrainingControl } from '../src/components/training-control';
import { VersionUpdateNotice } from '../src/components/version-update-notice';
import { WelcomeDialog } from '../src/components/welcome-dialog';
import { WorkoutPanel } from '../src/components/workout-panel';
import { WorkoutProgress } from '../src/components/workout-progress';
import {
	CHROME_BLUETOOTH_FLAGS_URL,
	CHROME_BLUETOOTH_PERMISSION_MESSAGE,
	emptyMetrics,
	emptySession,
} from '../src/constants';
import { formatGradeValue } from '../src/lib/format';
import { DEFAULT_VIRTUAL_DRIVETRAIN } from '../src/lib/gears';
import { historyKeyboardShortcuts } from '../src/lib/keyboard';
import { metricAccentClass, metricIconClass } from '../src/lib/metric-presentation';
import { PROFILE_TAB } from '../src/lib/profile-tab';
import { formatSessionImportTime, sessionSummary } from '../src/lib/saved-sessions';
import {
	buildSessionAnalyticsCache,
	SESSION_TREND_METRIC,
	sessionAnalyticsContribution,
} from '../src/lib/session-analytics';
import { SESSION_WORKFLOW_INTENT } from '../src/lib/session-workflow';
import { WORKOUT_DESCRIPTION_ATTRIBUTION } from '../src/lib/workout-description';
import { WORKOUT_ROUTE_TYPE } from '../src/lib/workout-schema';
import {
	WORKOUT_COURSES,
	workoutProfilePosition,
	workoutTerrainAtDistance,
} from '../src/lib/workouts';
import { createAppRouter } from '../src/router';
import type { StoredSession } from '../src/types';
import { savedSessionFixture } from './fixtures/saved-session';

const render = (element: React.ReactNode) => renderToStaticMarkup(element);
const renderApp = async (initialSession?: StoredSession) => {
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: ['/'] }),
		initialSession,
	});
	await router.load();
	return render(<RouterProvider router={router} />);
};
const enabledEndSessionButton = /<button(?![^>]*disabled)[^>]*>End session<\/button>/;
const gearProgressStyle = /style="width:([^"]+)"/;
const noCustomWorkoutIds = new Set<string>();

describe('view components', () => {
	test('renders known and fallback icons', () => {
		expect(render(<Icon name="heart" />)).toContain('<title>heart</title>');
		expect(render(<Icon name="move-vertical" />)).toContain('<title>move-vertical</title>');
		expect(render(<Icon name="unknown" />)).toContain('<title>unknown</title>');
	});

	test('renders a persistent deployment update notice', () => {
		const html = render(<VersionUpdateNotice onReload={() => undefined} />);
		expect(html).toContain('role="status"');
		expect(html).toContain('A new Ride Control version is available.');
		expect(html).toContain('Reload when convenient to use the latest version.');
		expect(html).toContain('>Reload now</button>');
	});

	test('renders the shared dropdown without native or rounded controls', () => {
		const html = render(
			<SelectMenu
				ariaLabel="Example dropdown"
				onChange={() => undefined}
				options={[
					{ label: 'First', value: 'first' },
					{ label: 'Second', value: 'second' },
				]}
				value="first"
			/>
		);
		expect(html).toContain('data-select-menu="true"');
		expect(html).toContain('aria-haspopup="listbox"');
		expect(html).toContain('role="listbox"');
		expect(html).toContain('data-select-menu-chevron="true"');
		expect(html).toContain('h-4 w-4 shrink-0');
		expect(html).not.toContain('<select');
		expect(html).not.toContain('rounded');

		const suggestionsHtml = render(
			<SuggestionInput
				ariaLabel="Example suggestions"
				className="field"
				customSuggestions={['Custom']}
				id="example-suggestions"
				maxLength={100}
				onBlur={() => undefined}
				onChange={() => undefined}
				onRemoveCustomSuggestion={() => undefined}
				placeholder="Choose or describe your own"
				suggestions={['First', 'Second']}
				value=""
			/>
		);
		expect(suggestionsHtml).toContain('data-suggestion-input="true"');
		expect(suggestionsHtml).toContain('aria-autocomplete="list"');
		expect(suggestionsHtml).toContain('autoComplete="off"');
		expect(suggestionsHtml).toContain('aria-label="Custom entries"');
		expect(suggestionsHtml).toContain('aria-label="Standard options"');
		expect(suggestionsHtml).toContain('Remove Custom from custom identities');
		expect(suggestionsHtml).not.toContain('<datalist');
		expect(suggestionsHtml).not.toContain('rounded');
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
		expect(html).toContain('min-w-0 bg-ink p-3 sm:p-4');
		expect(html).toContain('mt-3 flex items-baseline gap-2');
		expect(html).toContain('grid grid-cols-2 gap-3 border-t pt-3 text-yellow-400');
		expect(html).not.toContain('mt-2 h-px bg-yellow-400');
		expect(html).toContain('font-semibold text-4xl tracking-[-.045em]');
		expect(html).toContain('font-semibold text-2xl text-white tabular-nums tracking-tight');
		expect(html).toContain('>180</p>');
		expect(html).toContain('>300</p>');
		expect(html.match(/watts/g)).toHaveLength(1);
		expect(metricAccentClass('rose')).toBe('bg-rose-400');
		expect(metricAccentClass('other')).toBe('bg-mint');
		expect(metricIconClass('violet')).toBe('text-violet-400');
		expect(metricIconClass('other')).toBe('text-sky-400');
	});

	test('renders a synchronized focus point for linked line charts', () => {
		const html = render(
			<div className="h-28">
				<InteractiveLineChart
					ariaLabel="Linked metric"
					color="var(--metric-speed)"
					focusedX={10}
					height={112}
					maximum={20}
					minimum={0}
					rows={[
						{ key: '0', label: '0:00 · Speed: 10 mph', value: 10, x: 0 },
						{ key: '10', label: '0:10 · Speed: 15 mph', value: 15, x: 10 },
					]}
				/>
			</div>
		);
		expect(html).toContain('class="ts-chart__dot"');
		expect(html).toContain('data-ts-key="synchronized-focus');
		const liveHtml = render(
			<div className="h-28">
				<InteractiveLineChart
					ariaLabel="Live metric"
					color="var(--metric-speed)"
					focusedX={10}
					height={112}
					interactive={false}
					maximum={20}
					minimum={0}
					rows={[
						{ key: '0', label: '0:00 · Speed: 10 mph', value: 10, x: 0 },
						{ key: '10', label: '0:10 · Speed: 15 mph', value: 15, x: 10 },
					]}
				/>
			</div>
		);
		expect(liveHtml).not.toContain('class="ts-chart__dot"');
		expect(liveHtml).not.toContain('data-ts-key="synchronized-focus');
	});

	test('renders a compact session metric', () => {
		expect(render(<SmallMetric label="TIME" value="01:02:03" />)).toContain('01:02:03');
		const largeMetric = render(<SmallMetric label="TIME" large value="01:02:03" />);
		expect(largeMetric).toContain('flex h-full min-w-0 flex-col justify-center');
		expect(largeMetric).toContain(
			'text-xl sm:text-4xl lg:text-5xl xl:text-6xl min-[420px]:text-2xl'
		);
		const distance = render(<SmallMetric label="DISTANCE" large unit="mi" value="10.00" />);
		expect(distance).toContain('>10.00</span>');
		expect(distance).toContain('shrink-0 font-medium');
		expect(distance).toContain('text-xs sm:text-lg lg:text-xl');
		expect(distance).toContain('>mi</span>');
		const html = render(
			<SessionMetric
				accent="yellow"
				average="185"
				icon="bolt"
				label="POWER"
				maximum="300"
				unit="W"
			/>
		);
		expect(html).toContain('text-3xl');
		expect(html).toContain('bg-yellow-400');
		expect(html).toContain('<title>bolt</title>');
		expect(html.match(/>W<\/span>/g)).toHaveLength(1);
		expect(html).toContain('>AVG</span>');
		expect(html).not.toContain('>AVERAGE</span>');
		expect(html).toContain('MAX</strong>300');
		expect(html).toContain('pr-1 text-right text-slate-400');
		const heartRate = render(
			<SessionMetric
				accent="rose"
				average="113"
				icon="heart"
				label="HEART RATE"
				maximum="131"
				unit="bpm"
			/>
		);
		expect(heartRate).toContain(
			'whitespace-nowrap font-bold text-[9px] text-slate-500 tracking-widest'
		);
		expect(heartRate).toContain('h-4 w-4 shrink-0');
		const averageOnly = render(
			<SessionMetric
				accent="mint"
				average="42"
				icon="resistance"
				label="RESISTANCE"
				unit="%"
			/>
		);
		expect(averageOnly).toContain('text-mint');
		expect(averageOnly).not.toContain('MAX');
	});

	test('renders enabled and disabled resistance controls', () => {
		const enabled = render(
			<ResistanceControl
				disabled={false}
				keyboardFlash="increase"
				max={100}
				min={0}
				onChange={() => undefined}
				ramp={{ current: 35, from: 20, phase: 'ramping', progress: 0.4, to: 60 }}
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
				ramp={{ current: 20, from: 20, phase: 'holding', progress: 0, to: 20 }}
				step={1}
				value={20}
			/>
		);
		expect(enabled).toContain('aria-label="Resistance"');
		expect(enabled).toContain('value="20"');
		expect(enabled).toContain('class="resistance-slider w-full min-w-0 disabled:opacity-40"');
		expect(enabled).toContain('grid h-9 w-9 shrink-0 place-items-center rounded-lg');
		expect(enabled).toContain('data-ramp-active="true"');
		expect(enabled).toContain('data-ramp-progress="40"');
		expect(enabled).toContain('data-resistance-control="true"');
		expect(enabled).toContain('--ramp-progress:144deg');
		expect(enabled).toContain('--resistance-position:20%');
		expect(enabled).not.toContain('Ramping');
		expect(enabled).not.toContain('>20%<');
		expect(enabled).not.toContain('>60%<');
		expect(enabled).toContain('data-keyboard-flash="true"');
		expect(enabled).toContain('scale-105 border-mint bg-mint/15 text-mint');
		expect(disabled).toContain('data-ramp-progress="0"');
		expect(disabled).toContain('disabled');
		const queued = render(
			<ResistanceControl
				disabled={false}
				max={100}
				min={0}
				onChange={() => undefined}
				ramp={{ current: 20, from: 20, phase: 'queued', progress: 0, to: 60 }}
				step={1}
				value={60}
			/>
		);
		const settled = render(
			<ResistanceControl
				disabled={false}
				max={100}
				min={0}
				onChange={() => undefined}
				ramp={{ current: 60, from: 20, phase: 'settled', progress: 1, to: 60 }}
				step={1}
				value={60}
			/>
		);
		expect(queued).toContain('data-ramp-progress="0"');
		expect(settled).toContain('data-ramp-progress="100"');
		expect(queued).not.toContain('data-ramp-active');
		expect(settled).not.toContain('data-ramp-active');
		expect(queued).not.toContain('Queued');
		expect(settled).not.toContain('Settled');
	});

	test('renders connection, busy, and connected states', () => {
		const ready = render(
			<ConnectionControl
				busy={false}
				connected={false}
				onCancel={() => undefined}
				onConnect={() => undefined}
				onDisconnect={() => undefined}
				status="Ready"
			/>
		);
		expect(ready).toContain('Connect trainer');
		expect(ready).not.toContain('bg-ink/50');
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
		expect(busy).toContain('inline-flex h-10 items-center gap-2 px-1');
		expect(busy).not.toContain('bg-[#10151a]');
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
		expect(
			render(
				<ConnectionControl
					busy
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

	test('renders the multi-device pairing entry point and panel', () => {
		expect(
			render(
				<DevicePairingButton connectedCount={0} onClick={() => undefined} pairedCount={0} />
			)
		).toContain('Pair devices');
		expect(
			render(
				<DevicePairingButton connectedCount={2} onClick={() => undefined} pairedCount={3} />
			)
		).toContain('2/3');
		const connectingButton = render(
			<DevicePairingButton
				connectedCount={1}
				connecting
				onClick={() => undefined}
				pairedCount={3}
			/>
		);
		expect(connectingButton).toContain('aria-busy="true"');
		expect(connectingButton).toContain('connection-status-pulse bg-sky-300');
		expect(connectingButton).not.toContain('bg-sky-400/10');
		const connectedButton = render(
			<DevicePairingButton connectedCount={3} onClick={() => undefined} pairedCount={3} />
		);
		expect(connectedButton).toContain('bg-mint');
		expect(connectedButton).not.toContain('bg-sky-400');
		const common = {
			busy: false,
			connected: false,
			onCancel: () => undefined,
			onDisconnect: () => undefined,
			onForget: () => undefined,
			onPair: () => undefined,
			onReconnect: () => undefined,
			paired: false,
			phase: 'unpaired' as const,
			reconnecting: false,
			status: 'Not paired',
		};
		const panel = render(
			<DevicePairingPanel
				browserNotice=""
				click={{
					...common,
					busy: true,
					connectedCount: 0,
					connectionActive: true,
					controllers: [
						{
							active: true,
							activeShift: 'down',
							battery: 84,
							busy: true,
							connected: false,
							firmwareVersion: '1.2.0',
							id: 'plus-click',
							label: '+ Controller',
							paired: true,
							phase: 'reconnecting',
							reconnecting: true,
							role: 'up',
							status: 'Reconnecting…',
						},
					],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					paired: true,
					pairedCount: 1,
					phase: 'reconnecting',
					reconnecting: true,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={{ ...common, connected: true, name: 'KICKR CORE 2', paired: true }}
			/>
		);
		expect(panel).toContain('Paired devices');
		expect(panel).toContain('data-side-tray="true"');
		expect(panel).toContain('transition-opacity duration-200');
		expect(panel).toContain('transition-transform duration-200');
		expect(panel).toContain('translate-x-0');
		expect(panel).toContain('aria-label="Resize paired devices"');
		expect(panel).toContain('<hr aria-label="Resize paired devices"');
		expect(panel).toContain('cursor-col-resize');
		expect(panel).toContain('Smart trainer');
		expect(panel).toContain('Heart rate');
		expect(panel).toContain('Zwift Click V2');
		expect(panel.match(/data-device-actions="true"/g)).toHaveLength(3);
		expect(panel).not.toContain('Reconnecting…');
		expect(panel).not.toContain('Waiting for controllers…');
		expect(panel).not.toContain('Retry');
		expect(panel).toContain('Connecting...');
		expect(panel).toContain('>Stop connecting</button>');
		expect(panel).not.toContain('>Reconnect</button>');
		expect(panel.match(/<span class="sr-only">Connecting\.\.\.<\/span>/g)).toHaveLength(1);
		expect(panel.match(/connecting-dot/g)).toHaveLength(3);
		expect(panel.match(/connection-status-pulse/g)).toHaveLength(1);
		expect(panel).toContain('shadow-[0_0_16px_rgba(56,189,248,.95)]');
		expect(panel).toContain('Automatic reconnect in Chrome');
		expect(panel).toContain('Chrome needs persistent Bluetooth permissions');
		expect(panel).toContain('chrome://flags/#enable-web-bluetooth-new-permissions-backend');
		expect(panel).toContain('Copy Chrome Bluetooth settings address');
		expect(panel).toContain('Use the new permissions backend for Web Bluetooth');
		expect(panel).toContain('Relaunch Chrome, then pair each device once more.');
		expect(panel).not.toContain('github.com/RideControlOrg/RideControl#automatic-reconnect');
		expect(panel).toContain('+ Controller');
		expect(panel).not.toContain('− Controller');
		expect(panel).toContain('aria-label="− shift pressed"');
		expect(panel).toContain('>−</output>');
		expect(panel).toContain('grid h-5 w-5 shrink-0');
		expect(panel).toContain('Firmware 1.2.0 · 84% battery');
		expect(panel).not.toContain('Use firmware 1.2.0');
		expect(panel).not.toContain(
			'https://support.zwift.com/updating-your-zwift-click-firmware-B1IdjkGW6'
		);
		expect(panel).toContain('connection-status-pulse');
		expect(panel).not.toContain('border-line border-b');
		expect(panel).not.toContain('bg-mint/10');
		expect(panel).not.toContain('shadow-[inset_0_0_18px');
		expect(panel).not.toContain('divide-y');
		const pairingPanel = render(
			<DevicePairingPanel
				browserNotice=""
				click={{
					...common,
					connectedCount: 0,
					connectionActive: true,
					controllers: [],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					pairedCount: 0,
					reconnecting: false,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={{
					...common,
					busy: true,
					phase: 'pairing',
					status: 'Pairing…',
				}}
			/>
		);
		expect(pairingPanel).toContain('>Cancel pairing</button>');
		expect(pairingPanel).not.toContain('disabled=""');
		const inactiveClickPanel = render(
			<DevicePairingPanel
				browserNotice=""
				click={{
					...common,
					connectedCount: 0,
					connectionActive: false,
					controllers: [
						{
							active: false,
							busy: false,
							connected: false,
							firmwareVersion: '1.1.0',
							id: 'saved-plus-click',
							label: '+ Controller',
							paired: true,
							phase: 'offline',
							reconnecting: false,
							role: 'up',
							status: 'Paired · offline',
						},
					],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					paired: true,
					pairedCount: 1,
					phase: 'offline',
					reconnecting: false,
					status: 'Paired · offline',
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={common}
			/>
		);
		expect(inactiveClickPanel).toContain('Reconnects when the session resumes');
		expect(inactiveClickPanel).not.toContain('>Reconnect</button>');
		expect(inactiveClickPanel).toContain('blue Y button shifts down');
		expect(inactiveClickPanel).toContain(
			'Use firmware 1.2.0. Update it in the Zwift Companion app under Equipment → Zwift Click →'
		);
		expect(inactiveClickPanel).toContain('>Update Firmware</a>.');
		expect(inactiveClickPanel).not.toContain('Zwift firmware instructions');
		expect(inactiveClickPanel).toContain(
			'https://support.zwift.com/updating-your-zwift-click-firmware-B1IdjkGW6'
		);
		expect(inactiveClickPanel.match(/>Pair<\/button>/g)).toHaveLength(2);
		const configuredPanel = render(
			<DevicePairingPanel
				automaticReconnectConfigured
				browserNotice=""
				click={{
					...common,
					connectedCount: 0,
					connectionActive: true,
					controllers: [],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					pairedCount: 0,
					reconnecting: false,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={common}
			/>
		);
		expect(configuredPanel).toContain('Automatic reconnect is configured correctly');
		expect(configuredPanel).not.toContain(CHROME_BLUETOOTH_FLAGS_URL);
		expect(configuredPanel).not.toContain('Use the new permissions backend for Web Bluetooth');
		const unsupportedPanel = render(
			<DevicePairingPanel
				browserNotice="Bluetooth does not work in Brave. Chrome is currently the only browser tested with Ride Control."
				click={{
					...common,
					connectedCount: 0,
					connectionActive: true,
					controllers: [],
					onForgetController: () => undefined,
					onPairController: () => undefined,
					pairedCount: 0,
					reconnecting: false,
				}}
				heartRate={common}
				onClose={() => undefined}
				open
				trainer={common}
			/>
		);
		expect(unsupportedPanel).toContain('Bluetooth does not work in Brave');
		expect(unsupportedPanel).not.toContain('Automatic reconnect in Chrome');
		expect(unsupportedPanel).not.toContain(
			'chrome://flags/#enable-web-bluetooth-new-permissions-backend'
		);
		expect(unsupportedPanel).not.toContain('Smart trainer');
		expect(unsupportedPanel).not.toContain('Heart rate');
		expect(unsupportedPanel).not.toContain('Zwift Click V2');
	});

	test('renders a focused 1–24 gear control', () => {
		const html = render(
			<GearControl
				disabled={false}
				gear={12}
				maximumGear={24}
				onChange={() => undefined}
				shiftFlash="increase"
			/>
		);
		expect(html).toContain('data-gear-control="true"');
		expect(html).toContain('Shift to an easier gear');
		expect(html).toContain('Shift to a harder gear');
		expect(html).toContain('EASIER');
		expect(html).toContain('HARDER');
		expect(html).toContain('grid h-9 w-9 shrink-0 place-items-center rounded-lg');
		expect(html).toContain('scale-105 border-mint bg-mint/15 text-mint');
		expect(html).not.toContain('Connect the trainer before shifting gears.');
		const disabled = render(
			<GearControl disabled gear={12} maximumGear={24} onChange={() => undefined} />
		);
		expect(disabled).not.toContain('Connect the trainer before shifting gears.');
		expect(disabled.match(/disabled=""/g)).toHaveLength(2);

		const firstGear = render(
			<GearControl disabled={false} gear={1} maximumGear={24} onChange={() => undefined} />
		);
		const secondGear = render(
			<GearControl disabled={false} gear={2} maximumGear={24} onChange={() => undefined} />
		);
		const lastGear = render(
			<GearControl disabled={false} gear={24} maximumGear={24} onChange={() => undefined} />
		);
		const firstGearProgress = firstGear.match(gearProgressStyle)?.[1];
		const secondGearProgress = secondGear.match(gearProgressStyle)?.[1];
		const lastGearProgress = lastGear.match(gearProgressStyle)?.[1];
		expect(Number.parseFloat(firstGearProgress ?? '0')).toBeGreaterThan(0);
		expect(Number.parseFloat(secondGearProgress ?? '0')).toBeGreaterThan(
			Number.parseFloat(firstGearProgress ?? '0')
		);
		expect(lastGearProgress).toBe('100%');
	});

	test('renders only the selected training control mode', () => {
		const gear = render(
			<TrainingControl
				connected
				control={{
					drivetrain: DEFAULT_VIRTUAL_DRIVETRAIN,
					gear: 12,
					maximumGear: 24,
					mode: 'gear',
					onShift: () => undefined,
				}}
			/>
		);
		expect(gear).toContain('Virtual shifting');
		expect(gear).toContain('of 24');
		expect(gear).toContain('39/15 · 2.60:1 · 1.00× load');
		expect(gear).not.toContain('to shift');
		expect(gear).not.toContain('Resistance control');

		const resistance = render(
			<TrainingControl
				connected
				control={{
					mode: 'resistance',
					onChange: () => undefined,
					ramp: { current: 40, from: 40, phase: 'holding', progress: 0, to: 40 },
					resistance: 40,
				}}
			/>
		);
		expect(resistance).toContain('Resistance control');
		expect(resistance).not.toContain('Virtual shifting');
	});

	test('renders terrain workout selection, progress, and automatic resistance', () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const panel = render(
			<WorkoutPanel
				courses={WORKOUT_COURSES}
				customCourseIds={noCustomWorkoutIds}
				focusedCourseId={course.id}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => course}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(panel).toContain('Terrain workouts');
		expect(panel).toContain('data-focused="true"');
		expect(panel).toContain(`id="workout-${course.id}"`);
		expect(panel).toContain('Harbor Ring');
		expect(panel).toContain('Prairie Roll');
		expect(panel).toContain('Cedar Circuit');
		expect(panel).toContain('Highland Loop');
		expect(panel).toContain('Granite Switchbacks');
		expect(panel).toContain('Ridgeline Time Trial');
		expect(panel).toContain('Harbor Ring course map');
		expect(panel).toContain('Harbor Ring elevation profile');
		expect(panel).toContain('Import GPX');
		expect(panel).toContain('Browse routes');
		expect(panel).toContain('Choose a public route or import GPX');
		expect(panel).toContain('data-gpx-drop-target="true"');
		expect(panel).toContain('data-testid="workout-list"');
		expect(panel).toContain('data-testid="workout-search-bar"');
		expect(panel).toContain('focus-within:border-cyan-400/70');
		expect(panel).toContain('placeholder="Search by name, difficulty, or distance"');
		expect(panel).not.toContain('data-testid="workout-status"');
		expect(panel).not.toContain('Ride without a workout');
		expect(panel).not.toContain(
			'Choose a workout for your next session, then start it when you are ready.'
		);
		expect(panel.match(/Download GPX/g)).toHaveLength(6);
		expect(panel).toContain('10.0 mi out &amp; back');
		expect(panel).toContain('15.0 mi loop');
		expect(panel).toContain('repeated gradual climbs and descents');
		expect(panel).toContain('49 ft climbing');
		expect(panel).not.toContain('15 m climbing');
		expect(panel).toContain('stroke="#64748b"');
		expect(panel).not.toContain('bg-lime text-ink');
		expect(panel).not.toContain('aria-label="Rename Harbor Ring"');
		expect(panel).toContain('aria-label="Drag Harbor Ring to reorder"');
		expect(panel).toContain('<title>Move workout up or down</title>');
		expect(panel).toContain('absolute top-3 right-3');
		expect(panel).not.toContain('draggable="true"');
		expect(panel.match(/aria-label="Drag [^"]+ to reorder"/g)).toHaveLength(6);
		expect(panel.match(/data-workout-drop-index=/g)).toHaveLength(7);
		expect(panel).not.toContain('bg-cyan-400/20');
		expect(panel).not.toContain('shadow-[0_0_10px_rgba(103,232,249,.8)]');
		expect(panel).not.toContain('Move dragged workout to');
		expect(panel).not.toContain('ring-2 ring-cyan-400/70');
		expect(panel).not.toContain('View map');
		expect(panel).toContain('data-side-tray="true"');
		const importedCourse = {
			...course,
			description: 'Australia · Bright → Near Hotham Heights — 26 km',
			descriptionAttribution: WORKOUT_DESCRIPTION_ATTRIBUTION.OPENSTREETMAP,
			id: 'imported-course',
			name: 'Imported course',
			routeType: WORKOUT_ROUTE_TYPE.POINT_TO_POINT,
			startingLocation: 'Ålands Countryside',
		};
		const customPanel = render(
			<WorkoutPanel
				courses={[...WORKOUT_COURSES, importedCourse]}
				customCourseIds={new Set([importedCourse.id])}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => importedCourse}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(customPanel).toContain('Imported course');
		expect(customPanel).toContain('Australia · Bright → Near Hotham Heights');
		expect(customPanel).not.toContain('Near Hotham Heights —');
		expect(customPanel).toContain('title="View the route map"');
		expect(customPanel).toContain('target="_blank"');
		expect(customPanel).toContain('© OpenStreetMap contributors');
		expect(customPanel.indexOf('© OpenStreetMap contributors')).toBeGreaterThan(
			customPanel.indexOf('point to point')
		);
		expect(customPanel).toContain('aria-label="Rename Imported course"');
		expect(customPanel).toContain('title="Rename imported workout"');
		expect(customPanel).toContain('Imported');
		expect(customPanel).toContain('point to point');
		expect(customPanel).not.toContain('?workout-map=');
		expect(customPanel).not.toContain('View map');
		expect(customPanel).toContain('Remove');
		expect(customPanel.match(/Download GPX/g)).toHaveLength(7);
		const closedRemoveDialog = render(
			<RemoveWorkoutDialog
				courseName={importedCourse.name}
				onCancel={() => undefined}
				onConfirm={() => undefined}
				open={false}
			/>
		);
		expect(closedRemoveDialog).toBe('');
		const removeDialog = render(
			<RemoveWorkoutDialog
				courseName={importedCourse.name}
				onCancel={() => undefined}
				onConfirm={() => undefined}
				open
			/>
		);
		expect(removeDialog).toContain('role="alertdialog"');
		expect(removeDialog).toContain('Remove this workout?');
		expect(removeDialog).toContain(importedCourse.name);
		expect(removeDialog).toContain('Cancel workout removal');
		expect(removeDialog).toContain('Remove workout');
		const renameDialog = render(
			<RenameWorkoutDialog
				course={importedCourse}
				onClose={() => undefined}
				onRename={() => undefined}
			/>
		);
		expect(renameDialog).toContain('Rename workout');
		expect(renameDialog).not.toContain('IMPORTED GPX');
		expect(renameDialog).not.toContain(
			'The route and its duplicate-detection identifier will stay the same.'
		);
		expect(renameDialog).toContain('value="Imported course"');
		expect(renameDialog).toContain('Save name');
		const lockedPanel = render(
			<WorkoutPanel
				activeCourse={course}
				courses={WORKOUT_COURSES}
				customCourseIds={noCustomWorkoutIds}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => course}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked
				speedUnit="mph"
			/>
		);
		expect(lockedPanel).toContain('placeholder="Search by name, difficulty, or distance"');
		expect(lockedPanel.match(/disabled=""/g)).toHaveLength(6);
		expect(lockedPanel).not.toContain('Clear selected workout');
		const selectedPanel = render(
			<WorkoutPanel
				activeCourse={course}
				courses={WORKOUT_COURSES}
				customCourseIds={noCustomWorkoutIds}
				onClose={() => undefined}
				onImportCourse={() => Promise.reject(new Error('Not used in this render test'))}
				onImportFile={() => Promise.reject(new Error('Not used in this render test'))}
				onRemoveCourse={() => undefined}
				onRenameCourse={() => course}
				onReorderCourse={() => undefined}
				onSelect={() => undefined}
				open
				selectionLocked={false}
				speedUnit="mph"
			/>
		);
		expect(selectedPanel).toContain('Clear selected workout');
		expect(selectedPanel).toContain('Deselect workout');
		expect(selectedPanel).not.toContain('Ride without a workout');

		const terrain = workoutTerrainAtDistance(course, course.distance * 2 + 2);
		const progress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding
				speedUnit="mph"
				terrain={terrain}
				variant="session"
				workout={{ course }}
			/>
		);
		expect(progress).not.toContain('Terrain workout');
		expect(progress).not.toContain('Current lap');
		expect(progress).not.toContain('<header');
		expect(progress).toContain('Laps');
		expect(progress).toContain('aria-label="2 laps completed"');
		expect(progress).toContain(`aria-label="${course.name} course map"`);
		expect(progress).toContain('Distance');
		expect(progress).toContain('1.24 / 3.98');
		expect(progress).toContain('>mi<');
		expect(progress).not.toContain('<h3');
		expect(progress).toContain('Course climb');
		expect(progress).toContain('>49<');
		expect(progress).toContain('Climbed');
		expect(progress).toContain('>98<');
		expect(progress).toContain('Downhill');
		expect(progress).toContain('>39<');
		expect(progress).toContain('>ft<');
		expect(progress).toContain('Progress');
		expect(progress).toContain(`>${Math.round(terrain.progress * 100)}<`);
		expect(progress).toContain('>%<');
		expect(progress).toContain('Grade');
		expect(progress).toContain(formatGradeValue(terrain.grade));
		expect(progress).toContain('style="color:var(--metric-grade)"');
		expect(progress).not.toContain('Resistance');
		expect(progress).not.toContain('style="color:var(--metric-resistance)"');
		expect(progress).not.toContain('sm:text-4xl');
		expect(progress.match(/sm:text-2xl/g)).toHaveLength(7);
		expect(progress).toContain('workout-map-pane flex flex-col');
		expect(progress).toContain('workout-map-summary grid workout-map-summary-session');
		expect(progress).toContain('mt-3 overflow-hidden bg-transparent');
		expect(progress).not.toContain('bg-[#12171d]');
		expect(progress).not.toContain('bg-panel');
		expect(progress).not.toContain('mt-3 min-h-16');
		expect(progress).toContain('grid-cols-2');
		expect(progress).toContain('grid-cols-3');
		expect(progress).toContain('workout-distance-laps-stats');
		expect(progress.match(/text-\[9px\]/g)).toHaveLength(7);
		expect(progress.match(/px-3 pt-3 pb-1\.5 sm:px-5 sm:pt-5 sm:pb-2/g)).toHaveLength(2);
		expect(progress).toContain('mt-1 h-36 sm:h-44');
		expect(progress).toContain('mt-auto h-36 sm:h-44');
		expect(progress).not.toContain('Ridden this lap');
		expect(progress.match(/functional-status-pulse/g)).toHaveLength(2);
		expect(progress).toContain('data-profile-marker="true"');
		expect(progress).not.toContain('rgba(173, 245, 189, .2)');
		expect(progress.match(/data-route-progress="true"/g)).toHaveLength(2);
		expect(progress).not.toContain('stroke-dasharray');
		expect(progress).not.toContain('Terrain resistance');
		const previewTerrain = workoutTerrainAtDistance(course, course.distance * 0.4);
		const previewProfilePosition = workoutProfilePosition(course, previewTerrain);
		const previewProgress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding={false}
				previewTerrain={previewTerrain}
				speedUnit="mph"
				terrain={terrain}
				variant="session"
				workout={{ course }}
			/>
		);
		expect(previewProgress).toContain(`cx="${previewTerrain.x}"`);
		expect(previewProgress).toContain(
			`left:clamp(0.5rem, ${previewProfilePosition.x}%, calc(100% - 0.5rem))`
		);
		expect(previewProgress).toContain(
			`top:clamp(0.5rem, ${previewProfilePosition.y}%, calc(100% - 0.5rem))`
		);
		expect(previewProgress).toContain(`>${Math.round(terrain.progress * 100)}<`);
		const dashboardProgress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding
				speedUnit="mph"
				targetResistance={42.4}
				terrain={terrain}
				workout={{ course }}
			/>
		);
		expect(dashboardProgress).toContain('Resistance');
		expect(dashboardProgress).toContain('>42<');
		expect(dashboardProgress).toContain('style="color:var(--metric-resistance)"');
		expect(dashboardProgress.match(/sm:text-4xl/g)).toHaveLength(8);
		expect(
			dashboardProgress.match(/grid w-full gap-2 text-center tabular-nums lg:gap-5/g)
		).toHaveLength(3);
		expect(dashboardProgress).toContain('workout-distance-laps-stats');
		expect(dashboardProgress).toContain(
			'workout-map-summary grid workout-map-summary-dashboard'
		);
		expect(dashboardProgress).toContain('mt-3 overflow-hidden bg-ink');
		expect(dashboardProgress).not.toContain('mt-3 min-h-16');
		expect(dashboardProgress).not.toContain('flex min-h-14 flex-wrap');
		const metricProgress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding={false}
				speedUnit="kmh"
				terrain={terrain}
				workout={{ course }}
			/>
		);
		expect(metricProgress).toContain('>15<');
		expect(metricProgress).toContain('>30<');
		expect(metricProgress).toContain('>12<');
		expect(metricProgress).toContain('>m<');
		expect(metricProgress).not.toContain('functional-status-pulse');
		const pointToPointProgress = render(
			<WorkoutProgress
				elevationTotals={{ ascent: 30, descent: 12 }}
				isRiding={false}
				speedUnit="mph"
				terrain={terrain}
				workout={{ course: importedCourse }}
			/>
		);
		expect(pointToPointProgress).toContain('Laps');
		expect(pointToPointProgress).not.toContain('Ridden this route');
		expect(pointToPointProgress).toContain('aria-label="2 laps completed"');
	});

	test('hides empty notifications and expands setup guidance', () => {
		expect(
			render(<Notification connected={false} notice="" onDismiss={() => undefined} />)
		).toBe('');
		const notice = render(
			<Notification connected notice="Trainer connected." onDismiss={() => undefined} />
		);
		expect(notice).toContain('flex items-center gap-3');
		expect(notice).toContain('role="timer"');
		expect(notice).toContain('15 seconds remaining');
		const html = render(
			<Notification
				connected={false}
				notice={CHROME_BLUETOOTH_PERMISSION_MESSAGE}
				onDismiss={() => undefined}
			/>
		);
		expect(html).toContain('15 seconds remaining');
		expect(html).toContain('persistent Bluetooth permissions');
		expect(html).toContain('chrome://flags/');
	});

	test('composes the application dashboard', async () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: () => null,
				removeItem: () => undefined,
				setItem: () => undefined,
			},
		});
		const html = await renderApp();
		expect(html).toContain('Resistance control');
		expect(html).not.toContain('Import GPX');
		expect(html).toContain('Pair devices');
		expect(html).toContain('Sessions');
		expect(html).toContain('Show keyboard controls');
		expect(html).toContain('Ride Control');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl"');
		expect(html).toContain('href="https://github.com/sponsors/lookfirst"');
		expect(html).toContain('href="mailto:hello@ridecontrol.xyz"');
		expect(html).toContain('>Contact</a>');
		expect(html).toContain('>Privacy</button>');
		expect(html).toContain('>Terms</button>');
		expect(html).toContain('>Version</button>');
		expect(html).toContain('Sponsor');
		expect(html.indexOf('href="https://github.com/sponsors/lookfirst"')).toBeLessThan(
			html.indexOf('href="mailto:hello@ridecontrol.xyz"')
		);
		expect(html).not.toContain('WELCOME TO');
		expect(html).toContain('show again');
		expect(html).toContain('border-line border-t');
		expect(html).toContain('text-slate-500 text-xs');
		expect(html).toContain('type="button">Ride Control</button>');
		expect(html).toContain('type="button">Profile</button>');
		expect(html.indexOf('type="button">Sessions</button>')).toBeLessThan(
			html.indexOf('type="button">Profile</button>')
		);
		expect(html.indexOf('type="button">Profile</button>')).toBeLessThan(
			html.indexOf('aria-label="Show keyboard controls"')
		);
		expect(html.slice(html.indexOf('<footer')).includes('>Profile</button>')).toBeFalse();
		expect(html).toContain('mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-3 py-3');
		expect(html).toContain('mb-3 flex flex-wrap items-center justify-between gap-2');
		expect(html).toContain('mt-3 grid min-w-0 gap-3 *:min-w-0');
		expect(html).toContain('pb-[max(0.75rem,env(safe-area-inset-bottom))]');
		expect(html).not.toContain('fixed right-4 bottom-3 left-4');
		expect(html).toContain('grid gap-px bg-line min-[1120px]:grid-cols-4');
		expect(html).toContain(
			'dashboard-primary-metrics grid grid-cols-2 gap-px bg-line sm:grid-cols-4'
		);
		expect(html).toContain('dashboard-session-summary grid min-w-0 grid-cols-3 gap-px bg-line');
		expect(html).not.toContain('xl:grid-cols-[1.45fr_.55fr]');
		expect(html).toContain('aria-label="Use light mode"');
		expect(html).not.toContain('>Metric</button>');
		expect(html).not.toContain('>Imperial</button>');
		expect(html).not.toContain('Your ride data is safe and has been restored');
		expect(html).toMatch(enabledEndSessionButton);
	});

	test('scales dashboard elevation to the complete previewed route', async () => {
		const [completedCourse, plannedCourseSource] = WORKOUT_COURSES;
		if (!(completedCourse && plannedCourseSource)) {
			throw new Error('Expected built-in workout courses');
		}
		const finalPointIndex = plannedCourseSource.points.length - 1;
		const plannedCourse = {
			...plannedCourseSource,
			elevationGain: 400,
			id: 'planned-elevation-scale',
			name: 'Planned elevation scale',
			points: plannedCourseSource.points.map((point, index) => ({
				...point,
				elevation: index === finalPointIndex ? 400 : 0,
			})),
		};
		const html = await renderApp({
			...emptySession,
			ended: true,
			plannedWorkout: { course: plannedCourse },
			workout: { course: completedCourse },
		});
		const elevationChartIndex = html.indexOf('aria-label="Elevation over time"');
		expect(elevationChartIndex).toBeGreaterThan(0);
		expect(html.slice(Math.max(0, elevationChartIndex - 1200), elevationChartIndex)).toContain(
			'>1312 ft</span>'
		);
	});

	test('explains active session recovery after a reload', async () => {
		const notice = render(<SessionRecoveryNotice onDismiss={() => undefined} />);
		expect(notice).toContain('Your ride data is safe and has been restored');
		expect(notice).toContain('wait for your devices to reconnect before continuing');
		expect(notice).toContain('aria-label="Dismiss restored session notice"');
		expect(
			sessionRecoveryConnectionsReady({
				clickConnectedCount: 0,
				clickPairedCount: 1,
				heartRateConnected: true,
				heartRatePaired: true,
				rememberedDevicesFailed: false,
				rememberedDevicesLoaded: true,
				rememberedDevicesSupported: true,
				trainerConnected: true,
			})
		).toBeFalse();
		expect(
			sessionRecoveryConnectionsReady({
				clickConnectedCount: 1,
				clickPairedCount: 1,
				heartRateConnected: true,
				heartRatePaired: true,
				rememberedDevicesFailed: false,
				rememberedDevicesLoaded: true,
				rememberedDevicesSupported: true,
				trainerConnected: true,
			})
		).toBeTrue();

		const html = await renderApp({
			...emptySession,
			elapsedSeconds: 60,
		});
		expect(html).toContain('Your ride data is safe and has been restored');
	});

	test('renders version details in an accessible dialog', () => {
		expect(render(<BuildDetailsDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(
			<BuildDetailsDialog
				onClose={() => undefined}
				open
				pullRequests={[
					{
						mergedAt: '2026-07-22T19:30:00Z',
						number: 42,
						title: 'Improve production build details',
						url: 'https://github.com/RideControlOrg/RideControl/pull/42',
					},
				]}
			/>
		);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('Version details');
		expect(html).not.toContain('Current build');
		expect(html).not.toContain(
			'These details identify the frontend bundle currently running in your browser.'
		);
		expect(html).toContain('Build ID');
		expect(html).toContain('UTC timestamp');
		expect(html).toContain('View source build on GitHub');
		expect(html).toContain('Recent changes');
		expect(html).toContain('Latest merged PR');
		expect(html).toContain('Improve production build details');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl/pull/42"');
		expect(html).toContain('<time dateTime="2026-07-22T19:30:00Z">');
		expect(html).toContain(
			'href="https://github.com/RideControlOrg/RideControl/pulls?q=is%3Apr+is%3Aclosed"'
		);
		expect(html).toContain('aria-label="Close version details"');
		expect(
			render(<BuildDetailsDialog onClose={() => undefined} open pullRequests={[]} />)
		).toContain('Recent pull requests are included in production builds.');
	});

	test('renders the privacy policy in an accessible dialog', () => {
		expect(render(<PrivacyPolicyDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<PrivacyPolicyDialog onClose={() => undefined} open />);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('Privacy Policy');
		expect(html).toContain('Effective July 23, 2026');
		expect(html).toContain('Ride Control does not create an account');
		expect(html).toContain('does not use advertising or behavioral analytics cookies');
		expect(html).toContain('Future premium cloud storage');
		expect(html).toContain('optional paid premium features');
		expect(html).toContain('We will expand this policy before they launch');
		expect(html).toContain('href="mailto:hello@ridecontrol.xyz"');
		expect(html).toContain('aria-label="Close privacy policy"');
	});

	test('renders the terms of service in an accessible dialog', () => {
		expect(render(<TermsOfServiceDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<TermsOfServiceDialog onClose={() => undefined} open />);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('Terms of Service');
		expect(html).toContain('Effective July 23, 2026');
		expect(html).toContain('Ride Control does not provide medical advice');
		expect(html).toContain('Bluetooth devices, trainers, sensors, and browsers vary');
		expect(html).toContain('href="mailto:hello@ridecontrol.xyz"');
		expect(html).toContain('frontend source code is available on GitHub');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl"');
		expect(html).toContain('The backend component is closed source');
		expect(html).toContain('optional paid additions');
		expect(html).toContain('Future premium services');
		expect(html).toContain('storing and synchronizing your data in the cloud');
		expect(html).toContain('We will expand these terms before they launch');
		expect(html).toContain('aria-label="Close terms of service"');
	});

	test('renders an inclusive local profile editor', () => {
		const profile = {
			activeBikeId: 'road-bike',
			bikes: [
				{
					frontChainringTeeth: [53, 39],
					id: 'road-bike',
					image: new Blob(['bike'], { type: 'image/webp' }),
					name: 'Road bike',
					rearCassetteTeeth: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24],
					weightKg: 9,
				},
				{
					frontChainringTeeth: [46, 30],
					id: 'gravel-bike',
					name: 'Gravel bike',
					rearCassetteTeeth: [11, 13, 15, 17, 19, 21, 24, 28, 32, 36, 40, 44],
					weightKg: 11,
				},
			],
			identity: '',
			identityHistory: ['Smurf'],
			image: new Blob(['profile'], { type: 'image/webp' }),
			name: 'Riley',
			riderWeightKg: 75,
			weightHistory: [
				{ recordedAt: Date.UTC(2026, 5, 1), weightKg: 76 },
				{ recordedAt: Date.UTC(2026, 6, 1), weightKg: 75 },
			],
		};
		expect(
			render(
				<ProfilePanel
					onClose={() => undefined}
					onSave={async () => undefined}
					onSelectSpeedUnit={() => undefined}
					onSelectTab={() => undefined}
					open={false}
					physicsSettingsLocked={false}
					profile={profile}
					speedUnit="mph"
					storageError=""
				/>
			)
		).toBe('');
		const html = render(
			<ProfilePanel
				onClose={() => undefined}
				onSave={async () => undefined}
				onSelectSpeedUnit={() => undefined}
				onSelectTab={() => undefined}
				open
				physicsSettingsLocked={false}
				profile={profile}
				speedUnit="mph"
				storageError=""
			/>
		);
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('data-side-tray="true"');
		expect(html).toContain('id="profile-title">Profile</h2>');
		expect(html).toContain('flex min-w-0 items-baseline gap-3');
		expect(html).toContain('truncate text-slate-400 text-sm');
		expect(html).toContain('aria-label="Profile sections"');
		expect(html).toContain(
			'scrollbar-hidden flex shrink-0 items-end gap-6 overflow-x-auto overflow-y-hidden'
		);
		expect(html.match(/role="tab"/g)).toHaveLength(2);
		expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
		expect(html).toContain('aria-controls="profile-panel-personal"');
		expect(html).toContain('id="profile-tab-personal"');
		expect(html).toContain('id="profile-panel-personal"');
		expect(html).toContain('aria-controls="profile-panel-bikes"');
		expect(html).toContain('id="profile-tab-bikes"');
		expect(html).toContain('id="profile-panel-bikes"');
		expect(html).toContain('>Personal details<span');
		expect(html).toContain('hidden=""');
		expect(html.match(/Change image/g)).toHaveLength(2);
		expect(html.match(/<title>upload<\/title>/g)).toHaveLength(2);
		expect(html.match(/<title>trash<\/title>/g)).toHaveLength(2);
		expect(html.match(/aria-controls="remove-image-dialog"/g)).toHaveLength(2);
		expect(html).not.toContain('Resized and compressed in this browser before storage.');
		expect(html).toContain('Sex or gender identity');
		expect(html).toContain('>Non-binary</button>');
		expect(html).toContain('>Two-Spirit</button>');
		expect(html).toContain('>Smurf</button>');
		expect(html).toContain('aria-label="Custom entries"');
		expect(html).toContain('Remove Smurf from custom identities');
		expect(html).toContain('data-suggestion-input="true"');
		expect(html).not.toContain('<datalist');
		expect(html).toContain('Display units');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('>Metric</button>');
		expect(html).toContain('>Imperial</button>');
		expect(html).not.toContain('class="rounded px-3 py-1');
		expect(html).toContain('Your weight (lb)');
		expect(html).toContain('Weight history');
		expect(html).toContain('data-weight-history="true"');
		expect(html).not.toContain('rider-weight-calendar');
		expect(html).not.toContain('Previous weight month');
		expect(html).toContain('data-weight-chart-size="compact"');
		expect(html).toContain('data-weight-plot="true"');
		expect(html).not.toContain('bg-slate-950/25');
		expect(html).toContain('class="ts-chart__line"');
		expect(html).toContain('class="ts-chart__area"');
		expect(html).toContain('viewBox="0 0 640 112"');
		expect(html).toContain('Hover over the plot or use the arrow keys');
		expect(html).toContain('Change');
		expect(html).toContain('−2.2');
		expect(html).not.toContain('Each saved weight change is recorded locally.');
		expect(html).toContain('165.3');
		expect(html).toContain('Bikes');
		expect(html).toContain('Road bike');
		expect(html).toContain('Gravel bike');
		expect(html).toContain('Active bike settings');
		expect(html).toContain('id="profile-bike-image"');
		expect(html).toContain('Manufacturer');
		expect(html).toContain('id="profile-bike-manufacturer"');
		expect(html).toContain('Model');
		expect(html).toContain('id="profile-bike-model"');
		expect(html).toContain('Color');
		expect(html).toContain('id="profile-bike-color"');
		expect(html).toContain('Purchase date');
		expect(html).toContain('id="profile-bike-purchased-on"');
		expect(html).toContain('type="date"');
		expect(html).toContain('Bike weight (lb)');
		expect(html).toContain('value="53/39"');
		expect(html).toContain('Use one value for a 1× setup, such as 42');
		expect(html).toContain('including an 11- or 12-speed cassette');
		expect(html).toContain('This 2×12 setup creates 24 virtual gears');
		expect(html).toContain('aria-controls="remove-bike-dialog"');
		expect(html).toContain('aria-haspopup="dialog"');
		expect(html).toContain(
			'Your profile stays on device. In the future we will offer cloud storage and sync, as a premium feature.'
		);
		expect(html).toContain('aria-label="Close profile"');
		const bikesHtml = render(
			<ProfilePanel
				onClose={() => undefined}
				onSave={async () => undefined}
				onSelectSpeedUnit={() => undefined}
				onSelectTab={() => undefined}
				open
				physicsSettingsLocked={false}
				profile={profile}
				requestedTab={PROFILE_TAB.BIKES}
				speedUnit="mph"
				storageError=""
			/>
		);
		expect(bikesHtml).toContain('aria-controls="profile-panel-bikes" aria-selected="true"');
		expect(bikesHtml).toContain('aria-labelledby="profile-tab-personal" hidden=""');
		expect(bikesHtml).toContain('aria-labelledby="profile-tab-bikes" id="profile-panel-bikes"');
		expect(bikesHtml).not.toContain('Your profile stays on device');
		expect(bikesHtml).not.toContain('data-profile-guidance');
		const lockedHtml = render(
			<ProfilePanel
				onClose={() => undefined}
				onSave={async () => undefined}
				onSelectSpeedUnit={() => undefined}
				onSelectTab={() => undefined}
				open
				physicsSettingsLocked
				profile={profile}
				speedUnit="mph"
				storageError=""
			/>
		);
		expect(lockedHtml).toContain('data-profile-guidance="personal"');
		expect(lockedHtml).toContain('Rider weight is locked while a ride is active');
		expect(lockedHtml).not.toContain('The active bike, bike weight, and drivetrain are locked');
		expect(lockedHtml).toContain(
			'In the future we will offer cloud storage and sync, as a premium feature.'
		);
		expect(lockedHtml).toContain('id="profile-rider-weight"');
		expect(lockedHtml).toContain('disabled=""');
		const lockedBikesHtml = render(
			<ProfilePanel
				onClose={() => undefined}
				onSave={async () => undefined}
				onSelectSpeedUnit={() => undefined}
				onSelectTab={() => undefined}
				open
				physicsSettingsLocked
				profile={profile}
				requestedTab={PROFILE_TAB.BIKES}
				speedUnit="mph"
				storageError=""
			/>
		);
		expect(lockedBikesHtml).toContain('data-profile-guidance="bikes"');
		expect(lockedBikesHtml).toContain(
			'The active bike, bike weight, and drivetrain are locked while a ride is active'
		);
		expect(lockedBikesHtml).not.toContain('Rider weight is locked');
		expect(lockedBikesHtml).not.toContain('Your profile stays on device');
	});

	test('confirms before removing profile and bike images', () => {
		expect(
			render(
				<RemoveImageDialog
					kind="profile"
					onCancel={() => undefined}
					onConfirm={() => undefined}
					open={false}
				/>
			)
		).toBe('');
		const profileHtml = render(
			<RemoveImageDialog
				kind="profile"
				onCancel={() => undefined}
				onConfirm={() => undefined}
				open
			/>
		);
		expect(profileHtml).toContain('role="alertdialog"');
		expect(profileHtml).toContain('id="remove-image-title">Remove profile image?</h2>');
		expect(profileHtml).toContain(
			'Your profile image will be removed when you save your changes.'
		);
		expect(profileHtml).toContain('>Remove image</button>');

		const bikeHtml = render(
			<RemoveImageDialog
				bikeName="Road bike"
				kind="bike"
				onCancel={() => undefined}
				onConfirm={() => undefined}
				open
			/>
		);
		expect(bikeHtml).toContain('id="remove-image-title">Remove bike image?</h2>');
		expect(bikeHtml).toContain('Road bike');
		expect(bikeHtml).toContain('will be removed when you save your changes');
	});

	test('confirms before removing a profile bike', () => {
		expect(
			render(
				<RemoveBikeDialog
					bikeName="Gravel bike"
					onCancel={() => undefined}
					onConfirm={() => undefined}
					open={false}
				/>
			)
		).toBe('');
		const html = render(
			<RemoveBikeDialog
				bikeName="Gravel bike"
				onCancel={() => undefined}
				onConfirm={() => undefined}
				open
			/>
		);
		expect(html).toContain('role="alertdialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('id="remove-bike-title">Remove this bike?</h2>');
		expect(html).toContain('Gravel bike');
		expect(html).toContain('will be removed from your profile when you save your changes');
		expect(html).toContain('>Remove bike</button>');
	});

	test('shows manual virtual shifting for a terrain workout without Click controllers', async () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const html = await renderApp({
			...emptySession,
			workout: { course },
		});
		expect(html).toContain('Virtual shifting');
		expect(html).toContain('Shift to an easier gear');
		expect(html).toContain('Shift to a harder gear');
		expect(html).not.toContain('Resistance control');
	});

	test('renders the first-time welcome message', () => {
		expect(render(<WelcomeDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(
			<WelcomeDialog onClose={() => undefined} open testedChromeBrowser={false} />
		);
		expect(html).toContain('aria-modal="true"');
		expect(html).not.toContain('WELCOME TO');
		expect(html).toContain('RideControl.xyz');
		expect(html).toContain('show again');
		expect(html).toContain('Get started');
		expect(html).toContain('type="checkbox"');
		expect(html).toContain('open-source GPLv3 application');
		expect(html).toContain('source code on GitHub');
		expect(html).toContain('href="https://github.com/RideControlOrg/RideControl"');
		expect(html).toContain('only tested with the latest version of Google Chrome');
		expect(html).toContain('may not work correctly in');
		expect(html.match(/Chrome/g)).toHaveLength(1);
		expect(html).toContain('href="https://www.google.com/chrome/"');
		expect(html).toContain('>Download it</a>');
		expect(html.indexOf('only tested with the latest version of Google Chrome')).toBeLessThan(
			html.indexOf('Pair your trainer')
		);
		expect(
			render(<WelcomeDialog onClose={() => undefined} open testedChromeBrowser />)
		).not.toContain('Download it');
	});

	test('renders the keyboard controls reference', () => {
		expect(render(<KeyboardShortcutsDialog onClose={() => undefined} open={false} />)).toBe('');
		const html = render(<KeyboardShortcutsDialog onClose={() => undefined} open />);
		expect(html).toContain('Keyboard controls');
		expect(html).toContain('Open session history');
		expect(html).toContain('End the current session');
		expect(html).toContain('Start a new session after ending');
		expect(html).toContain('Increase resistance');
		expect(html).toContain('Decrease resistance');
		expect(html).toContain('Return');
		expect(html).toContain('Right Shift');
		expect(html).toContain('Change the chart view');
		expect(html).toContain('SESSION');
		expect(html).toContain('RIDE CONTROLS');
		expect(html).toContain('GENERAL');
		const historyHtml = render(
			<KeyboardShortcutsDialog
				onClose={() => undefined}
				open
				shortcuts={historyKeyboardShortcuts}
				title="History keyboard controls"
			/>
		);
		expect(historyHtml).toContain('History keyboard controls');
		expect(historyHtml).toContain('Select the previous or next session');
		expect(historyHtml).toContain('Change the session chart view');
		expect(historyHtml).toContain('Delete the selected session');
		expect(historyHtml).toContain('Confirm session deletion');
		expect(historyHtml).toContain('NAVIGATION');
		expect(historyHtml).toContain('SESSION');
		expect(historyHtml).toContain('GENERAL');
		expect(historyHtml).not.toContain('Increase or decrease resistance');
		expect(historyHtml).not.toContain('Pause or resume');
		expect(historyHtml).not.toContain('Start a new session after ending');
	});

	test('graphs resistance with the other session data', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: () => null,
				setItem: () => undefined,
			},
		});
		const html = render(
			<SessionChart
				controlMode="resistance"
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						heartRate: 140,
						power: 180,
						resistance: 42,
						speed: 30,
					},
				]}
				route={[]}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Resistance over time');
		expect(html).toContain('Resistance</button>');
		expect(html).not.toContain('Gear over time');
		expect(html).not.toContain('Gear</button>');
		expect(html).toContain('grid-cols-[4rem_minmax(0,1fr)]');
		expect(html).toContain('absolute right-2 -translate-y-1/2 whitespace-nowrap leading-none');
		expect(html).toContain('pointer-events-none relative h-full w-16 shrink-0');
		expect(html).toContain('h-full min-w-0 flex-1 overflow-hidden');
		expect(html).toContain('class="ts-chart-surface"');
		expect(html).toContain('data-chart-surface="true"');
		expect(html).toContain('absolute top-[12%] right-2 z-10 -translate-y-1/2');
		expect(html).not.toContain('bg-[#12171d]/90');
		expect(html).toContain('min-w-max flex-1');
		expect(html).toContain('h-1.5 w-1.5 shrink-0 rounded-full');
		expect(html).toContain('text-[11px] transition sm:text-[13px]');
		expect(html).toContain('session-chart min-w-0 overflow-hidden rounded-xl p-2 sm:p-3');
		expect(html).toContain('class="ts-chart__rule ts-chart__rule-y"');
		expect(html).toContain('class="ts-chart__rule ts-chart__rule-x"');
		expect(html).toContain('stroke-dasharray="2.5 2.5"');
		expect(html).toContain('aria-roledescription="chart"');
		expect(html).toContain('data-ts-focus-layer="over"');
		expect(html).toContain('Hover over the plot or use the arrow keys');
		expect(html).not.toContain('absolute top-[11%] bottom-[8%] left-1');
		const gearModeWithoutSamples = render(
			<SessionChart controlMode="gear" history={[]} route={[]} speedUnit="kmh" />
		);
		expect(gearModeWithoutSamples).toContain('Gear over time');
		expect(gearModeWithoutSamples).toContain('Gear</button>');
		expect(gearModeWithoutSamples).toContain('Connect and pedal to graph live session data');
		const liveChart = render(
			<SessionChart
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						heartRate: 140,
						power: 180,
						resistance: 42,
						speed: 30,
					},
				]}
				inspectionEnabled={false}
				route={[]}
				speedUnit="kmh"
			/>
		);
		expect(liveChart).toContain('Live chart updates while the session is running.');
		expect(liveChart).toContain('tabindex="-1"');
		expect(liveChart).not.toContain('Hover over the plot or use the arrow keys');
	});

	test('supports a chart selection scoped outside the shared dashboard preference', () => {
		const history = [
			{
				cadence: 85,
				elapsedSeconds: 1,
				heartRate: 140,
				power: 180,
				resistance: 42,
				speed: 30,
			},
		];
		const trayChart = render(
			<SessionChart
				history={history}
				onSelectChartMode={() => undefined}
				route={[]}
				selectedChartMode="power"
				speedUnit="kmh"
			/>
		);
		expect(trayChart).toContain('Power over time');
		expect(trayChart).not.toContain('Speed over time');
		expect(trayChart).not.toContain('Cadence over time');
	});

	test('graphs recorded workout elevation with a distinct color', () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const html = render(
			<SessionChart
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						elevation: 24,
						grade: 3.2,
						heartRate: 140,
						power: 180,
						resistance: 42,
						speed: 30,
					},
				]}
				route={course.points}
				speedUnit="kmh"
				variant="session"
			/>
		);
		expect(html).toContain(
			'session-chart-controls scrollbar-hidden flex w-full gap-1 overflow-x-auto'
		);
		expect(html).toContain('rounded-lg bg-inherit p-1');
		expect(html).not.toContain(
			'session-chart-controls scrollbar-hidden flex w-full gap-1 overflow-x-auto rounded-lg bg-[#0d1217]'
		);
		expect(html).toContain('style="--session-chart-mode-count:8"');
		expect(html).toContain('session-chart-control inline-flex min-w-max flex-none');
		expect(html).toContain('data-chart-mode="elevation"');
		expect(html).toContain('Elevation over time');
		expect(html).toContain('Elevation</button>');
		expect(html).toContain('28 m');
		expect(html).toContain('stroke="var(--metric-elevation)"');
		expect(html).toContain('Grade over time');
		expect(html).toContain('Grade</button>');
		expect(html).toContain('stroke="var(--metric-grade)"');
		expect(html).toContain('stroke="var(--metric-resistance)"');
		expect(html.match(/data-chart-series-label="true"/g)).toHaveLength(7);
		expect(html).not.toContain('data-chart-separator');
		const elevationDetailHtml = render(
			<SessionChart
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						elevation: 24,
						heartRate: 140,
						power: 180,
						speed: 30,
					},
				]}
				route={course.points}
				selectedChartMode="elevation"
				speedUnit="kmh"
				variant="session"
			/>
		);
		expect(elevationDetailHtml.match(/data-chart-series-label="true"/g)).toHaveLength(1);
		expect(elevationDetailHtml).toContain('>Elevation</span>');
		const imperialHtml = render(
			<SessionChart
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						elevation: 24,
						heartRate: 140,
						power: 180,
						resistance: 42,
						speed: 30,
					},
				]}
				route={course.points}
				speedUnit="mph"
			/>
		);
		expect(imperialHtml).toContain('92 ft');
		expect(imperialHtml).not.toContain('28 m');
	});

	test('preserves gear and applied resistance graphs after returning to resistance control', () => {
		const html = render(
			<SessionChart
				controlMode="resistance"
				history={[
					{
						cadence: 85,
						elapsedSeconds: 1,
						gear: 14,
						heartRate: 140,
						power: 180,
						resistance: 36,
						speed: 30,
					},
				]}
				route={[]}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Gear over time');
		expect(html).toContain('Gear</button>');
		expect(html).toContain('Resistance over time');
		expect(html).toContain('Resistance</button>');
	});

	test('renders the session save workflow', () => {
		expect(
			render(
				<SessionSaveDialog
					intent={SESSION_WORKFLOW_INTENT.END}
					onClose={() => undefined}
					onSave={async () => undefined}
					onStartWithoutSaving={() => undefined}
					open={false}
					saving={false}
					session={{ ...emptySession, maximums: emptyMetrics }}
					speedUnit="kmh"
				/>
			)
		).toBe('');
		const html = render(
			<SessionSaveDialog
				intent={SESSION_WORKFLOW_INTENT.EXTEND}
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{
					aggregates: emptySession.aggregates,
					calories: 100,
					controlMode: 'resistance',
					distance: 10,
					elapsedSeconds: 3600,
					elevationTotals: emptySession.elevationTotals,
					endedAt: Date.now(),
					history: [],
					maximums: emptyMetrics,
					startedAt: Date.now(),
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Save this session?');
		expect(html).not.toContain('SESSION ENDED');
		expect(html).toContain('How did it feel?');
		expect(html).toContain('Description');
		expect(html).toContain('0 / 500');
		expect(html).toContain('maxLength="500"');
		expect(html).toContain('Start extension without saving');
		expect(html).toContain('Save &amp; start extension');
		const endSession = render(
			<SessionSaveDialog
				intent={SESSION_WORKFLOW_INTENT.END}
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{ ...emptySession, maximums: emptyMetrics }}
				speedUnit="kmh"
			/>
		);
		expect(endSession).toContain('End without saving');
		expect(endSession).toContain('Save session');
		const newSession = render(
			<SessionSaveDialog
				intent={SESSION_WORKFLOW_INTENT.NEW}
				onClose={() => undefined}
				onSave={async () => undefined}
				onStartWithoutSaving={() => undefined}
				open
				saving={false}
				session={{ ...emptySession, maximums: emptyMetrics }}
				speedUnit="kmh"
			/>
		);
		expect(newSession).toContain('Start new without saving');
		expect(newSession).toContain('Save &amp; start new');
	});

	test('places workout planning after starting a new session', () => {
		const html = render(
			<SessionControls
				ended
				isRiding={false}
				manuallyPaused={false}
				onEnd={() => undefined}
				onOpenWorkouts={() => undefined}
				onRequestNew={() => undefined}
				onSave={() => undefined}
				onTogglePause={() => undefined}
				saveResolved
				workoutSelectionLocked={false}
			/>
		);
		expect(html.indexOf('Start new session')).toBeLessThan(html.indexOf('Workouts'));
	});

	test('distinguishes riding, paused, and auto-paused session controls', () => {
		const controls = (isRiding: boolean, manuallyPaused: boolean) =>
			render(
				<SessionControls
					ended={false}
					isRiding={isRiding}
					manuallyPaused={manuallyPaused}
					onEnd={() => undefined}
					onOpenWorkouts={() => undefined}
					onRequestNew={() => undefined}
					onSave={() => undefined}
					onTogglePause={() => undefined}
					saveResolved
					workoutSelectionLocked={false}
				/>
			);
		const riding = controls(true, false);
		const paused = controls(false, true);
		const autoPaused = controls(false, false);

		expect(riding).toContain('data-session-state="riding"');
		expect(riding).toContain('border-mint/40 bg-mint/10 text-mint');
		expect(paused).toContain('data-session-state="paused"');
		expect(paused).toContain('>Resume</button>');
		expect(paused).toContain(
			'border-amber-300/50 bg-amber-300/10 text-amber-300 hover:bg-amber-300/15'
		);
		expect(autoPaused).toContain('data-session-state="auto-paused"');
		expect(autoPaused).toContain('>Auto paused</button>');
		expect(autoPaused).toContain(
			'border-amber-300/50 bg-amber-300/10 text-amber-300 hover:bg-amber-300/15'
		);
	});

	test('renders an empty session history', () => {
		const html = render(
			<SessionHistory
				onClose={() => undefined}
				onSelectCalendarMonth={() => undefined}
				onSelectView={() => undefined}
				onStartNew={() => undefined}
				open
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('Sessions');
		expect(html).toContain('0 sessions');
		expect(html).not.toContain('Saved on this device');
		expect(html).toContain('data-side-tray="true"');
		expect(html).toContain('data-testid="session-calendar"');
		expect(html).toContain('No rides on this day');
		expect(html).toContain('Calendar');
		expect(html).toContain('List');
		expect(html).toContain('Statistics');
		expect(html).toContain('aria-label="0 sessions"');
		expect(html).not.toContain('>0 sessions<');
		expect(html).toContain('role="tablist"');
		expect(html).toContain(
			'scrollbar-hidden flex shrink-0 items-end gap-6 overflow-x-auto overflow-y-hidden'
		);
		expect(html.match(/role="tab"/g)).toHaveLength(3);
		expect(html.match(/outline-none transition-colors/g)).toHaveLength(3);
		expect(html).toContain('aria-selected="true"');
		expect(html).toContain('role="tabpanel"');
		expect(html).toContain('data-tab-indicator="active"');
		expect(html).toContain('bg-cyan-400');
		expect(html).toContain('data-tab-indicator="inactive"');
		expect(html).toContain('min-h-0 min-w-0 flex-1 flex-col overflow-hidden');
		expect(html).toContain('overflow-y-auto overflow-x-hidden');
		expect(html).toContain('Import FIT/TCX');
		expect(html).toContain('data-testid="download-all-sessions"');
		expect(html).toContain('aria-label="Download all sessions as TCX"');
		expect(html).toContain('aria-label="Download all format"');
		expect(html).toContain('aria-haspopup="listbox"');
		expect(html).not.toContain('<select');
		expect(html).toContain('Download all');
		expect(html).toContain('h-9 rounded-lg border border-line px-3');
		expect(html).toContain('h-9 rounded-l-lg border border-line border-r-0 px-3');
		expect(html).toContain('w-16 shrink-0');
		expect(html).toContain('h-9 gap-2 px-2');
		expect(html).toContain('border-l-0');
		expect(html).toContain('.tcx,.zip');
		expect(html).toContain('ml-auto');
		expect(html).toContain('translate-x-0');
		expect(html).toContain('Show history keyboard controls');
		expect(html).toContain('pt-2 pr-24 pb-0 pl-5');
		expect(html).toContain('absolute top-2 right-14 grid h-9 w-9');
		expect(html).toContain('absolute top-2 right-3 grid h-9 w-9');
		expect(html.match(/hover:text-white sm:static/g)).toHaveLength(2);
	});

	test('renders a monthly ride calendar with selectable events', () => {
		const month = new Date(2026, 6, 1);
		const morning = {
			...sessionSummary({
				...savedSessionFixture,
				id: 'morning-ride',
				startedAt: new Date(2026, 6, 18, 8).getTime(),
			}),
			workoutName: 'Prairie Roll',
		};
		const evening = {
			...sessionSummary({
				...savedSessionFixture,
				id: 'evening-ride',
				startedAt: new Date(2026, 6, 18, 18).getTime(),
			}),
			workoutName: 'Harbor Ring',
		};
		const html = render(
			<SessionCalendar
				error=""
				loading={false}
				month={month}
				onChangeMonth={() => undefined}
				onSelect={() => undefined}
				selectedId={morning.id}
				speedUnit="mph"
				summaries={[evening, morning]}
			/>
		);

		expect(html).toContain('July 2026');
		expect(html).toContain('2 rides');
		expect(html).toContain('Prairie Roll');
		expect(html).toContain('Harbor Ring');
		expect(html).toContain('aria-label="Previous month"');
		expect(html).toContain('aria-label="Next month"');
		expect(html).toContain('aria-pressed="true"');
	});

	test('renders cached all-time statistics and per-period metric charts', () => {
		const analytics = buildSessionAnalyticsCache([
			sessionAnalyticsContribution({
				...savedSessionFixture,
				distance: 32,
				elapsedSeconds: 3600,
				elevationTotals: { ascent: 500, descent: 480 },
			}),
		]);
		const html = render(
			<SessionStatistics
				analytics={analytics}
				error=""
				initialTrendMetric={SESSION_TREND_METRIC.DISTANCE}
				loading={false}
				onSelectSession={() => undefined}
				speedUnit="mph"
				trendEndTimestamp={new Date(2026, 6, 23, 12).getTime()}
				weightHistory={[
					{ recordedAt: Date.UTC(2026, 5, 1), weightKg: 76 },
					{ recordedAt: Date.UTC(2026, 6, 1), weightKg: 75 },
				]}
			/>
		);

		expect(html).toContain('All-time totals');
		expect(html).toContain('data-testid="all-time-totals"');
		expect(html).toContain('data-testid="personal-bests"');
		expect(html).toContain('<section data-testid="all-time-totals">');
		expect(html).toContain('<section class="mt-6" data-testid="personal-bests">');
		expect(html).toContain('session-statistics-content mx-auto w-full max-w-5xl');
		expect(html).toContain(
			'session-statistics min-w-0 flex-1 overflow-y-auto overflow-x-hidden'
		);
		expect(html).not.toContain(
			'Updated locally whenever a session is saved, imported, changed, or deleted.'
		);
		expect(html).toContain('Personal bests');
		expect(html).toContain('Trends');
		expect(html.match(/<h3 class="font-bold text-xl">/g)).toHaveLength(4);
		expect(html).toContain('Distance');
		expect(html).toContain('Ride time');
		expect(html).toContain('Climbing');
		expect(html).toContain('Downhill');
		expect(html).toContain('Calories');
		expect(html).toContain('Average speed');
		expect(html).toContain('Average power');
		expect(html).toContain('Average cadence');
		expect(html).toContain('Average heart rate');
		expect(html).toContain('Open this session');
		expect(html).toContain('data-testid="session-statistics"');
		expect(html).toContain('aria-label="Trend metric"');
		expect(html).toContain('aria-haspopup="listbox"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('data-select-menu="true"');
		expect(html).toContain('isolate inline-flex h-10');
		expect(html).not.toContain('<select');
		expect(html.match(/>All</g)).toHaveLength(2);
		expect(html).toContain('data-analytics-chart="detail"');
		expect(html).toContain('class="ts-chart__bar ts-chart__bar-y"');
		expect(html).toContain('viewBox="0 0 640 144"');
		expect(html).toContain('Hover over a bar or use the arrow keys');
		expect(html).toContain('Active years');
		expect(html).not.toContain('Exact ride time');
		expect(html).toContain('Weight over time');
		expect(html).toContain('data-weight-chart-size="full"');
		expect(html).toContain('viewBox="0 0 640 176"');
		expect(html.match(/data-testid="rider-weight-chart"/g)).toHaveLength(1);
		expect(html).not.toContain('bg-slate-950/25');
		expect(html).toContain('class="ts-chart__area"');
		expect(html.match(/sm:text-5xl/g)).toHaveLength(18);
		expect(html.match(/sm:text-2xl/g)).toHaveLength(9);
		expect(html).toContain('minimal-stat-grid');
		expect(html.match(/minimal-stat-card/g)).toHaveLength(18);
		expect(html).toContain('minimal-peak-grid');
		expect(html.match(/minimal-peak-card/g)).toHaveLength(9);
		expect(html).toContain('minimal-weight-chart');
		expect(html).toContain('minimal-chart-panel');
		expect(html).not.toContain('mt-2 truncate font-bold text-4xl');
		expect(html).toContain('<span class="whitespace-nowrap">');

		const largeTotals = render(
			<SessionStatistics
				analytics={{
					...analytics,
					totals: {
						...analytics.totals,
						calories: 12_345_678,
						elapsedSeconds: 123 * 86_400 + 4 * 3600,
						sessionCount: 1_234_567,
					},
				}}
				error=""
				loading={false}
				onSelectSession={() => undefined}
				speedUnit="mph"
				trendEndTimestamp={new Date(2026, 6, 23, 12).getTime()}
			/>
		);
		expect(largeTotals).toContain('1,234,567');
		expect(largeTotals).toContain('123d 4h');
		expect(largeTotals).toContain('12,345,678');

		const overview = render(
			<SessionStatistics
				analytics={analytics}
				error=""
				initialTrendRange="all"
				loading={false}
				onSelectSession={() => undefined}
				speedUnit="mph"
				trendEndTimestamp={new Date(2026, 6, 23, 12).getTime()}
			/>
		);
		expect(overview).toContain('data-testid="trend-overview"');
		expect(overview).toContain('statistics-trend-overview-grid');
		expect(overview).toContain('All trends');
		expect(overview).toContain('12 metrics');
		expect(overview).toContain('Complete ride history');
		expect(overview).toContain('aria-label="Distance trend"');
		expect(overview.match(/data-analytics-chart="overview"/g)).toHaveLength(12);
		expect(overview.match(/class="ts-chart__bar ts-chart__bar-y"/g)).toHaveLength(12);
		expect(overview.match(/viewBox="0 0 640 40"/g)).toHaveLength(12);
	});

	test('virtualizes a large session history list', () => {
		const summaries = Array.from({ length: 100 }, (_, index) => ({
			...sessionSummary({
				...savedSessionFixture,
				endedAt: savedSessionFixture.endedAt - index * 1000,
				id: `session-${index}`,
				startedAt: savedSessionFixture.startedAt - index * 1000,
			}),
			workoutName: `Workout ${index}`,
		}));
		const html = render(
			<SessionHistoryList
				error=""
				highlightedSessionIds={[]}
				onLoadMore={() => undefined}
				onSelect={() => undefined}
				open
				selectedId={summaries[0]?.id}
				speedUnit="kmh"
				summaries={summaries}
				total={summaries.length}
			/>
		);
		const renderedSessionCount = html.match(/aria-pressed=/g)?.length ?? 0;
		expect(html).toContain('data-session-history-virtualized="true"');
		expect(html).toContain('Workout 0');
		expect(renderedSessionCount).toBeGreaterThan(0);
		expect(renderedSessionCount).toBeLessThan(summaries.length);
		expect(html).not.toContain('Workout 99');
	});

	test('highlights every session from the latest import in history navigation', () => {
		const importedSession = { ...savedSessionFixture, importedAt: Date.UTC(2026, 6, 19) };
		const html = render(
			<SessionHistoryList
				error=""
				highlightedSessionIds={[importedSession.id]}
				onLoadMore={() => undefined}
				onSelect={() => undefined}
				open
				selectedId={importedSession.id}
				speedUnit="kmh"
				summaries={[sessionSummary(importedSession)]}
				total={1}
			/>
		);
		expect(html).toContain('aria-label="Imported from activity file"');
		expect(html).toContain('<title>Imported from activity file</title>');
		expect(html).toContain('absolute right-2.5 bottom-3');
		expect(html).toContain('class="h-5 w-5"');
		expect(html).toContain('ring-cyan-400/70');
		expect(html).toContain('shadow-[0_0_14px_rgba(34,211,238,0.16)]');
	});

	test('labels imported sessions permanently without retaining the fresh highlight', () => {
		const importedSession = { ...savedSessionFixture, importedAt: Date.UTC(2026, 6, 19) };
		const list = render(
			<SessionHistoryList
				error=""
				highlightedSessionIds={[]}
				onLoadMore={() => undefined}
				onSelect={() => undefined}
				open
				speedUnit="kmh"
				summaries={[sessionSummary(importedSession)]}
				total={1}
			/>
		);
		expect(list).toContain('aria-label="Imported from activity file"');
		expect(list).not.toContain('>Imported<');
		expect(list).not.toContain('ring-cyan-400/70');
		const detail = render(<SessionDetail session={importedSession} speedUnit="kmh" />);
		expect(detail).toContain('data-testid="session-detail"');
		expect(detail).toContain('px-3 pt-0 pb-3 sm:px-6 sm:pb-6');
		expect(detail).toContain('overflow-y-auto overflow-x-hidden');
		expect(detail).toContain('>Imported<');
		expect(detail).not.toContain('Imported TCX');
		expect(detail).toContain('MAX</strong>45');
		expect(detail).toContain(
			`title="Imported ${formatSessionImportTime(importedSession.importedAt)}`
		);
	});

	test('renders session deletion confirmation as a modal', () => {
		const html = render(
			<DeleteSessionDialog
				deleting={false}
				onCancel={() => undefined}
				onConfirm={() => undefined}
				open
			/>
		);
		expect(html).toContain('role="alertdialog"');
		expect(html).toContain('Delete this session?');
		expect(html).toContain('Delete permanently');
		expect(html).toContain('absolute top-0 right-0');
		expect(html).not.toContain('bg-black/65');
		expect(
			render(
				<DeleteSessionDialog
					deleting
					onCancel={() => undefined}
					onConfirm={() => undefined}
					open
				/>
			)
		).toContain('Deleting…');
		expect(
			render(
				<DeleteSessionDialog
					deleting={false}
					onCancel={() => undefined}
					onConfirm={() => undefined}
					open={false}
				/>
			)
		).toBe('');
	});

	test('renders an overnight session with date and time ranges', () => {
		const startedAt = new Date(2026, 6, 18, 23).getTime();
		const endedAt = new Date(2026, 6, 19, 1).getTime();
		const html = render(
			<SessionDetail
				session={{
					aggregates: emptySession.aggregates,
					calories: 0,
					comments: '',
					controlMode: 'resistance',
					distance: 0,
					elapsedSeconds: 7200,
					elevationTotals: emptySession.elevationTotals,
					endedAt,
					history: [],
					id: 'overnight-session',
					maximums: emptyMetrics,
					startedAt,
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain(
			new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).formatRange(
				new Date(startedAt),
				new Date(endedAt)
			)
		);
		expect(html).toContain('11:00pm – 1:00am');
		expect(html).toContain('data-session-date-time="true"');
		expect(html).toContain('font-bold text-base text-mint tracking-widest');
		expect(html).toContain('whitespace-nowrap font-bold text-base tabular-nums');
	});

	test('orders recorded totals, ride metrics, and the saved route map', () => {
		const [course] = WORKOUT_COURSES;
		if (!course) {
			throw new Error('Expected a built-in workout course');
		}
		const html = render(
			<SessionDetail
				session={{
					...savedSessionFixture,
					workout: { course },
				}}
				speedUnit="mph"
			/>
		);
		const courseMapLabel = `aria-label="${course.name} course map"`;
		expect(html).toContain(courseMapLabel);
		expect(html).toContain('RECORDED');
		expect(html.indexOf('RECORDED')).toBeLessThan(html.indexOf('POWER'));
		expect(html.indexOf('POWER')).toBeLessThan(html.indexOf(courseMapLabel));
	});

	test('offers per-session and combined metrics for linked course journeys', () => {
		const html = render(
			<SessionDetail
				combinedJourney={{
					nextSessionId: undefined,
					partCount: 2,
					partNumber: 2,
					previousSessionId: savedSessionFixture.id,
					session: {
						...savedSessionFixture,
						calories: 500,
						distance: 20,
						elapsedSeconds: 7200,
						id: 'journey:saved-session',
					},
				}}
				onSelectLinkedSession={() => undefined}
				session={{
					...savedSessionFixture,
					continuation: {
						journeyId: savedSessionFixture.id,
						previousSessionId: savedSessionFixture.id,
						workoutStartDistance: savedSessionFixture.distance,
					},
					id: 'second-session',
				}}
				speedUnit="mph"
			/>
		);
		expect(html).toContain('aria-pressed="false"');
		expect(html).toContain('2/2');
		expect(html).toContain('← Part 1');
		expect(html).not.toContain('Part 3 →');
	});

	test('shows the rider weight captured with the session in the selected units', () => {
		const imperial = render(<SessionDetail session={savedSessionFixture} speedUnit="mph" />);
		expect(imperial).toContain('RIDER WEIGHT');
		expect(imperial).toContain('165.3');
		expect(imperial).toContain('lb');

		const metric = render(<SessionDetail session={savedSessionFixture} speedUnit="kmh" />);
		expect(metric).toContain('75.0');
		expect(metric).toContain('kg');

		const legacy = render(
			<SessionDetail
				session={{ ...savedSessionFixture, profileSnapshot: undefined }}
				speedUnit="mph"
			/>
		);
		expect(legacy).not.toContain('RIDER WEIGHT');
	});

	test('styles an unrecorded feeling like the comments value', () => {
		const html = render(
			<SessionDetail
				deleteConfirmationOpen
				onCancelDelete={() => undefined}
				onConfirmDelete={() => undefined}
				onDelete={() => undefined}
				onStartNew={() => undefined}
				session={{
					aggregates: emptySession.aggregates,
					calories: 0,
					comments: '',
					controlMode: 'resistance',
					distance: 0,
					elapsedSeconds: 0,
					elevationTotals: emptySession.elevationTotals,
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
		expect(html).toContain('Delete session');
		expect(html).toContain('Start new session');
		expect(html).toContain('Download TCX');
		expect(html).toContain('Download FIT');
		expect(html).toContain('data-session-file-downloads="true"');
		expect(html).toContain('data-session-actions="true"');
		expect(html).not.toContain('Connect and pedal to graph live session data');
		expect(html).toContain('mt-3 grid grid-cols-2 gap-2');
		expect(html).toContain('minimal-summary-grid mt-3 grid');
		expect(html).toContain('minimal-session-metric-grid');
		expect(html).toContain('session-metadata-grid mt-3 grid gap-3');
		expect(html).toContain('session-metadata-item session-metadata-feeling px-2 py-3 sm:px-3');
		expect(html).toContain(
			'session-metadata-description session-metadata-item px-2 py-3 sm:px-3'
		);
		expect(html).toContain('mt-3 session-chart');
		expect(html).not.toContain('mt-5 grid');
		expect(html).not.toContain('mt-4 sm:mt-6');
		expect(html).not.toContain('gap-2 border-line border-t pt-4');
		expect(html).toContain('contents sm:flex sm:flex-wrap sm:gap-2');
		expect(html).toContain('contents sm:ml-auto sm:flex sm:flex-wrap sm:justify-end sm:gap-2');
		expect(html).toContain('No recorded samples to export');
		expect(html).toContain('role="alertdialog"');
		expect(html).not.toContain('until');
		expect(html).toContain(
			'<p class="mt-1 whitespace-pre-wrap text-slate-300 text-sm">Not recorded</p>'
		);
	});

	test('shows both gear and applied resistance in a virtual shifting session summary', () => {
		const html = render(
			<SessionDetail
				session={{
					aggregates: {
						...emptySession.aggregates,
						gear: { count: 2, maximum: 14, sum: 27 },
						resistance: { count: 2, maximum: 42, sum: 80 },
					},
					calories: 0,
					comments: '',
					controlMode: 'gear',
					distance: 0,
					elapsedSeconds: 2,
					elevationTotals: emptySession.elevationTotals,
					endedAt: Date.now(),
					history: [],
					id: 'gear-session',
					maximums: emptyMetrics,
					startedAt: Date.now() - 2000,
				}}
				speedUnit="kmh"
			/>
		);
		expect(html).toContain('GEAR');
		expect(html).toContain('MAX</strong>14');
		expect(html).toContain('RESISTANCE');
		expect(html).toContain('MAX</strong>42');
		expect(html).toContain('minimal-session-metric-grid');
	});
});
