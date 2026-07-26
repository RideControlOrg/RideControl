import { Children, type ReactNode } from 'react';

export function Dashboard({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-3 py-3 sm:px-8 sm:py-5">
			{children}
		</div>
	);
}

export function DashboardToolbar({ children }: { children: ReactNode }) {
	return (
		<header className="mb-3 flex flex-wrap items-center justify-between gap-2">
			{children}
		</header>
	);
}

export function DashboardWorkspace({ children }: { children: ReactNode }) {
	const columns = Children.toArray(children).length > 1 ? 'xl:grid-cols-[1.45fr_.55fr]' : '';
	return <section className={`mt-3 grid min-w-0 gap-3 *:min-w-0 ${columns}`}>{children}</section>;
}
