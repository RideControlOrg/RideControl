export interface Metrics {
	cadence: number;
	calories: number;
	distance: number;
	heartRate: number;
	power: number;
	speed: number;
}

export interface RoutePoint {
	distance: number;
	elevation: number;
}

export interface Range {
	max: number;
	min: number;
}

export interface MetricSample {
	cadence: number;
	elapsedSeconds: number;
	heartRate: number;
	power: number;
	speed: number;
}

export interface MetricAggregate {
	count: number;
	sum: number;
}

export interface SessionAggregates {
	cadence: MetricAggregate;
	heartRate: MetricAggregate;
	power: MetricAggregate;
}

export interface StoredSession {
	aggregates: SessionAggregates;
	calories: number;
	distance: number;
	elapsedSeconds: number;
	history: MetricSample[];
	maximums: Metrics;
}

export type ChartMode = 'all' | 'cadence' | 'elevation' | 'heartRate' | 'power' | 'speed';

export type SpeedUnit = 'kmh' | 'mph';
