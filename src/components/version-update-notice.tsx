import { useVersionUpdateAvailable } from '../hooks/use-version-update';

export function VersionUpdateNotice({ onReload }: { onReload: () => void }) {
	return (
		<section
			className="mb-4 flex flex-col gap-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-slate-200 text-sm sm:flex-row sm:items-center"
			role="status"
		>
			<div className="min-w-0 flex-1">
				<p className="font-semibold text-white">A new Ride Control version is available.</p>
				<p className="mt-0.5 text-slate-300 leading-5">
					Reload when convenient to use the latest version.
				</p>
			</div>
			<button
				className="h-9 shrink-0 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-4 font-semibold text-cyan-100 hover:bg-cyan-300/20"
				onClick={onReload}
				type="button"
			>
				Reload now
			</button>
		</section>
	);
}

export function DeploymentVersionUpdateNotice() {
	const updateAvailable = useVersionUpdateAvailable();
	return updateAvailable ? (
		<VersionUpdateNotice onReload={() => window.location.reload()} />
	) : null;
}
