interface ImportMetaEnv {
	readonly RIDE_CONTROL_BUILD_PR_URL: string;
	readonly RIDE_CONTROL_BUILD_TIMESTAMP_UTC: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
