import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from 'react';

interface SelectMenuOption<T extends string> {
	label: string;
	value: T;
}

export function SelectMenu<T extends string>({
	align = 'start',
	ariaLabel,
	disabled = false,
	onChange,
	options,
	size = 'default',
	triggerClassName = '',
	value,
	width = 'default',
}: {
	align?: 'end' | 'start';
	ariaLabel: string;
	disabled?: boolean;
	onChange: (value: T) => void;
	options: readonly SelectMenuOption<T>[];
	size?: 'compact' | 'default';
	triggerClassName?: string;
	value: T;
	width?: 'compact' | 'content' | 'default' | 'full';
}) {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const listboxId = useId();
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const selectedIndex = Math.max(
		0,
		options.findIndex((option) => option.value === value)
	);
	const selectedOption = options[selectedIndex];

	useEffect(() => {
		if (!open) {
			return;
		}
		const closeOutside = (event: PointerEvent) => {
			const currentRoot = root.current;
			if (currentRoot && !event.composedPath().includes(currentRoot)) {
				setOpen(false);
			}
		};
		document.addEventListener('pointerdown', closeOutside);
		return () => document.removeEventListener('pointerdown', closeOutside);
	}, [open]);

	const openMenu = () => {
		setActiveIndex(selectedIndex);
		setOpen(true);
	};
	const selectOption = (index: number) => {
		const option = options[index];
		if (option) {
			onChange(option.value);
		}
		setOpen(false);
		trigger.current?.focus();
	};
	const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				event.stopPropagation();
				if (!open) {
					openMenu();
					return;
				}
				setActiveIndex((current) => (current + 1) % options.length);
				return;
			case 'ArrowUp':
				event.preventDefault();
				event.stopPropagation();
				if (!open) {
					openMenu();
					return;
				}
				setActiveIndex((current) => (current - 1 + options.length) % options.length);
				return;
			case 'Home':
				event.preventDefault();
				event.stopPropagation();
				setActiveIndex(0);
				setOpen(true);
				return;
			case 'End':
				event.preventDefault();
				event.stopPropagation();
				setActiveIndex(options.length - 1);
				setOpen(true);
				return;
			case 'Enter':
			case ' ':
				event.preventDefault();
				event.stopPropagation();
				if (open) {
					selectOption(activeIndex);
				} else {
					openMenu();
				}
				return;
			case 'Escape':
				if (open) {
					event.preventDefault();
					event.stopPropagation();
					setOpen(false);
				}
				return;
			case 'Tab':
				setOpen(false);
				return;
			default:
		}
	};

	const widthClass = {
		compact: 'w-16 shrink-0',
		content: 'w-max min-w-0',
		default: 'min-w-44',
		full: 'w-full min-w-0',
	}[width];
	const sizeClass = size === 'compact' ? 'h-9 gap-2 px-2' : 'h-10 gap-3 px-3';

	return (
		<div
			className={`relative ${open ? 'z-50' : ''} ${widthClass}`}
			data-select-menu="true"
			ref={root}
		>
			<button
				aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
				aria-controls={listboxId}
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-label={ariaLabel}
				className={`flex w-full items-center justify-between border border-line bg-[#12171d] font-semibold text-slate-200 text-xs outline-none focus-visible:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass} ${triggerClassName}`}
				disabled={disabled || options.length === 0}
				onClick={() => {
					if (open) {
						setOpen(false);
					} else {
						openMenu();
					}
				}}
				onKeyDown={handleKeyDown}
				ref={trigger}
				role="combobox"
				type="button"
			>
				<span className="whitespace-nowrap">{selectedOption?.label ?? value}</span>
				<svg
					aria-hidden="true"
					className="h-4 w-4 shrink-0 text-slate-500"
					data-select-menu-chevron="true"
					fill="none"
					stroke="currentColor"
					strokeLinecap="square"
					strokeLinejoin="miter"
					strokeWidth="1.75"
					viewBox="0 0 12 8"
				>
					<path d="m2 2 4 4 4-4" />
				</svg>
			</button>
			<div
				aria-label={ariaLabel}
				className={`absolute top-full z-50 mt-px max-h-80 w-max min-w-full overflow-y-auto border border-line bg-panel p-1 ${
					align === 'end' ? 'right-0' : 'left-0'
				}`}
				hidden={!open}
				id={listboxId}
				role="listbox"
			>
				{options.map((option, index) => {
					const selected = option.value === value;
					return (
						<button
							aria-selected={selected}
							className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-medium text-xs outline-none ${
								index === activeIndex
									? 'bg-slate-700 text-(--content-strong)'
									: 'text-slate-300 hover:bg-slate-800 hover:text-(--content-strong)'
							}`}
							id={`${listboxId}-option-${index}`}
							key={option.value}
							onClick={() => selectOption(index)}
							onMouseEnter={() => setActiveIndex(index)}
							role="option"
							tabIndex={-1}
							type="button"
						>
							<span aria-hidden="true" className="w-3 shrink-0">
								{selected ? '✓' : ''}
							</span>
							<span>{option.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function SuggestionInput({
	ariaLabel,
	className,
	customSuggestions = [],
	id,
	maxLength,
	onBlur,
	onChange,
	onRemoveCustomSuggestion,
	placeholder,
	suggestions,
	value,
}: {
	ariaLabel: string;
	className: string;
	customSuggestions?: readonly string[];
	id: string;
	maxLength: number;
	onBlur: () => void;
	onChange: (value: string) => void;
	onRemoveCustomSuggestion?: (suggestion: string) => void;
	placeholder: string;
	suggestions: readonly string[];
	value: string;
}) {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const listboxId = useId();
	const root = useRef<HTMLDivElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const normalizedValue = value.trim().toLocaleLowerCase();
	const matchesValue = (suggestion: string) =>
		!normalizedValue || suggestion.toLocaleLowerCase().includes(normalizedValue);
	const filteredCustomSuggestions = customSuggestions.filter(matchesValue);
	const filteredStandardSuggestions = suggestions.filter(matchesValue);
	const filteredSuggestions = [...filteredCustomSuggestions, ...filteredStandardSuggestions];

	useEffect(() => {
		if (!open) {
			return;
		}
		const closeOutside = (event: PointerEvent) => {
			const currentRoot = root.current;
			if (currentRoot && !event.composedPath().includes(currentRoot)) {
				setOpen(false);
			}
		};
		document.addEventListener('pointerdown', closeOutside);
		return () => document.removeEventListener('pointerdown', closeOutside);
	}, [open]);

	const openMenu = () => {
		setActiveIndex(0);
		setOpen(filteredSuggestions.length > 0);
	};
	const selectSuggestion = (index: number) => {
		const suggestion = filteredSuggestions[index];
		if (suggestion) {
			onChange(suggestion);
		}
		setOpen(false);
		input.current?.focus();
	};
	const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (filteredSuggestions.length === 0) {
					return;
				}
				if (!open) {
					openMenu();
					return;
				}
				setActiveIndex((current) => (current + 1) % filteredSuggestions.length);
				return;
			case 'ArrowUp':
				event.preventDefault();
				if (filteredSuggestions.length === 0) {
					return;
				}
				if (!open) {
					openMenu();
					return;
				}
				setActiveIndex(
					(current) =>
						(current - 1 + filteredSuggestions.length) % filteredSuggestions.length
				);
				return;
			case 'Enter':
				if (open) {
					event.preventDefault();
					selectSuggestion(activeIndex);
				}
				return;
			case 'Escape':
				if (open) {
					event.preventDefault();
					setOpen(false);
				}
				return;
			case 'Tab':
				setOpen(false);
				return;
			default:
		}
	};

	return (
		<div className="relative" data-suggestion-input="true" ref={root}>
			<input
				aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
				aria-autocomplete="list"
				aria-controls={listboxId}
				aria-expanded={open}
				autoComplete="off"
				className={className}
				id={id}
				maxLength={maxLength}
				onBlur={() => {
					onBlur();
					setOpen(false);
				}}
				onChange={(event) => {
					const nextValue = event.currentTarget.value;
					const normalizedNextValue = nextValue.trim().toLocaleLowerCase();
					onChange(nextValue);
					setActiveIndex(0);
					setOpen(
						[...customSuggestions, ...suggestions].some((suggestion) =>
							suggestion.toLocaleLowerCase().includes(normalizedNextValue)
						)
					);
				}}
				onFocus={openMenu}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				ref={input}
				role="combobox"
				value={value}
			/>
			<div
				aria-label={ariaLabel}
				className="absolute top-full left-0 z-50 mt-px max-h-80 w-full min-w-max overflow-y-auto border border-line bg-panel p-1"
				hidden={!open || filteredSuggestions.length === 0}
				id={listboxId}
				role="listbox"
			>
				{filteredCustomSuggestions.length > 0 ? (
					<fieldset aria-label="Custom entries" className="m-0 min-w-0 border-0 p-0">
						<legend className="w-full border-line border-b px-2.5 py-1.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest">
							Custom
						</legend>
						{filteredCustomSuggestions.map((suggestion, index) => (
							<div className="flex items-stretch" key={suggestion}>
								<button
									aria-selected={suggestion === value}
									className={`min-w-0 flex-1 px-2.5 py-1.5 text-left font-medium text-xs outline-none ${
										index === activeIndex
											? 'bg-slate-700 text-(--content-strong)'
											: 'text-slate-300 hover:bg-slate-800 hover:text-(--content-strong)'
									}`}
									id={`${listboxId}-option-${index}`}
									onClick={() => selectSuggestion(index)}
									onMouseEnter={() => setActiveIndex(index)}
									onPointerDown={(event) => event.preventDefault()}
									role="option"
									tabIndex={-1}
									type="button"
								>
									{suggestion}
								</button>
								{onRemoveCustomSuggestion ? (
									<button
										aria-label={`Remove ${suggestion} from custom identities`}
										className="grid w-8 shrink-0 place-items-center border-line border-l text-slate-500 text-sm outline-none hover:bg-rose-400/10 hover:text-rose-300"
										onClick={() => {
											onRemoveCustomSuggestion(suggestion);
											setActiveIndex(0);
											input.current?.focus();
										}}
										onPointerDown={(event) => event.preventDefault()}
										type="button"
									>
										×
									</button>
								) : null}
							</div>
						))}
					</fieldset>
				) : null}
				{filteredStandardSuggestions.length > 0 ? (
					<fieldset
						aria-label="Standard options"
						className={
							filteredCustomSuggestions.length > 0
								? 'm-0 mt-1 min-w-0 border-0 border-line border-t p-0 pt-1'
								: 'm-0 min-w-0 border-0 p-0'
						}
					>
						<legend
							className={
								filteredCustomSuggestions.length > 0
									? 'w-full px-2.5 py-1.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest'
									: 'sr-only'
							}
						>
							Standard options
						</legend>
						{filteredStandardSuggestions.map((suggestion, index) => {
							const optionIndex = filteredCustomSuggestions.length + index;
							return (
								<button
									aria-selected={suggestion === value}
									className={`flex w-full px-2.5 py-1.5 text-left font-medium text-xs outline-none ${
										optionIndex === activeIndex
											? 'bg-slate-700 text-(--content-strong)'
											: 'text-slate-300 hover:bg-slate-800 hover:text-(--content-strong)'
									}`}
									id={`${listboxId}-option-${optionIndex}`}
									key={suggestion}
									onClick={() => selectSuggestion(optionIndex)}
									onMouseEnter={() => setActiveIndex(optionIndex)}
									onPointerDown={(event) => event.preventDefault()}
									role="option"
									tabIndex={-1}
									type="button"
								>
									{suggestion}
								</button>
							);
						})}
					</fieldset>
				) : null}
			</div>
		</div>
	);
}
