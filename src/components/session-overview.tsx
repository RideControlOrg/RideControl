import { EMPTY_ROUTE } from '../constants';
import type { ControlMode, MetricSample, SessionWorkout, SpeedUnit } from '../types';
import { SessionChart } from './session-chart';

export function SessionOverview({
	controlMode,
	history,
	keyboardEnabled,
	speedUnit,
	workout,
}: {
	controlMode: ControlMode;
	history: MetricSample[];
	keyboardEnabled: boolean;
	speedUnit: SpeedUnit;
	workout?: SessionWorkout;
}) {
	return (
		<SessionChart
			controlMode={controlMode}
			history={history}
			keyboardEnabled={keyboardEnabled}
			route={workout ? workout.course.points : EMPTY_ROUTE}
			speedUnit={speedUnit}
		/>
	);
}
