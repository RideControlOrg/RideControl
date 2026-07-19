import type { ResistanceAdjustmentDirection, ResistanceRamp } from '../types';
import { GearTrainingControl } from './gear-training-control';
import { ResistanceTrainingControl } from './resistance-training-control';

type TrainingControlModel =
	| {
			gear: number;
			mode: 'gear';
			onShift: (change: number) => void;
			shiftFlash?: ResistanceAdjustmentDirection;
	  }
	| {
			keyboardFlash?: ResistanceAdjustmentDirection;
			mode: 'resistance';
			onChange: (resistance: number) => void;
			ramp: ResistanceRamp;
			resistance: number;
	  };

export function TrainingControl({
	connected,
	control,
}: {
	connected: boolean;
	control: TrainingControlModel;
}) {
	if (control.mode === 'gear') {
		return (
			<GearTrainingControl
				connected={connected}
				gear={control.gear}
				onShift={control.onShift}
				shiftFlash={control.shiftFlash}
			/>
		);
	}

	return (
		<ResistanceTrainingControl
			connected={connected}
			keyboardFlash={control.keyboardFlash}
			onChange={control.onChange}
			ramp={control.ramp}
			resistance={control.resistance}
		/>
	);
}
