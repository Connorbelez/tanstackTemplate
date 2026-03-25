import type React from "react";

export interface RadioOption {
	label: string;
	value: string;
}

export interface RadioGroupProps {
	className?: string;
	label: string;
	name: string;
	onChange?: (value: string) => void;
	options: RadioOption[];
	value?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
	label,
	name,
	options,
	value,
	onChange,
	className = "",
}) => {
	return (
		<div className={`flex flex-col gap-3 ${className}`}>
			<label className="font-medium text-gray-700 text-sm dark:text-gray-200">
				{label}
			</label>
			<div className="flex gap-4">
				{options.map((option) => (
					<label
						className="group flex cursor-pointer items-center gap-2"
						key={option.value}
					>
						<input
							checked={value === option.value}
							className="h-4 w-4 cursor-pointer border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-400"
							name={name}
							onChange={(e) => onChange?.(e.target.value)}
							type="radio"
							value={option.value}
						/>
						<span className="text-gray-700 text-sm transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
							{option.label}
						</span>
					</label>
				))}
			</div>
		</div>
	);
};
