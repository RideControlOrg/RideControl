export const TCX_NAMESPACE = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
export const TCX_ACTIVITY_EXTENSION_NAMESPACE =
	'http://www.garmin.com/xmlschemas/ActivityExtension/v2';
const RIDECONTROL_TCX_EXTENSION_NAMESPACE_PATH = '/RideControl/xmlschemas/ActivityExtension/v1';
export const RIDECONTROL_TCX_EXTENSION_NAMESPACE = `https://github.com/RideControlOrg${RIDECONTROL_TCX_EXTENSION_NAMESPACE_PATH}`;
export const IMPORTED_TCX_ID_PREFIX = 'tcx:';

export function isRideControlTcxExtensionNamespace(namespace: string | null) {
	if (!namespace) {
		return false;
	}
	try {
		const url = new URL(namespace);
		return (
			url.protocol === 'https:' &&
			url.hostname === 'github.com' &&
			url.pathname.endsWith(RIDECONTROL_TCX_EXTENSION_NAMESPACE_PATH)
		);
	} catch {
		return false;
	}
}
