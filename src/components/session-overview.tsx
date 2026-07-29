import { EMPTY_ROUTE } from '../constants';
import type { ControlMode, MetricSample, SessionWorkout, SpeedUnit } from '../types';
import { SessionChart } from './session-chart';

export function SessionOverview({
	controlMode,
	history,
	keyboardEnabled,
	onInspectSample,
	speedUnit,
	workout,
}: {
	controlMode: ControlMode;
	history: MetricSample[];
	keyboardEnabled: boolean;
	onInspectSample?: (sample: MetricSample | undefined) => void;
	speedUnit: SpeedUnit;
	workout?: SessionWorkout;
}) {
	return (
		<SessionChart
			controlMode={controlMode}
			history={history}
			keyboardEnabled={keyboardEnabled}
			onInspectSample={onInspectSample}
			route={workout ? workout.course.points : EMPTY_ROUTE}
			speedUnit={speedUnit}
		/>
	);
}
