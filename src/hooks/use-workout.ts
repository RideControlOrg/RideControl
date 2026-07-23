import { useEffect, useRef } from 'react';

const AUTOMATED_RESISTANCE_DEADBAND = 0.5;

export function useWorkoutResistance({
	active,
	connected,
	onResistanceChange,
	onRestoreResistance,
	resistance,
}: {
	active: boolean;
	connected: boolean;
	onResistanceChange: (resistance: number) => void;
	onRestoreResistance: () => void;
	resistance?: number;
}) {
	const automatedResistance = useRef(false);
	const lastAutomatedResistance = useRef<number | undefined>(undefined);

	useEffect(() => {
		if (active && connected && resistance !== undefined) {
			if (
				lastAutomatedResistance.current === undefined ||
				Math.abs(resistance - lastAutomatedResistance.current) >=
					AUTOMATED_RESISTANCE_DEADBAND
			) {
				onResistanceChange(resistance);
				lastAutomatedResistance.current = resistance;
			}
			automatedResistance.current = true;
		} else if (
			automatedResistance.current &&
			connected &&
			(!active || resistance === undefined)
		) {
			onRestoreResistance();
			automatedResistance.current = false;
			lastAutomatedResistance.current = undefined;
		} else if (!connected) {
			automatedResistance.current = false;
			lastAutomatedResistance.current = undefined;
		}
	}, [active, connected, onResistanceChange, onRestoreResistance, resistance]);
}
