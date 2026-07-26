export const METRIC_PRESENTATION = {
	cadence: {
		accent: 'violet',
		chartColor: 'var(--metric-cadence)',
		chartMinimumMaximum: 80,
		chartStep: 10,
		dashboardUnit: 'rpm',
		icon: 'cadence',
		label: 'Cadence',
		unit: 'rpm',
	},
	heartRate: {
		accent: 'rose',
		chartColor: 'var(--metric-heart-rate)',
		chartMinimumMaximum: 180,
		chartStep: 10,
		dashboardUnit: 'bpm',
		icon: 'heart',
		label: 'Heart rate',
		unit: 'bpm',
	},
	power: {
		accent: 'yellow',
		chartColor: 'var(--metric-power)',
		chartMinimumMaximum: 100,
		chartStep: 50,
		dashboardUnit: 'watts',
		icon: 'bolt',
		label: 'Power',
		unit: 'W',
	},
	speed: {
		accent: 'sky',
		chartColor: 'var(--metric-speed)',
		icon: 'speed',
		label: 'Speed',
	},
} as const;

export const STANDARD_METRIC_KEYS = ['power', 'cadence', 'heartRate'] as const;

export const ELEVATION_METRIC_PRESENTATION = {
	chartColor: 'var(--metric-elevation)',
	label: 'Elevation',
} as const;

export const GEAR_METRIC_PRESENTATION = {
	chartColor: 'var(--metric-gear)',
	label: 'Gear',
} as const;

export const GRADE_METRIC_PRESENTATION = {
	chartColor: 'var(--metric-grade)',
	label: 'Grade',
	unit: '%',
} as const;

export const RESISTANCE_METRIC_PRESENTATION = {
	chartColor: 'var(--metric-resistance)',
	label: 'Resistance',
	unit: '%',
} as const;

export function metricAccentClass(accent: string): string {
	if (accent === 'sky') {
		return 'bg-sky-400';
	}
	if (accent === 'yellow') {
		return 'bg-yellow-400';
	}
	if (accent === 'violet') {
		return 'bg-violet-400';
	}
	if (accent === 'rose') {
		return 'bg-rose-400';
	}
	return 'bg-mint';
}

export function metricIconClass(accent: string): string {
	if (accent === 'mint') {
		return 'text-mint';
	}
	if (accent === 'yellow') {
		return 'text-yellow-400';
	}
	if (accent === 'violet') {
		return 'text-violet-400';
	}
	if (accent === 'rose') {
		return 'text-rose-400';
	}
	return 'text-sky-400';
}
