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

const BUILD_LABEL_PREFIX = /^Build: /u;

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
				className="bg-panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-600 shadow-2xl shadow-black/50 sm:max-h-[calc(100dvh-2rem)]"
				role="dialog"
			>
				<header className="border-line flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
					<h2 className="text-2xl font-bold" id="build-details-title">
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
					<dl className="border-line overflow-hidden rounded-xl border bg-[#10151a]">
						<div className="border-line border-b px-4 py-3">
							<dt className="text-[10px] font-bold tracking-[.14em] text-slate-500 uppercase">
								Build ID
							</dt>
							<dd className="text-mint mt-1 font-mono text-sm font-semibold">
								{formatBuildIdentifier(BUILD_TIMESTAMP_UTC)}
							</dd>
						</div>
						<div className="border-line border-b px-4 py-3">
							<dt className="text-[10px] font-bold tracking-[.14em] text-slate-500 uppercase">
								Built
							</dt>
							<dd className="mt-1 text-sm font-semibold text-slate-200">
								{formatBuildTimestamp(BUILD_TIMESTAMP_UTC).replace(
									BUILD_LABEL_PREFIX,
									''
								)}
							</dd>
						</div>
						<div className="px-4 py-3">
							<dt className="text-[10px] font-bold tracking-[.14em] text-slate-500 uppercase">
								UTC timestamp
							</dt>
							<dd className="mt-1 font-mono text-xs break-all text-slate-300">
								{BUILD_TIMESTAMP_UTC}
							</dd>
						</div>
					</dl>

					<a
						className="border-mint/35 bg-mint/10 text-mint hover:border-mint hover:bg-mint/15 flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-bold transition"
						href={BUILD_PR_URL}
						rel="noreferrer"
						target="_blank"
					>
						<span>View source build on GitHub</span>
						<span aria-hidden="true">↗</span>
					</a>

					<section aria-labelledby="recent-build-changes-title">
						<div className="mb-3 flex items-end justify-between gap-3">
							<h3 className="text-base font-bold" id="recent-build-changes-title">
								Recent changes
							</h3>
							{pullRequests.length > 0 ? (
								<span className="text-xs text-slate-500">
									{pullRequests.length === 1
										? 'Latest merged PR'
										: `Last ${pullRequests.length} merged PRs`}
								</span>
							) : null}
						</div>
						{pullRequests.length > 0 ? (
							<ol className="border-line overflow-hidden rounded-xl border bg-[#10151a]">
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
											<span className="block text-sm leading-5 font-semibold text-slate-200">
												{pullRequest.title}
											</span>
											<span className="mt-1 block text-xs text-slate-500">
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
							<p className="border-line rounded-xl border bg-[#10151a] px-4 py-3 text-sm text-slate-400">
								Recent pull requests are included in production builds.
							</p>
						)}
					</section>
				</div>
			</section>
		</div>
	);
}
