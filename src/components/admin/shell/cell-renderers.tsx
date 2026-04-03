"use client";

import { formatDistanceToNow } from "date-fns";
import {
	ChevronDown,
	ExternalLink,
	FileImage,
	FileText,
	ImageOff,
	Link2,
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { cn } from "#/lib/utils";

interface SelectOption {
	color?: string;
	label: string;
	value: string;
}

const WHITESPACE_REGEX = /\s+/;

function getInitials(value: string): string {
	return value
		.trim()
		.split(WHITESPACE_REGEX)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getReadableForegroundColor(color?: string): string | undefined {
	if (!color?.startsWith("#")) {
		return undefined;
	}

	const hex = color.slice(1);
	const normalized =
		hex.length === 3
			? hex
					.split("")
					.map((character) => `${character}${character}`)
					.join("")
			: hex;

	if (normalized.length !== 6) {
		return undefined;
	}

	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

	return luminance > 0.6 ? "#111827" : "#ffffff";
}

export function TextCell({
	className,
	emptyText = "—",
	href,
	maxLength = 56,
	value,
}: {
	className?: string;
	emptyText?: string;
	href?: string;
	maxLength?: number;
	value?: string | null;
}) {
	if (!(value && value.trim().length > 0)) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	const content = truncate(value, maxLength);

	if (href) {
		return (
			<a
				className={cn(
					"inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline",
					className
				)}
				href={href}
				rel="noreferrer"
				target="_blank"
				title={value}
			>
				<span>{content}</span>
				<ExternalLink className="size-3.5" />
			</a>
		);
	}

	return (
		<span className={cn("block truncate", className)} title={value}>
			{content}
		</span>
	);
}

export function BadgeCell({
	className,
	color,
	emptyText = "—",
	value,
}: {
	className?: string;
	color?: string;
	emptyText?: string;
	value?: string | null;
}) {
	if (!(value && value.trim().length > 0)) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	return (
		<Badge
			className={className}
			style={
				color
					? {
							backgroundColor: color,
							color: getReadableForegroundColor(color),
						}
					: undefined
			}
			variant={color ? "outline" : "secondary"}
		>
			{value}
		</Badge>
	);
}

export function CurrencyCell({
	currency = "USD",
	emptyText = "—",
	isCents = false,
	locale = "en-US",
	value,
}: {
	currency?: string;
	emptyText?: string;
	isCents?: boolean;
	locale?: string;
	value?: number | null;
}) {
	if (value === undefined || value === null || Number.isNaN(value)) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	const normalizedValue = isCents ? value / 100 : value;
	const formatted = new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
	}).format(normalizedValue);

	return <span className="font-medium tabular-nums">{formatted}</span>;
}

export function PercentCell({
	className,
	colorScale,
	decimals = 1,
	emptyText = "—",
	fromBasisPoints = false,
	value,
}: {
	className?: string;
	colorScale?: "performance";
	decimals?: number;
	emptyText?: string;
	fromBasisPoints?: boolean;
	value?: number | null;
}) {
	if (value === undefined || value === null || Number.isNaN(value)) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	const normalizedValue = fromBasisPoints ? value / 100 : value;
	let toneClass: string | undefined;
	if (colorScale === "performance") {
		toneClass = normalizedValue >= 0 ? "text-emerald-600" : "text-destructive";
	}

	return (
		<span className={cn("tabular-nums", toneClass, className)}>
			{normalizedValue.toFixed(decimals)}%
		</span>
	);
}

export function DateCell({
	emptyText = "—",
	format = "both",
	value,
}: {
	emptyText?: string;
	format?: "absolute" | "both" | "relative";
	value?: Date | number | string | null;
}) {
	if (
		value === undefined ||
		value === null ||
		(typeof value === "string" && value.trim().length === 0)
	) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	const absoluteValue = new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: format === "absolute" ? undefined : "short",
	}).format(date);
	const relativeValue = formatDistanceToNow(date, { addSuffix: true });
	let displayValue = `${absoluteValue} · ${relativeValue}`;

	if (format === "relative") {
		displayValue = relativeValue;
	} else if (format === "absolute") {
		displayValue = absoluteValue;
	}

	return <span title={absoluteValue}>{displayValue}</span>;
}

export function AvatarCell({
	emptyText = "—",
	name,
	src,
	subtitle,
}: {
	emptyText?: string;
	name?: string | null;
	src?: string | null;
	subtitle?: string | null;
}) {
	if (!(name && name.trim().length > 0)) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	return (
		<div className="flex items-center gap-2">
			<Avatar size="sm">
				{src ? <AvatarImage alt={name} src={src} /> : null}
				<AvatarFallback>{getInitials(name)}</AvatarFallback>
			</Avatar>
			<div className="min-w-0">
				<p className="truncate font-medium text-sm">{name}</p>
				{subtitle ? (
					<p className="truncate text-muted-foreground text-xs">{subtitle}</p>
				) : null}
			</div>
		</div>
	);
}

export function LinkCell({
	emptyText = "—",
	href,
	label,
}: {
	emptyText?: string;
	href?: string;
	label?: string | null;
}) {
	if (!(label && label.trim().length > 0)) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	if (!href) {
		return (
			<TextCell className="inline-flex items-center gap-1" value={label} />
		);
	}

	return (
		<a
			className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
			href={href}
			title={label}
		>
			<Link2 className="size-3.5" />
			<span>{truncate(label, 48)}</span>
		</a>
	);
}

