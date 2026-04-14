import type * as React from "react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";
import type { MetricItem } from "./types";

export interface TableColumn<T> {
	align?: "left" | "right";
	cellClassName?: string;
	header: string;
	id: string;
	render: (row: T) => ReactNode;
}

export function statusBadgeVariant(status?: string) {
	if (!status) {
		return "outline" as const;
	}

	const normalized = status.toLowerCase();
	if (
		normalized.includes("error") ||
		normalized.includes("failed") ||
		normalized.includes("overdue") ||
		normalized.includes("missing") ||
		normalized.includes("critical") ||
		normalized.includes("escalated")
	) {
		return "destructive" as const;
	}
	if (
		normalized.includes("warning") ||
		normalized.includes("pending") ||
		normalized.includes("retry") ||
		normalized.includes("draft")
	) {
		return "secondary" as const;
	}
	if (
		normalized.includes("healthy") ||
		normalized.includes("confirmed") ||
		normalized.includes("settled") ||
		normalized.includes("resolved") ||
		normalized.includes("active") ||
		normalized.includes("completed")
	) {
		return "default" as const;
	}
	return "outline" as const;
}

export function StatusBadge({
	label,
	variant,
}: {
	label: string;
	variant?: "default" | "destructive" | "outline" | "secondary";
}) {
	return <Badge variant={variant ?? statusBadgeVariant(label)}>{label}</Badge>;
}

export function PageHeader({
	actions,
	description,
	eyebrow,
	title,
}: {
	actions?: ReactNode;
	description: string;
	eyebrow?: ReactNode;
	title: string;
}) {
	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div className="space-y-2">
				{eyebrow ? <div>{eyebrow}</div> : null}
				<div className="space-y-1">
					<h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						{description}
					</p>
				</div>
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}

export function MetricStrip({ items }: { items: MetricItem[] }) {
	return (
		<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
			{items.map((item) => (
				<Card
					className={cn(
						"gap-2 py-4",
						item.tone === "critical" &&
							"border-destructive/40 bg-destructive/5",
						item.tone === "warning" && "border-amber-200 bg-amber-50/60",
						item.tone === "positive" && "border-emerald-200 bg-emerald-50/60"
					)}
					key={item.label}
				>
					<CardContent className="px-4">
						<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
							{item.label}
						</div>
						<div className="mt-2 font-semibold text-2xl">{item.value}</div>
						{item.description ? (
							<p className="mt-1 text-muted-foreground text-xs">
								{item.description}
							</p>
						) : null}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

export function SectionCard({
	action,
	children,
	description,
	title,
}: {
	action?: ReactNode;
	children: ReactNode;
	description?: string;
	title: string;
}) {
	return (
		<Card className="gap-0 overflow-hidden py-0">
			<CardHeader className="border-b px-5 py-4">
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-1">
						<CardTitle className="text-base">{title}</CardTitle>
						{description ? (
							<CardDescription>{description}</CardDescription>
						) : null}
					</div>
					{action ? <div>{action}</div> : null}
				</div>
			</CardHeader>
			<CardContent className="p-0">{children}</CardContent>
		</Card>
	);
}

export function FilterBar({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"sticky top-0 z-10 rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80",
				className
			)}
		>
			<div className="flex flex-wrap items-end gap-3">{children}</div>
		</div>
	);
}

export function FilterField({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<div className="flex min-w-[160px] flex-col gap-2">
			<span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
				{label}
			</span>
			{children}
		</div>
	);
}

export function FilterTextInput(props: React.ComponentProps<typeof Input>) {
	return <Input className="h-9 min-w-[220px]" {...props} />;
}

export function FilterDateInput(props: React.ComponentProps<typeof Input>) {
	return <Input className="h-9 min-w-[160px]" type="date" {...props} />;
}

export function FilterSelect({
	onValueChange,
	options,
	placeholder,
	value,
}: {
	onValueChange: (value: string) => void;
	options: Array<{ label: string; value: string }>;
	placeholder: string;
	value?: string;
}) {
	return (
		<Select onValueChange={onValueChange} value={value}>
			<SelectTrigger className="h-9 min-w-[180px]">
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function FilterSwitch({
	checked,
	label,
	onCheckedChange,
}: {
	checked: boolean;
	label: string;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex min-h-9 items-center gap-3 rounded-md border px-3">
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
			<Label className="text-sm">{label}</Label>
		</div>
	);
}

export function DataTableCard<T>({
	columns,
	emptyMessage,
	onRowSelect,
	rowKey,
	rows,
	selectedRowId,
}: {
	columns: TableColumn<T>[];
	emptyMessage: string;
	onRowSelect?: (row: T) => void;
	rowKey: (row: T) => string;
	rows: T[];
	selectedRowId?: string;
}) {
	return (
		<div className="overflow-hidden">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						{columns.map((column) => (
							<TableHead
								className={cn(column.align === "right" && "text-right")}
								key={column.id}
							>
								{column.header}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 ? (
						<TableRow>
							<TableCell
								className="h-36 text-center text-muted-foreground"
								colSpan={columns.length}
							>
								{emptyMessage}
							</TableCell>
						</TableRow>
					) : (
						rows.map((row) => {
							const key = rowKey(row);
							const isSelected = selectedRowId === key;
							return (
								<TableRow
									className={cn(
										onRowSelect && "cursor-pointer",
										isSelected && "bg-muted/70 hover:bg-muted/70"
									)}
									key={key}
									onClick={onRowSelect ? () => onRowSelect(row) : undefined}
								>
									{columns.map((column) => (
										<TableCell
											className={cn(
												column.align === "right" && "text-right",
												column.cellClassName
											)}
											key={column.id}
										>
											{column.render(row)}
										</TableCell>
									))}
								</TableRow>
							);
						})
					)}
				</TableBody>
			</Table>
		</div>
	);
}

export function DetailRail({
	actions,
	children,
	description,
	title,
}: {
	actions?: ReactNode;
	children: ReactNode;
	description?: string;
	title: string;
}) {
	return (
		<Card className="sticky top-24 gap-0 overflow-hidden py-0">
			<CardHeader className="border-b px-5 py-4">
				<div className="space-y-1">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="text-base">{title}</CardTitle>
						{actions ? (
							<div className="flex flex-wrap gap-2">{actions}</div>
						) : null}
					</div>
					{description ? (
						<CardDescription>{description}</CardDescription>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="space-y-4 px-5 py-4">{children}</CardContent>
		</Card>
	);
}

export function KeyValueList({
	items,
}: {
	items: Array<{ label: string; value: ReactNode }>;
}) {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<div className="space-y-1" key={item.label}>
					<div className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
						{item.label}
					</div>
					<div className="text-sm">{item.value}</div>
				</div>
			))}
		</div>
	);
}

export function InlineCode({ value }: { value: string }) {
	return (
		<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
			{value}
		</code>
	);
}

export function EmptyDetailState({
	description,
	title,
}: {
	description: string;
	title: string;
}) {
	return (
		<div className="rounded-xl border border-dashed p-6 text-center">
			<div className="font-medium text-sm">{title}</div>
			<p className="mt-2 text-muted-foreground text-sm">{description}</p>
		</div>
	);
}

export function ActionButtonRow({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function LinkLikeButton({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<Button className={className} size="sm" variant="outline">
			{children}
		</Button>
	);
}
