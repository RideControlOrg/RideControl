import { useCallback, useEffect, useRef, useState } from 'react';
import { DevicePairingPanel } from './components/device-pairing';
import { KeyboardShortcutsDialog } from './components/keyboard-shortcuts-dialog';
import { Notification } from './components/notification';
import { AppFooter, RideDashboard } from './components/ride-dashboard';
import { SessionHistory } from './components/session-history';
import { SessionSaveDialog } from './components/session-save-dialog';
import { WelcomeDialog } from './components/welcome-dialog';
import { useGearControl } from './hooks/use-gear-control';
import { useHeartRateMonitor } from './hooks/use-heart-rate-monitor';
import { useSession } from './hooks/use-session';
import { useTrainer } from './hooks/use-trainer';
import { useZwiftClick } from './hooks/use-zwift-click';
import { type AppShortcut, appShortcutForKey, gearingKeyboardShortcuts } from './lib/keyboard';
import {
	createSavedSession,
	requestPersistentSessionStorage,
	saveSession,
} from './lib/saved-sessions';
import { requestUnloadConfirmation, sessionNeedsUnloadWarning } from './lib/session';
import { rememberWelcomeDismissal, shouldShowWelcome } from './lib/welcome';
import type { ControlMode, Metrics, SavedSession, SessionMetadata, SpeedUnit } from './types';

function shouldIgnoreShortcut(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null;
	return (
		event.defaultPrevented ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		target?.matches("button, a, input, textarea, select, [contenteditable='true']")
	);
}

function metricsWithHeartRate(metrics: Metrics, connected: boolean, heartRate: number): Metrics {
	if (!connected) {
		return metrics;
	}
	return { ...metrics, heartRate };
}

function shiftHandlerUnlessBlocked(handler: (change: number) => void, blocked: boolean) {
	return blocked ? () => undefined : handler;
}

function controlModeForClick(paired: boolean): ControlMode {
	return paired ? 'gear' : 'resistance';
}

