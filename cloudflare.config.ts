import { defineConfig } from 'cf/config';

export default defineConfig({
	accountId: 'c1e6e1378d9461aa07039950b1bf8b89',
	worker: {
		assets: {
			notFoundHandling: 'single-page-application',
		},
		compatibilityDate: '2026-07-21',
		domains: ['ridecontrol.xyz'],
		name: 'ridecontrol-frontend',
		observability: {
			enabled: true,
			logs: {
				enabled: true,
				headSamplingRate: 1,
				invocationLogs: true,
				persist: true,
			},
		},
		workersDev: false,
	},
});
