import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyMetrics, emptySession, RECORDING_PAUSE_DELAY_MS } from '../constants';
import { addMetricAggregates, loadStoredSession } from '../lib/session';
import type { MetricSample, Metrics, SessionAggregates, StoredSession } from '../types';

interface ActivityRef {
	current: number;
}

interface FlagRef {
	current: boolean;
}

export function useSession(
	metrics: Metrics,
	lastPedalingAt: ActivityRef,
	trainerReportsDistance: FlagRef
) {
	const restored = useMemo(loadStoredSession, []);
	const [isRiding, setIsRiding] = useState(false);
	const [manuallyPaused, setManuallyPaused] = useState(false);
	const [elapsedSeconds, setElapsedSeconds] = useState(restored.elapsedSeconds);
	const [rideDistance, setRideDistance] = useState(restored.distance);
	const [rideCalories, setRideCalories] = useState(restored.calories);
	const [history, setHistory] = useState<MetricSample[]>(restored.history);
	const [maximums, setMaximums] = useState<Metrics>(restored.maximums);
	const [aggregates, setAggregates] = useState<SessionAggregates>(restored.aggregates);
	const latestMetrics = useRef(metrics);
	const elapsedRef = useRef(restored.elapsedSeconds);
	const lastTrainerDistance = useRef<number | undefined>(undefined);

	useEffect(() => {
		latestMetrics.current = metrics;
		setMaximums((current) => ({
			...current,
			cadence: Math.max(current.cadence, metrics.cadence),
			heartRate: Math.max(current.heartRate, metrics.heartRate),
			power: Math.max(current.power, metrics.power),
			speed: Math.max(current.speed, metrics.speed),
		}));
	}, [metrics]);

	useEffect(() => {
		localStorage.setItem(
			'trainer-session',
			JSON.stringify({
				aggregates,
				calories: rideCalories,
				distance: rideDistance,
				elapsedSeconds,
				history,
				maximums,
			} satisfies StoredSession)
		);
	}, [aggregates, elapsedSeconds, history, maximums, rideCalories, rideDistance]);

	useEffect(() => {
		const interval = window.setInterval(() => {
			const recentlyPedaling =
				lastPedalingAt.current > 0 &&
				performance.now() - lastPedalingAt.current <= RECORDING_PAUSE_DELAY_MS;
			setIsRiding(!manuallyPaused && recentlyPedaling);
		}, 500);
		return () => window.clearInterval(interval);
	}, [lastPedalingAt, manuallyPaused]);

	useEffect(() => {
		if (!isRiding) {
			return;
		}
		let lastTick = performance.now();
		if (trainerReportsDistance.current) {
			lastTrainerDistance.current = latestMetrics.current.distance;
		}
		const interval = window.setInterval(() => {
			const now = performance.now();
			const seconds = (now - lastTick) / 1000;
			lastTick = now;
			const live = latestMetrics.current;
			elapsedRef.current += seconds;
			setElapsedSeconds(elapsedRef.current);
			if (trainerReportsDistance.current) {
				const previous = lastTrainerDistance.current;
				const delta = previous === undefined ? 0 : live.distance - previous;
				if (delta >= 0 && delta < 0.25) {
					setRideDistance((value) => value + delta);
				}
				lastTrainerDistance.current = live.distance;
			} else {
				setRideDistance((value) => value + (live.speed * seconds) / 3600);
			}
			setHistory((samples) =>
				[
					...samples,
					{
						cadence: live.cadence,
						elapsedSeconds: elapsedRef.current,
						heartRate: live.heartRate,
						power: live.power,
						speed: live.speed,
					},
				].slice(-3600)
			);
			setAggregates((current) => addMetricAggregates(current, live));
			if (live.power > 0) {
				setRideCalories((value) => value + (live.power * seconds) / (4184 * 0.24));
			}
		}, 1000);
		return () => window.clearInterval(interval);
	}, [isRiding, trainerReportsDistance]);

	const togglePause = useCallback(() => {
		if (manuallyPaused) {
			setManuallyPaused(false);
			setIsRiding(
				lastPedalingAt.current > 0 &&
					performance.now() - lastPedalingAt.current <= RECORDING_PAUSE_DELAY_MS
			);
		} else {
			setManuallyPaused(true);
			setIsRiding(false);
		}
	}, [lastPedalingAt, manuallyPaused]);

	const reset = useCallback(() => {
		elapsedRef.current = 0;
		lastTrainerDistance.current = latestMetrics.current.distance;
		setElapsedSeconds(0);
		setRideDistance(0);
		setRideCalories(0);
		setHistory([]);
		setMaximums(emptyMetrics);
		setAggregates(emptySession.aggregates);
		localStorage.removeItem('trainer-session');
	}, []);

	return {
		aggregates,
		elapsedSeconds,
		history,
		isRiding,
		manuallyPaused,
		maximums,
		reset,
		rideCalories,
		rideDistance,
		togglePause,
	};
}
