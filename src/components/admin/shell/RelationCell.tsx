"use client";

import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import type { MouseEvent } from "react";
import type { AdminRelationNavigationTarget } from "#/lib/admin-relation-navigation";
import { cn } from "#/lib/utils";
import type { RelationCellDisplayValue } from "../../../../convex/crm/types";

const COLLAPSED_VISIBLE_ITEMS = 1;
const MAX_EXPANDED_ITEMS = 12;

export interface RelationCellProps {
	allowToggle?: boolean;
	className?: string;
	expanded?: boolean;
	onExpandedChange?: (nextExpanded: boolean) => void;
	onNavigate?: (target: AdminRelationNavigationTarget) => void;
	value: RelationCellDisplayValue;
	variant?: "compact" | "detail";
}

export function isRelationCellDisplayValue(
	value: unknown
): value is RelationCellDisplayValue {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<RelationCellDisplayValue>;
	return candidate.kind === "relation" && Array.isArray(candidate.items);
}

function stopEvent(event: MouseEvent<HTMLElement>) {
	event.preventDefault();
	event.stopPropagation();
}

function toNavigationTarget(
	item: RelationCellDisplayValue["items"][number]
): AdminRelationNavigationTarget {
	return {
		objectDefId: String(item.objectDefId),
		recordId: item.recordId,
		recordKind: item.recordKind,
	};
}

export function RelationCell({
	allowToggle = true,
	className,
	expanded = false,
	onExpandedChange,
	onNavigate,
	value,
	variant = "compact",
}: RelationCellProps) {
	if (value.items.length === 0) {
		return (
			<span className="text-muted-foreground text-sm">
				{variant === "detail" ? "No linked records" : "—"}
			</span>
		);
	}

	const visibleItems = expanded
		? value.items.slice(0, MAX_EXPANDED_ITEMS)
		: value.items.slice(0, COLLAPSED_VISIBLE_ITEMS);
	const hiddenItemCount = expanded
		? Math.max(0, value.items.length - visibleItems.length)
		: value.items.length - visibleItems.length;
	const showToggle =
		allowToggle && value.items.length > COLLAPSED_VISIBLE_ITEMS;

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-1.5",
				variant === "detail" && "gap-2",
				className
			)}
		>
			{visibleItems.map((item) => (
				<button
					className={cn(
						"inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 font-medium text-foreground text-xs transition-colors hover:border-primary/40 hover:bg-muted/50",
						variant === "detail" && "px-3 py-1.5 text-sm"
					)}
					key={`${item.recordKind}:${item.recordId}`}
					onClick={(event) => {
						stopEvent(event);
						onNavigate?.(toNavigationTarget(item));
					}}
					type="button"
				>
					<Link2
						className={cn(
							"size-3 text-muted-foreground",
							variant === "detail" && "size-3.5"
						)}
					/>
					<span className="truncate">{item.label}</span>
				</button>
			))}

			{!expanded && hiddenItemCount > 0 ? (
				<button
					className={cn(
						"inline-flex items-center gap-1 rounded-full border border-border/70 border-dashed px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:border-primary/40 hover:text-foreground",
						variant === "detail" && "px-3 py-1.5 text-sm"
					)}
					onClick={(event) => {
						stopEvent(event);
						onExpandedChange?.(true);
					}}
					type="button"
				>
					<span>+{hiddenItemCount} more</span>
					{showToggle ? (
						<ChevronDown
							className={cn("size-3", variant === "detail" && "size-3.5")}
						/>
					) : null}
				</button>
			) : null}

			{expanded && showToggle ? (
				<button
					className={cn(
						"inline-flex items-center gap-1 rounded-full border border-border/70 border-dashed px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:border-primary/40 hover:text-foreground",
						variant === "detail" && "px-3 py-1.5 text-sm"
					)}
					onClick={(event) => {
						stopEvent(event);
						onExpandedChange?.(false);
					}}
					type="button"
				>
					<span>Show less</span>
					<ChevronUp
						className={cn("size-3", variant === "detail" && "size-3.5")}
					/>
				</button>
			) : null}

			{expanded && hiddenItemCount > 0 ? (
				<span className="text-muted-foreground text-xs">
					+{hiddenItemCount} more hidden
				</span>
			) : null}
		</div>
	);
}
