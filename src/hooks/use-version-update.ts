import { useEffect, useState } from 'react';
import { BUILD_TIMESTAMP_UTC } from '../lib/build-info';
import {
	deploymentVersionChanged,
	deploymentVersionCheckDue,
	fetchDeploymentVersion,
	VERSION_CHECK_INTERVAL_MS,
} from '../lib/version-update';

export function useVersionUpdateAvailable(): boolean {
	const [updateAvailable, setUpdateAvailable] = useState(false);

	useEffect(() => {
		if (import.meta.env.DEV) {
			return;
		}

		let checkInProgress = false;
		let updateFound = false;
		let lastCheckedAt: number | undefined;

		const checkForUpdate = async () => {
			const checkedAt = Date.now();
			if (
				checkInProgress ||
				updateFound ||
				!deploymentVersionCheckDue(lastCheckedAt, checkedAt)
			) {
				return;
			}
			lastCheckedAt = checkedAt;
			checkInProgress = true;
			const deployedVersion = await fetchDeploymentVersion().finally(() => {
				checkInProgress = false;
			});
			if (deployedVersion && deploymentVersionChanged(BUILD_TIMESTAMP_UTC, deployedVersion)) {
				updateFound = true;
				setUpdateAvailable(true);
			}
		};

		const interval = window.setInterval(() => {
			checkForUpdate().catch(() => undefined);
		}, VERSION_CHECK_INTERVAL_MS);
		const checkWhenVisible = () => {
			if (document.visibilityState === 'visible') {
				checkForUpdate().catch(() => undefined);
			}
		};

		checkForUpdate().catch(() => undefined);
		document.addEventListener('visibilitychange', checkWhenVisible);
		return () => {
			window.clearInterval(interval);
			document.removeEventListener('visibilitychange', checkWhenVisible);
		};
	}, []);

	return updateAvailable;
}
