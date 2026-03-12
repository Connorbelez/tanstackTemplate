import type React from "react";

export interface SliderProps {
	className?: string;
	id: string;
	label: string;
	max?: number;
	min?: number;
	onChange?: (value: number) => void;
	showValue?: boolean;
	step?: number;
	value?: number;
}

export const Slider: React.FC<SliderProps> = ({
	label,
	id,
	value = 0,
	onChange,
	min = 0,
	max = 100,
	step = 1,
	showValue = true,
	className = "",
}) => {
	return (
		<div className={`flex flex-col gap-2 ${className}`}>
			<div className="flex items-center justify-between">
				<label
					className="font-medium text-gray-700 text-sm dark:text-gray-200"
					htmlFor={id}
				>
					{label}
				</label>
				{showValue && (
					<span className="min-w-12 text-right font-semibold text-blue-600 text-sm dark:text-blue-400">
						{value}
					</span>
				)}
			</div>
			<input
				className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-blue-600 dark:bg-gray-700 dark:accent-blue-500"
				id={id}
				max={max}
				min={min}
				onChange={(e) => onChange?.(Number(e.target.value))}
				step={step}
				type="range"
				value={value}
			/>
			<div className="flex justify-between text-gray-500 text-xs dark:text-gray-400">
				<span>{min}</span>
				<span>{max}</span>
			</div>
		</div>
	);
};
