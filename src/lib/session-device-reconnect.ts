export interface RememberedSessionDeviceConnection {
	busy: boolean;
	connected: boolean;
	paired: boolean;
	reconnect: () => void;
}

export interface SessionDeviceReconnectController {
	reconnectForSession: (
		startedAt: number,
		ended: boolean,
		connections: readonly RememberedSessionDeviceConnection[]
	) => number;
}

export function reconnectDisconnectedSessionDevices(
	connections: readonly RememberedSessionDeviceConnection[]
): number {
	let reconnectCount = 0;
	for (const connection of connections) {
		if (!(connection.paired && !connection.connected && !connection.busy)) {
			continue;
		}
		connection.reconnect();
		reconnectCount += 1;
	}
	return reconnectCount;
}

export function createSessionDeviceReconnectController(): SessionDeviceReconnectController {
	let lastSessionStartedAt: number | undefined;
	return {
		reconnectForSession: (startedAt, ended, connections) => {
			if (ended || lastSessionStartedAt === startedAt) {
				return 0;
			}
			lastSessionStartedAt = startedAt;
			return reconnectDisconnectedSessionDevices(connections);
		},
	};
}
