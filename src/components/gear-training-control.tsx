import { virtualGearCombination, virtualGearLoadMultiplier } from '../lib/gears';
import type { VirtualDrivetrain } from '../lib/profile';
import type { ResistanceAdjustmentDirection } from '../types';
import { GearControl } from './gear-control';
import { TrainingControlPanel } from './training-control-panel';

export function GearTrainingControl({
	connected,
	drivetrain,
	gear,
	maximumGear,
	onShift,
	shiftFlash,
}: {
	connected: boolean;
	drivetrain: VirtualDrivetrain;
	gear: number;
	maximumGear: number;
	onShift: (change: number) => void;
	shiftFlash?: ResistanceAdjustmentDirection;
}) {
	const combination = virtualGearCombination(gear, drivetrain);
	const loadMultiplier = virtualGearLoadMultiplier(gear, drivetrain);
	const gearDetail = combination
		? `${combination.chainringTeeth}/${combination.cassetteTeeth} · ${combination.ratio.toFixed(2)}:1`
		: '—';
	return (
		<TrainingControlPanel
			detail={`${gearDetail} · ${loadMultiplier.toFixed(2)}× load`}
			title="Virtual shifting"
			unit={`of ${maximumGear}`}
			value={gear}
		>
			<GearControl
				disabled={!connected}
				gear={gear}
				maximumGear={maximumGear}
				onChange={onShift}
				shiftFlash={shiftFlash}
			/>
		</TrainingControlPanel>
	);
}