export function ImageCell({
	alt,
	emptyText = "—",
	src,
}: {
	alt?: string;
	emptyText?: string;
	src?: string | null;
}) {
	if (!src) {
		return (
			<span className="inline-flex items-center gap-1 text-muted-foreground">
				<ImageOff className="size-4" />
				{emptyText}
			</span>
		);
	}

	return (
		<div className="flex items-center justify-center">
			<img
				alt={alt ?? "Thumbnail"}
				className="size-10 rounded-md border object-cover"
				height={40}
				src={src}
				width={40}
			/>
		</div>
	);
}

export function SelectCell({
	emptyText = "—",
	onValueChange,
	options,
	value,
}: {
	emptyText?: string;
	onValueChange?: (value: string) => void;
	options: SelectOption[];
	value?: string | null;
}) {
	const selectedOption = options.find((option) => option.value === value);

	if (!onValueChange) {
		return (
			<BadgeCell
				color={selectedOption?.color}
				emptyText={emptyText}
				value={selectedOption?.label ?? value}
			/>
		);
	}

	return (
		<Select onValueChange={onValueChange} value={value ?? undefined}>
			<SelectTrigger aria-label="Select value" className="h-8 min-w-[9rem]">
				<SelectValue placeholder={emptyText}>
					{selectedOption ? (
						<div className="flex items-center gap-2">
							{selectedOption.color ? (
								<span
									aria-hidden="true"
									className="size-2 rounded-full"
									style={{ backgroundColor: selectedOption.color }}
								/>
							) : null}
							<span>{selectedOption.label}</span>
						</div>
					) : null}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						<div className="flex items-center gap-2">
							{option.color ? (
								<span
									aria-hidden="true"
									className="size-2 rounded-full"
									style={{ backgroundColor: option.color }}
								/>
							) : null}
							<span>{option.label}</span>
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function MultiSelectCell({
	emptyText = "—",
	maxVisible = 3,
	onValuesChange,
	options,
	values,
}: {
	emptyText?: string;
	maxVisible?: number;
	onValuesChange?: (values: string[]) => void;
	options: SelectOption[];
	values?: string[] | null;
}) {
	const selectedValues = values ?? [];
	const selectedOptions = options.filter((option) =>
		selectedValues.includes(option.value)
	);
	const visibleOptions = selectedOptions.slice(0, maxVisible);
	const overflowCount = selectedOptions.length - visibleOptions.length;
	const [open, setOpen] = useState(false);

	if (selectedOptions.length === 0 && !onValuesChange) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	const badges = (
		<div className="flex flex-wrap items-center gap-1">
			{visibleOptions.map((option) => (
				<Badge
					key={option.value}
					style={
						option.color
							? {
									backgroundColor: `${option.color}1A`,
									borderColor: `${option.color}33`,
									color: option.color,
								}
							: undefined
					}
					variant="outline"
				>
					{option.label}
				</Badge>
			))}
			{overflowCount > 0 ? (
				<Badge
					title={selectedOptions.map((option) => option.label).join(", ")}
					variant="secondary"
				>
					+{overflowCount} more
				</Badge>
			) : null}
		</div>
	);

	if (!onValuesChange) {
		return badges;
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					className="h-auto min-h-8 justify-between gap-2 px-3 py-1.5"
					type="button"
					variant="outline"
				>
					<span className="truncate">
						{selectedOptions.length === 0
							? emptyText
							: `${selectedOptions.length} selected`}
					</span>
					<ChevronDown className="size-4 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-3">
				<div className="space-y-3">
					<div className="space-y-1">
						<p className="font-medium text-sm">Select values</p>
						<p className="text-muted-foreground text-xs">
							Choose one or more options for this field.
						</p>
					</div>
					<div className="space-y-2">
						{options.map((option) => {
							const checked = selectedValues.includes(option.value);
							return (
								<div
									className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
									key={option.value}
								>
									<div className="flex items-center gap-2">
										<Checkbox
											checked={checked}
											onCheckedChange={(nextChecked) => {
												const nextValues = nextChecked
													? [...selectedValues, option.value]
													: selectedValues.filter(
															(value) => value !== option.value
														);
												onValuesChange(nextValues);
											}}
										/>
										{option.color ? (
											<span
												aria-hidden="true"
												className="size-2 rounded-full"
												style={{ backgroundColor: option.color }}
											/>
										) : null}
										<span className="text-sm">{option.label}</span>
									</div>
								</div>
							);
						})}
					</div>
					{selectedOptions.length > 0 ? badges : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function FileCell({
	emptyText = "—",
	fileName,
	fileSize,
	href,
	icon = "pdf",
}: {
	emptyText?: string;
	fileName?: string | null;
	fileSize?: string | null;
	href?: string;
	icon?: "image" | "pdf";
}) {
	if (!(fileName && fileName.trim().length > 0)) {
		return <span className="text-muted-foreground">{emptyText}</span>;
	}

	const Icon = icon === "image" ? FileImage : FileText;

	return (
		<div className="inline-flex items-center gap-2">
			<Icon className="size-4 text-muted-foreground" />
			{href ? (
				<a
					className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
					href={href}
					rel="noreferrer"
					target="_blank"
				>
					<span className="truncate" title={fileName}>
						{truncate(fileName, 24)}
					</span>
					{fileSize ? (
						<span className="text-muted-foreground text-xs">{fileSize}</span>
					) : null}
				</a>
			) : (
				<>
					<span className="truncate" title={fileName}>
						{truncate(fileName, 24)}
					</span>
					{fileSize ? (
						<span className="text-muted-foreground text-xs">{fileSize}</span>
					) : null}
				</>
			)}
		</div>
	);
}
