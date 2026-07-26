import { useForm } from '@tanstack/react-form';
import { useCallback, useEffect } from 'react';
import { useBodyScrollLock, useCloseOnEscape } from '../hooks/use-dialog-behavior';
import { isTestedChromeBrowser } from '../lib/browser';
import { emptyWelcomeFormValues, welcomeFormSchema } from '../lib/welcome-form';

export function WelcomeDialog({
	onClose,
	open,
	testedChromeBrowser = isTestedChromeBrowser(globalThis.navigator),
}: {
	onClose: (dontShowAgain: boolean) => void;
	open: boolean;
	testedChromeBrowser?: boolean;
}) {
	const form = useForm({
		defaultValues: emptyWelcomeFormValues(),
		onSubmit: ({ value }) => {
			const validated = welcomeFormSchema.parse(value);
			onClose(validated.dontShowAgain);
		},
		validators: {
			onChange: welcomeFormSchema,
			onSubmit: welcomeFormSchema,
		},
	});
	const closeFromEscape = useCallback(
		() => onClose(form.state.values.dontShowAgain),
		[form, onClose]
	);
	useCloseOnEscape(open, closeFromEscape);
	useBodyScrollLock(open);

	useEffect(() => {
		if (open) {
			form.reset(emptyWelcomeFormValues());
		}
	}, [form, open]);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
			<form
				aria-describedby="welcome-description"
				aria-labelledby="welcome-title"
				aria-modal="true"
				className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto border border-slate-600 bg-panel p-6 shadow-2xl shadow-black/50 sm:p-8"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					form.handleSubmit();
				}}
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="font-bold text-4xl tracking-tight" id="welcome-title">
						Welcome to RideControl.xyz
					</h2>
					<button
						aria-label="Close welcome message"
						className="grid h-10 w-10 place-items-center text-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={closeFromEscape}
						type="button"
					>
						×
					</button>
				</div>

				{testedChromeBrowser ? null : (
					<p className="mt-5 border border-amber-300/35 bg-amber-300/10 px-4 py-3.5 text-amber-100 text-lg leading-8">
						Ride Control is only tested with the latest version of Google Chrome and may
						not work correctly in other browsers.{' '}
						<a
							className="font-bold text-amber-100 underline decoration-amber-200/50 underline-offset-2 hover:decoration-amber-100"
							href="https://www.google.com/chrome/"
							rel="noreferrer"
							target="_blank"
						>
							Download it
						</a>
						.
					</p>
				)}
				<p className="mt-5 text-lg text-slate-300 leading-8" id="welcome-description">
					Pair your trainer, heart rate monitor, and Zwift Click over Bluetooth, then
					adjust resistance or shift virtual gears while keeping detailed records of every
					ride—all from your browser.
				</p>
				<p className="mt-4 text-lg text-slate-400 leading-8">
					Ride Control is a freely available, open-source GPLv3 application. View the{' '}
					<a
						className="font-semibold text-mint underline decoration-mint/40 underline-offset-2 hover:decoration-mint"
						href="https://github.com/RideControlOrg/RideControl"
						rel="noreferrer"
						target="_blank"
					>
						source code on GitHub
					</a>
					.
				</p>
				<p className="mt-3 text-lg text-slate-400 leading-8">
					Ride Control runs locally, and your ride data stays in your browser. In the
					future, we plan to offer optional paid cloud storage and synchronization.
				</p>
				<p className="mt-3 text-lg text-slate-400 leading-8">
					From Sessions, you can download your rides as Strava-compatible FIT files or
					richer Ride Control TCX files, then upload them to your preferred cycling
					service.
				</p>
				<div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<form.Field name="dontShowAgain">
						{(field) => (
							<label className="inline-flex cursor-pointer items-center gap-3 text-lg text-slate-300">
								<input
									checked={field.state.value}
									className="h-5 w-5 accent-mint"
									onChange={(event) => field.handleChange(event.target.checked)}
									type="checkbox"
								/>
								Don't show again
							</label>
						)}
					</form.Field>
					<button
						className="h-13 min-w-44 border border-mint/60 bg-mint/10 px-7 font-bold text-lg text-mint transition hover:border-mint hover:bg-mint/15"
						type="submit"
					>
						Get started
					</button>
				</div>
			</form>
		</div>
	);
}
