import type { ReactNode } from 'react';

export function TrainingControlPanel({
	children,
	detail,
	title,
	unit,
	value,
}: {
	children: ReactNode;
	detail?: ReactNode;
	title: string;
	unit: string;
	value: number;
}) {
	return (
		<div className="bg-ink w-full min-w-0 p-4 sm:p-5">
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-lg font-bold">{title}</h2>
				<div className="text-right">
					<output className="text-mint text-3xl font-bold tracking-tight tabular-nums">
						{value}
						<span className="ml-1 text-xs text-slate-500">{unit}</span>
					</output>
					{detail ? (
						<div className="mt-0.5 text-xs font-medium whitespace-nowrap text-slate-400 tabular-nums">
							{detail}
						</div>
					) : null}
				</div>
			</div>
			{children}
		</div>
	);
}
