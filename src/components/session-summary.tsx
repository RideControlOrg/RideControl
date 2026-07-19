import { formatDuration, formatWholeNumber } from '../lib/format';
import { formatDistance } from '../lib/units';
import type { SpeedUnit } from '../types';
import { SmallMetric } from './metrics';

export function SessionSummary({
	calories,
	distance,
	elapsedSeconds,
	speedUnit,
	timeLabel = 'TIME',
}: {
	calories: number;
	distance: number;
	elapsedSeconds: number;
	speedUnit: SpeedUnit;
	timeLabel?: string;
}) {
	return (
		<>
			<SmallMetric label={timeLabel} value={formatDuration(elapsedSeconds)} />
			<SmallMetric label="DISTANCE" value={formatDistance(distance, speedUnit)} />
			<SmallMetric label="CALORIES" value={`${formatWholeNumber(calories)} kcal`} />
		</>
	);
}
