"use client";

import { Columns3, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "#/components/ui/popover";
import { ScrollArea } from "#/components/ui/scroll-area";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { AdminViewSchemaColumn } from "./admin-view-types";

interface AdminTableColumnVisibilityPopoverProps {
	readonly columns: readonly AdminViewSchemaColumn[];
	readonly defaultVisibleFieldIds: readonly Id<"fieldDefs">[];
	readonly disabled?: boolean;
	readonly onRestoreDefaults: () => void;
	readonly onToggleVisibility: (
		fieldDefId: Id<"fieldDefs">,
		nextVisible: boolean
	) => void;
}

export function AdminTableColumnVisibilityPopover({
	columns,
	defaultVisibleFieldIds,
	disabled = false,
	onRestoreDefaults,
	onToggleVisibility,
}: AdminTableColumnVisibilityPopoverProps) {
	const [searchValue, setSearchValue] = useState("");
	const filteredColumns = useMemo(() => {
		const normalizedSearch = searchValue.trim().toLowerCase();
		if (normalizedSearch.length === 0) {
			return columns;
		}

		return columns.filter((column) => {
			const haystack = [column.label, column.name].join(" ").toLowerCase();
			return haystack.includes(normalizedSearch);
		});
	}, [columns, searchValue]);
	const defaultVisibleSet = useMemo(
		() =>
			new Set(defaultVisibleFieldIds.map((fieldDefId) => String(fieldDefId))),
		[defaultVisibleFieldIds]
	);
	const visibleCount = columns.filter((column) => column.isVisible).length;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button disabled={disabled} size="sm" type="button" variant="outline">
					<Columns3 className="size-4" />
					Columns
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="p-4 pb-3">
					<PopoverHeader>
						<PopoverTitle>Visible columns</PopoverTitle>
						<PopoverDescription>
							Choose which fields stay visible in the active saved view.
						</PopoverDescription>
					</PopoverHeader>
				</div>

				<div className="px-4 pb-3">
					<div className="relative">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							onChange={(event) => setSearchValue(event.target.value)}
							placeholder="Search columns"
							value={searchValue}
						/>
					</div>
				</div>

				<ScrollArea className="max-h-72 px-4 pb-4">
					<div className="space-y-2">
						{filteredColumns.map((column) => {
							const isDefaultVisible = defaultVisibleSet.has(
								String(column.fieldDefId)
							);
							return (
								<label
									className="flex items-start gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted/40"
									htmlFor={`column-visibility-${column.fieldDefId}`}
									key={column.fieldDefId}
								>
									<Checkbox
										checked={column.isVisible}
										id={`column-visibility-${column.fieldDefId}`}
										onCheckedChange={(checked) =>
											onToggleVisibility(column.fieldDefId, checked === true)
										}
									/>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-medium text-sm">
												{column.label}
											</span>
											<span className="text-muted-foreground text-xs">
												{column.isVisible ? "Visible" : "Hidden"}
											</span>
										</div>
										<p className="text-muted-foreground text-xs">
											{isDefaultVisible ? "Shown by default" : "Optional field"}
										</p>
									</div>
								</label>
							);
						})}

						{filteredColumns.length === 0 ? (
							<p className="px-2 py-6 text-center text-muted-foreground text-sm">
								No columns match that search.
							</p>
						) : null}
					</div>
				</ScrollArea>

				<div className="flex items-center justify-between border-t px-4 py-3">
					<p className="text-muted-foreground text-xs">
						{visibleCount} visible
					</p>
					<Button
						disabled={disabled}
						onClick={onRestoreDefaults}
						size="sm"
						type="button"
						variant="ghost"
					>
						Restore defaults
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