export function App() {
	const trainer = useTrainer();
	const [devicesOpen, setDevicesOpen] = useState(false);
	const clickShiftRef = useRef<(change: number) => void>(() => undefined);
	const handleClickShift = useCallback((change: number) => clickShiftRef.current(change), []);
	const click = useZwiftClick(handleClickShift, trainer.setNotice, devicesOpen);
	const heartRate = useHeartRateMonitor(trainer.setNotice);
	const liveMetrics = metricsWithHeartRate(
		trainer.metrics,
		heartRate.connected,
		heartRate.heartRate
	);
	const { connected } = trainer;
	const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(() =>
		localStorage.getItem('speed-unit') === 'kmh' ? 'kmh' : 'mph'
	);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [welcomeOpen, setWelcomeOpen] = useState(shouldShowWelcome);
	const dashboardKeyboardEnabled = !(devicesOpen || historyOpen || shortcutsOpen || welcomeOpen);
	const gearControl = useGearControl({
		active: click.paired,
		connected: trainer.connected,
		keyboardEnabled: dashboardKeyboardEnabled,
		onResistanceChange: trainer.shiftResistanceBy,
		resistance: trainer.resistance,
		setNotice: trainer.setNotice,
	});
	clickShiftRef.current = shiftHandlerUnlessBlocked(gearControl.shiftGear, devicesOpen);
	const session = useSession(
		liveMetrics,
		{
			gear: gearControl.gear,
			mode: controlModeForClick(click.paired),
			resistance: trainer.resistance,
		},
		trainer.lastPedalingAt,
		trainer.trainerReportsDistance
	);
	const { isRiding, manuallyPaused } = session;
	const sessionIsSaved = Boolean(session.savedSessionId);
	const [saveDialogOpen, setSaveDialogOpen] = useState(() => session.ended && !sessionIsSaved);
	const [saving, setSaving] = useState(false);
	const [startAfterSave, setStartAfterSave] = useState(false);
	const [continuationAfterSave, setContinuationAfterSave] = useState<SavedSession>();
	const endSession = useCallback(() => {
		session.endSession();
		setStartAfterSave(false);
		setContinuationAfterSave(undefined);
		setSaveDialogOpen(true);
	}, [session.endSession]);
	const startNewSession = useCallback(() => {
		session.startNew();
		setSaveDialogOpen(false);
		setStartAfterSave(false);
		setContinuationAfterSave(undefined);
		trainer.setNotice('New session ready.');
	}, [session.startNew, trainer.setNotice]);
	const continueSession = useCallback(
		(savedSession: SavedSession) => {
			session.continueFrom(savedSession);
			setHistoryOpen(false);
			setSaveDialogOpen(false);
			setStartAfterSave(false);
			setContinuationAfterSave(undefined);
			trainer.setNotice('Session continued.');
		},
		[session.continueFrom, trainer.setNotice]
	);
	const requestNewSession = useCallback(() => {
		if (session.ended) {
			if (sessionIsSaved) {
				startNewSession();
			} else {
				setStartAfterSave(true);
				setContinuationAfterSave(undefined);
				setSaveDialogOpen(true);
			}
			return;
		}
		if (session.elapsedSeconds > 0) {
			session.endSession();
			setStartAfterSave(true);
			setContinuationAfterSave(undefined);
			setSaveDialogOpen(true);
			return;
		}
		startNewSession();
	}, [
		session.elapsedSeconds,
		session.endSession,
		session.ended,
		sessionIsSaved,
		startNewSession,
	]);
	const handleNewSessionShortcut = useCallback(
		(event: KeyboardEvent) => {
			if (!session.ended) {
				return;
			}
			event.preventDefault();
			requestNewSession();
		},
		[requestNewSession, session.ended]
	);

	useEffect(() => {
		requestPersistentSessionStorage().catch(() => false);
	}, []);

	const warnBeforeUnload = sessionNeedsUnloadWarning(session.ended, session.elapsedSeconds);
	useEffect(() => {
		if (!warnBeforeUnload) {
			return;
		}
		const confirmActiveSessionExit = (event: BeforeUnloadEvent) => {
			requestUnloadConfirmation(event);
		};
		window.addEventListener('beforeunload', confirmActiveSessionExit);
		return () => window.removeEventListener('beforeunload', confirmActiveSessionExit);
	}, [warnBeforeUnload]);

	useEffect(() => {
		trainer.setKeyboardControlsEnabled(dashboardKeyboardEnabled);
		trainer.setGearControlsEnabled(click.paired);
	}, [
		click.paired,
		dashboardKeyboardEnabled,
		trainer.setGearControlsEnabled,
		trainer.setKeyboardControlsEnabled,
	]);

	useEffect(() => {
		const shortcutHandlers: Record<AppShortcut, (event: KeyboardEvent) => void> = {
			endSession: (event) => {
				if (saveDialogOpen || shortcutsOpen || session.ended) {
					return;
				}
				event.preventDefault();
				endSession();
			},
			history: (event) => {
				if (saveDialogOpen) {
					return;
				}
				event.preventDefault();
				setShortcutsOpen(false);
				setHistoryOpen(true);
			},
			newSession: (event) => {
				if (!(saveDialogOpen || shortcutsOpen)) {
					handleNewSessionShortcut(event);
				}
			},
			pause: (event) => {
				if (saveDialogOpen || shortcutsOpen) {
					return;
				}
				event.preventDefault();
				session.togglePause();
			},
			shortcuts: (event) => {
				if (saveDialogOpen) {
					return;
				}
				event.preventDefault();
				setHistoryOpen(false);
				setShortcutsOpen(true);
			},
		};
		const handleShortcut = (event: KeyboardEvent) => {
			if (devicesOpen || welcomeOpen || shouldIgnoreShortcut(event)) {
				return;
			}
			if (historyOpen) {
				return;
			}
			const shortcut = appShortcutForKey(event);
			if (shortcut) {
				shortcutHandlers[shortcut](event);
			}
		};
		window.addEventListener('keydown', handleShortcut);
		return () => window.removeEventListener('keydown', handleShortcut);
	}, [
		devicesOpen,
		endSession,
		handleNewSessionShortcut,
		historyOpen,
		saveDialogOpen,
		session.ended,
		session.togglePause,
		shortcutsOpen,
		welcomeOpen,
	]);

	function selectSpeedUnit(unit: SpeedUnit) {
		setSpeedUnit(unit);
		localStorage.setItem('speed-unit', unit);
	}

	function closeSaveDialog() {
		setSaveDialogOpen(false);
		setStartAfterSave(false);
		setContinuationAfterSave(undefined);
	}

	async function saveCurrentSession(metadata: SessionMetadata) {
		setSaving(true);
		try {
			const saved = createSavedSession(session.snapshot, metadata);
			await saveSession(saved);
			session.markSaved(saved.id);
			if (startAfterSave) {
				if (continuationAfterSave) {
					continueSession(continuationAfterSave);
					trainer.setNotice('Session saved. Selected session continued.');
				} else {
					startNewSession();
					trainer.setNotice('Session saved. New session ready.');
				}
			} else {
				setSaveDialogOpen(false);
				trainer.setNotice('Session saved.');
			}
		} catch (error) {
			trainer.setNotice(
				`Session could not be saved: ${error instanceof Error ? error.message : String(error)}`
			);
		} finally {
			setSaving(false);
		}
	}

	const closeHistory = useCallback(() => setHistoryOpen(false), []);
	const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
	const closeWelcome = useCallback((dontShowAgain: boolean) => {
		if (dontShowAgain) {
			rememberWelcomeDismissal();
		}
		setWelcomeOpen(false);
	}, []);
	const startNewSessionFromHistory = useCallback(
		(savedSession: SavedSession) => {
			setHistoryOpen(false);
			const currentNeedsSave =
				(session.ended && !sessionIsSaved) ||
				(!session.ended && session.elapsedSeconds > 0);
			if (currentNeedsSave) {
				if (!session.ended) {
					session.endSession();
				}
				setContinuationAfterSave(savedSession);
				setStartAfterSave(true);
				setSaveDialogOpen(true);
				return;
			}
			continueSession(savedSession);
		},
		[continueSession, session.elapsedSeconds, session.endSession, session.ended, sessionIsSaved]
	);
	const proceedWithoutSaving = useCallback(() => {
		if (continuationAfterSave) {
			continueSession(continuationAfterSave);
		} else {
			startNewSession();
		}
	}, [continuationAfterSave, continueSession, startNewSession]);

	const connectedDeviceCount =
		Number(trainer.connected) + Number(heartRate.connected) + click.connectedCount;
	const pairedDeviceCount = Number(trainer.paired) + Number(heartRate.paired) + click.pairedCount;
	const devicesConnecting = [
		trainer.connectionBusy,
		heartRate.busy,
		click.busy,
		click.pairing,
	].some(Boolean);

	return (
		<main className="min-h-screen bg-ink selection:bg-mint/30">
			<RideDashboard
				clickPaired={click.paired}
				connected={connected}
				connectedDeviceCount={connectedDeviceCount}
				dashboardKeyboardEnabled={dashboardKeyboardEnabled}
				devicesConnecting={devicesConnecting}
				gear={gearControl.gear}
				liveMetrics={liveMetrics}
				onEndSession={endSession}
				onOpenDevices={() => setDevicesOpen(true)}
				onOpenHistory={() => {
					setShortcutsOpen(false);
					setHistoryOpen(true);
				}}
				onOpenShortcuts={() => {
					setHistoryOpen(false);
					setShortcutsOpen(true);
				}}
				onRequestNewSession={requestNewSession}
				onSaveSession={() => {
					setStartAfterSave(false);
					setSaveDialogOpen(true);
				}}
				onSelectSpeedUnit={selectSpeedUnit}
				onShiftGear={gearControl.shiftGear}
				onTogglePause={session.togglePause}
				onUpdateResistance={trainer.updateResistance}
				pairedDeviceCount={pairedDeviceCount}
				resistance={trainer.resistance}
				resistanceKeyFlash={trainer.resistanceKeyFlash}
				resistanceRamp={trainer.resistanceRamp}
				session={{
					aggregates: session.aggregates,
					controlMode: session.controlMode,
					elapsedSeconds: session.elapsedSeconds,
					ended: session.ended,
					history: session.history,
					isRiding,
					manuallyPaused,
					maximums: session.maximums,
					rideCalories: session.rideCalories,
					rideDistance: session.rideDistance,
				}}
				sessionIsSaved={sessionIsSaved}
				shiftFlash={gearControl.shiftFlash}
				speedUnit={speedUnit}
			/>
			<AppFooter onOpenWelcome={() => setWelcomeOpen(true)} />
			<Notification
				connected={connected}
				notice={trainer.notice}
				onDismiss={() => trainer.setNotice('')}
			/>
			<SessionSaveDialog
				continuing={Boolean(continuationAfterSave)}
				onClose={closeSaveDialog}
				onSave={saveCurrentSession}
				onStartWithoutSaving={proceedWithoutSaving}
				open={saveDialogOpen}
				saving={saving}
				session={session.snapshot}
				speedUnit={speedUnit}
			/>
			<SessionHistory
				onClose={closeHistory}
				onStartNew={startNewSessionFromHistory}
				open={historyOpen}
				speedUnit={speedUnit}
			/>
			<DevicePairingPanel
				click={{
					...click,
					onDisconnect: click.disconnect,
					onForget: click.forget,
					onForgetController: click.forgetDevice,
					onPair: click.pair,
					onReconnect: click.reconnect,
				}}
				heartRate={{
					...heartRate,
					onDisconnect: heartRate.disconnect,
					onForget: heartRate.forget,
					onPair: heartRate.pair,
					onReconnect: heartRate.reconnect,
				}}
				onClose={() => setDevicesOpen(false)}
				open={devicesOpen}
				trainer={{
					busy: trainer.connectionBusy,
					connected: trainer.connected,
					name: trainer.pairedDeviceName,
					onDisconnect: trainer.disconnect,
					onForget: trainer.forget,
					onPair: trainer.connect,
					onReconnect: trainer.reconnect,
					paired: trainer.paired,
					phase: trainer.phase,
					reconnecting: trainer.reconnecting,
					status: trainer.status,
				}}
			/>
			<KeyboardShortcutsDialog
				onClose={closeShortcuts}
				open={shortcutsOpen}
				shortcuts={click.paired ? gearingKeyboardShortcuts : undefined}
			/>
			<WelcomeDialog onClose={closeWelcome} open={welcomeOpen} />
		</main>
	);
}
