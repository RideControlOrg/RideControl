import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const buildTimestampUtc = process.env.VITE_BUILD_TIMESTAMP ?? new Date().toISOString();
const buildPrUrl =
	process.env.VITE_BUILD_PR_URL ??
	'https://github.com/RideControlOrg/RideControl/pulls?q=is%3Apr+is%3Aclosed';

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 550,
	},
	define: {
		'import.meta.env.RIDE_CONTROL_BUILD_PR_URL': JSON.stringify(buildPrUrl),
		'import.meta.env.RIDE_CONTROL_BUILD_TIMESTAMP_UTC': JSON.stringify(buildTimestampUtc),
	},
	plugins: [react(), tailwindcss(), cloudflare()],
});
