import { Icon } from './icon';

export function ResistanceControl({
	value,
	min,
	max,
	step,
	onChange,
	disabled,
}: {
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	disabled: boolean;
}) {
	return (
		<div className="mt-4">
			<div className="flex items-center gap-3">
				<button
					aria-label="Decrease resistance"
					className="grid h-9 w-9 place-items-center rounded-lg border border-line text-slate-300 hover:border-mint disabled:opacity-40"
					disabled={disabled}
					onClick={() => onChange(value - step)}
					type="button"
				>
					<Icon className="h-4 w-4" name="minus" />
				</button>
				<input
					aria-label="Resistance"
					className="h-1.5 w-full accent-mint disabled:opacity-40"
					disabled={disabled}
					max={max}
					min={min}
					onChange={(event) => onChange(Number(event.target.value))}
					step={step}
					type="range"
					value={value}
				/>
				<button
					aria-label="Increase resistance"
					className="grid h-9 w-9 place-items-center rounded-lg border border-line text-slate-300 hover:border-mint disabled:opacity-40"
					disabled={disabled}
					onClick={() => onChange(value + step)}
					type="button"
				>
					<Icon className="h-4 w-4" name="plus" />
				</button>
			</div>
		</div>
	);
}
