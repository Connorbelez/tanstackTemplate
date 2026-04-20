"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { cn } from "#/lib/utils";

interface DatePickerProps {
	className?: string;
	date?: Date;
	onDateChange?: (date?: Date) => void;
	placeholder?: string;
}

export function DatePicker({
	date,
	onDateChange,
	placeholder = "Pick a date",
	className,
}: DatePickerProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					className={cn(
						"w-[280px] justify-start text-left font-normal",
						date ? "text-foreground" : "text-muted-foreground/50",
						className
					)}
					variant="outline"
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{date ? format(date, "PPP") : <span>{placeholder}</span>}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0">
				<Calendar
					initialFocus
					mode="single"
					onSelect={onDateChange}
					selected={date}
				/>
			</PopoverContent>
		</Popover>
	);
}
