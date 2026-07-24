import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

interface TabOption<T extends string> {
	label: string;
	value: T;
}

export function Tabs<T extends string>({
	ariaLabel,
	idPrefix,
	onChange,
	options,
	value,
}: {
	ariaLabel: string;
	idPrefix: string;
	onChange: (value: T) => void;
	options: readonly TabOption<T>[];
	value: T;
}) {
	const selectFromKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, currentValue: T) => {
		const currentIndex = options.findIndex((option) => option.value === currentValue);
		if (currentIndex < 0) {
			return;
		}
		let nextIndex: number | undefined;
		switch (event.key) {
			case 'ArrowLeft':
				nextIndex = (currentIndex - 1 + options.length) % options.length;
				break;
			case 'ArrowRight':
				nextIndex = (currentIndex + 1) % options.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = options.length - 1;
				break;
			default:
				return;
		}
		const nextValue = options[nextIndex]?.value;
		if (!nextValue) {
			return;
		}
		event.preventDefault();
		onChange(nextValue);
		event.currentTarget.ownerDocument.getElementById(`${idPrefix}-tab-${nextValue}`)?.focus();
	};

	return (
		<div
			aria-label={ariaLabel}
			className="scrollbar-hidden flex shrink-0 items-end gap-5 overflow-x-auto overflow-y-hidden border-line border-b bg-[#12171d] px-3 sm:px-5"
			role="tablist"
		>
			{options.map((option) => (
				<button
					aria-controls={`${idPrefix}-panel-${option.value}`}
					aria-selected={value === option.value}
					className={`-mb-px shrink-0 border-b-2 px-1 py-3 font-semibold text-sm transition ${
						value === option.value
							? 'border-cyan-400 text-white'
							: 'border-transparent text-slate-400 hover:border-slate-600 hover:text-white'
					}`}
					id={`${idPrefix}-tab-${option.value}`}
					key={option.value}
					onClick={() => onChange(option.value)}
					onKeyDown={(event) => selectFromKeyboard(event, option.value)}
					role="tab"
					tabIndex={value === option.value ? 0 : -1}
					type="button"
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
