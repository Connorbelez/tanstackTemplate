"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import type { ReactNode } from "react";
import type { EntityTableViewMode } from "#/components/admin/shell/EntityTableToolbar";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { cn } from "#/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";

export interface AdminEntityKanbanFieldOption {
	readonly fieldDefId: Id<"fieldDefs">;
	readonly label: string;
}

interface AdminEntityViewToolbarProps {
	readonly canUseKanban: boolean;
	readonly description?: string;
	readonly isMutating?: boolean;
	readonly kanbanDisabledReason?: string;
	readonly kanbanFieldOptions?: readonly AdminEntityKanbanFieldOption[];
	readonly metaSlot?: ReactNode;
	readonly onKanbanFieldChange?: (fieldDefId: string) => void;
	readonly onViewModeChange: (mode: EntityTableViewMode) => void;
	readonly selectedKanbanFieldId?: string;
	readonly title: string;
	readonly viewMode: EntityTableViewMode;
}

export function AdminEntityViewToolbar({
	canUseKanban,
	description,
	isMutating = false,
	kanbanDisabledReason,
	kanbanFieldOptions = [],
	metaSlot,
	onKanbanFieldChange,
	onViewModeChange,
	selectedKanbanFieldId,
	title,
	viewMode,
}: AdminEntityViewToolbarProps) {
	const showKanbanFieldSelector = kanbanFieldOptions.length > 0;

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<h1 className="font-semibold text-2xl">{title}</h1>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>

			<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
					<div
						aria-label="Entity view mode"
						className="inline-flex items-center rounded-md border p-1"
						role="group"
					>
						<Button
							aria-pressed={viewMode === "table"}
							className={cn("h-8 px-3", viewMode !== "table" && "shadow-none")}
							disabled={isMutating}
							onClick={() => onViewModeChange("table")}
							size="sm"
							type="button"
							variant={viewMode === "table" ? "secondary" : "ghost"}
						>
							<Rows3 className="size-4" />
							Table
						</Button>
						<Button
							aria-pressed={viewMode === "kanban"}
							className={cn("h-8 px-3", viewMode !== "kanban" && "shadow-none")}
							disabled={!canUseKanban || isMutating}
							onClick={() => onViewModeChange("kanban")}
							size="sm"
							title={
								canUseKanban
									? "Switch to kanban"
									: (kanbanDisabledReason ?? "Kanban is unavailable")
							}
							type="button"
							variant={viewMode === "kanban" ? "secondary" : "ghost"}
						>
							<LayoutGrid className="size-4" />
							Kanban
						</Button>
					</div>

					{showKanbanFieldSelector ? (
						<div className="flex min-w-[220px] flex-col gap-1">
							<span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.14em]">
								Board field
							</span>
							<Select
								disabled={isMutating}
								onValueChange={onKanbanFieldChange}
								value={selectedKanbanFieldId}
							>
								<SelectTrigger className="h-9">
									<SelectValue placeholder="Choose a board field" />
								</SelectTrigger>
								<SelectContent>
									{kanbanFieldOptions.map((option) => (
										<SelectItem
											key={option.fieldDefId}
											value={option.fieldDefId}
										>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}
				</div>

				{metaSlot ? (
					<div className="flex flex-wrap items-center gap-2">{metaSlot}</div>
				) : null}
			</div>

			{!canUseKanban && kanbanDisabledReason ? (
				<p className="text-muted-foreground text-sm">{kanbanDisabledReason}</p>
			) : null}
		</div>
	);
}
