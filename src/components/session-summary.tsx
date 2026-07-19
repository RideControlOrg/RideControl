import { formatDuration, formatWholeNumber } from '../lib/format';
import { formatDistance } from '../lib/units';
import type { SpeedUnit } from '../types';
import { SmallMetric } from './metrics';

export function SessionSummary({
	calories,
	distance,
	elapsedSeconds,
	large = false,
	speedUnit,
	timeLabel = 'TIME',
}: {
	calories: number;
	distance: number;
	elapsedSeconds: number;
	large?: boolean;
	speedUnit: SpeedUnit;
	timeLabel?: string;
}) {
	return (
		<>
			<SmallMetric label={timeLabel} large={large} value={formatDuration(elapsedSeconds)} />
			<SmallMetric
				label="DISTANCE"
				large={large}
				value={formatDistance(distance, speedUnit)}
			/>
			<SmallMetric
				label="CALORIES"
				large={large}
				value={`${formatWholeNumber(calories)} kcal`}
			/>
		</>
	);
}
