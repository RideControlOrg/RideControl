import { BUILD_TIMESTAMP_UTC, formatBuildTimestamp } from '../lib/build-info';
import type { UiTheme } from '../lib/theme';
import { UI_THEME } from '../lib/theme';

const linkClass =
	'border-0 bg-transparent px-0 py-1 transition hover:text-slate-100 focus-visible:outline-1 focus-visible:outline-mint focus-visible:outline-offset-2';

export function AppFooter({
	onChangeTheme,
	onOpenPrivacy,
	onOpenTerms,
	onOpenVersion,
	onOpenWelcome,
	theme,
}: {
	onChangeTheme: (theme: UiTheme) => void;
	onOpenPrivacy: () => void;
	onOpenTerms: () => void;
	onOpenVersion: () => void;
	onOpenWelcome: () => void;
	theme: UiTheme;
}) {
	const nextTheme = theme === UI_THEME.DARK ? UI_THEME.LIGHT : UI_THEME.DARK;
	return (
		<footer className="mt-auto w-full border-line border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-slate-500 text-xs sm:px-8">
			<div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-x-5 gap-y-2">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
					<button
						className={`${linkClass} font-semibold tracking-wide`}
						onClick={onOpenWelcome}
						type="button"
					>
						Ride Control
					</button>
					<a
						className={linkClass}
						href="https://github.com/sponsors/lookfirst"
						rel="noreferrer"
						target="_blank"
					>
						Sponsor
					</a>
					<a className={linkClass} href="mailto:hello@ridecontrol.xyz">
						Contact
					</a>
					<button className={linkClass} onClick={onOpenPrivacy} type="button">
						Privacy
					</button>
					<button className={linkClass} onClick={onOpenTerms} type="button">
						Terms
					</button>
					<a
						className={linkClass}
						href="https://github.com/RideControlOrg/RideControl"
						rel="noreferrer"
						target="_blank"
					>
						GitHub
					</a>
					<button
						className={linkClass}
						onClick={onOpenVersion}
						title={formatBuildTimestamp(BUILD_TIMESTAMP_UTC).replace('Build: ', '')}
						type="button"
					>
						Version
					</button>
				</div>
				<button
					aria-label={`Use ${nextTheme} mode`}
					className="border border-line bg-panel px-3 py-1.5 font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-100"
					onClick={() => onChangeTheme(nextTheme)}
					type="button"
				>
					{nextTheme === UI_THEME.LIGHT ? 'Light mode' : 'Dark mode'}
				</button>
			</div>
		</footer>
	);
}
