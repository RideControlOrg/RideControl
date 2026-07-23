import {
	useBodyScrollLock,
	useCloseOnEscape,
	useDialogInitialFocus,
} from '../hooks/use-dialog-behavior';
import {
	BUILD_PR_URL,
	BUILD_RECENT_PULL_REQUESTS,
	BUILD_TIMESTAMP_UTC,
	type BuildPullRequest,
	formatBuildIdentifier,
	formatBuildPullRequestDate,
	formatBuildTimestamp,
} from '../lib/build-info';

const BUILD_LABEL_PREFIX = /^Build: /;

export function BuildDetailsDialog({
	onClose,
	open,
	pullRequests = BUILD_RECENT_PULL_REQUESTS,
}: {
	onClose: () => void;
	open: boolean;
	pullRequests?: BuildPullRequest[];
}) {
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	useCloseOnEscape(open, onClose);
	useBodyScrollLock(open);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/65 p-3 backdrop-blur-sm sm:p-4">
			<section
				aria-describedby="build-details-description"
				aria-labelledby="build-details-title"
				aria-modal="true"
				className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/50 sm:max-h-[calc(100dvh-2rem)]"
				role="dialog"
			>
				<header className="flex shrink-0 items-start justify-between gap-4 border-line border-b px-5 py-4 sm:px-6">
					<h2 className="font-bold text-2xl" id="build-details-title">
						Version details
					</h2>
					<button
						aria-label="Close version details"
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						×
					</button>
				</header>

				<div
					className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6"
					id="build-details-description"
				>
					<dl className="overflow-hidden rounded-xl border border-line bg-[#10151a]">
						<div className="border-line border-b px-4 py-3">
							<dt className="font-bold text-[10px] text-slate-500 uppercase tracking-[.14em]">
								Build ID
							</dt>
							<dd className="mt-1 font-mono font-semibold text-mint text-sm">
								{formatBuildIdentifier(BUILD_TIMESTAMP_UTC)}
							</dd>
						</div>
						<div className="border-line border-b px-4 py-3">
							<dt className="font-bold text-[10px] text-slate-500 uppercase tracking-[.14em]">
								Built
							</dt>
							<dd className="mt-1 font-semibold text-slate-200 text-sm">
								{formatBuildTimestamp(BUILD_TIMESTAMP_UTC).replace(
									BUILD_LABEL_PREFIX,
									''
								)}
							</dd>
						</div>
						<div className="px-4 py-3">
							<dt className="font-bold text-[10px] text-slate-500 uppercase tracking-[.14em]">
								UTC timestamp
							</dt>
							<dd className="mt-1 break-all font-mono text-slate-300 text-xs">
								{BUILD_TIMESTAMP_UTC}
							</dd>
						</div>
					</dl>

					<a
						className="flex w-full items-center justify-between gap-3 rounded-lg border border-mint/35 bg-mint/10 px-4 py-3 font-bold text-mint text-sm transition hover:border-mint hover:bg-mint/15"
						href={BUILD_PR_URL}
						rel="noreferrer"
						target="_blank"
					>
						<span>View source build on GitHub</span>
						<span aria-hidden="true">↗</span>
					</a>

					<section aria-labelledby="recent-build-changes-title">
						<div className="mb-3 flex items-end justify-between gap-3">
							<h3 className="font-bold text-base" id="recent-build-changes-title">
								Recent changes
							</h3>
							{pullRequests.length > 0 ? (
								<span className="text-slate-500 text-xs">
									{pullRequests.length === 1
										? 'Latest merged PR'
										: `Last ${pullRequests.length} merged PRs`}
								</span>
							) : null}
						</div>
						{pullRequests.length > 0 ? (
							<ol className="overflow-hidden rounded-xl border border-line bg-[#10151a]">
								{pullRequests.map((pullRequest) => (
									<li
										className="border-line border-b last:border-b-0"
										key={pullRequest.number}
									>
										<a
											className="block px-4 py-3 transition hover:bg-slate-800/60"
											href={pullRequest.url}
											rel="noreferrer"
											target="_blank"
										>
											<span className="block font-semibold text-slate-200 text-sm leading-5">
												{pullRequest.title}
											</span>
											<span className="mt-1 block text-slate-500 text-xs">
												#{pullRequest.number} ·{' '}
												<time dateTime={pullRequest.mergedAt}>
													{formatBuildPullRequestDate(
														pullRequest.mergedAt
													)}
												</time>
											</span>
										</a>
									</li>
								))}
							</ol>
						) : (
							<p className="rounded-xl border border-line bg-[#10151a] px-4 py-3 text-slate-400 text-sm">
								Recent pull requests are included in production builds.
							</p>
						)}
					</section>
				</div>
			</section>
		</div>
	);
}
