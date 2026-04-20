"use client";

import { type ReactNode, useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useAdminRelationNavigation } from "#/hooks/useAdminRelationNavigation";
import { cn } from "#/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	EntityViewRow,
	NormalizedFieldDefinition,
} from "../../../../convex/crm/types";
import {
	getAdminRecordSupportingText,
	getAdminRecordTitle,
	renderAdminFieldValue,
} from "./admin-view-rendering";
import type { AdminViewColumn } from "./admin-view-types";
import { isRelationCellDisplayValue, RelationCell } from "./RelationCell";

type ObjectDef = Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;

interface AdminEntityTableViewProps {
	readonly adapterContract: Pick<
		EntityViewAdapterContract,
		"entityType" | "titleFieldName"
	>;
	readonly columns: readonly AdminViewColumn[];
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly objectDef: ObjectDef;
	readonly onSelectRecord?: (recordId: string) => void;
	readonly rows: readonly EntityViewRow[];
}

export function AdminEntityTableView({
	adapterContract,
	columns,
	fields,
	objectDef,
	onSelectRecord,
	rows,
}: AdminEntityTableViewProps) {
	const navigateRelation = useAdminRelationNavigation({
		presentation: "sheet",
	});
	const [expandedRelationCellKey, setExpandedRelationCellKey] = useState<
		string | null
	>(null);
	const visibleColumns = columns
		.filter((column) => column.isVisible)
		.sort((left, right) => left.displayOrder - right.displayOrder);
	const fieldsByName = new Map(
		fields.map((field) => [field.name, field] as const)
	);
	const handleSelectableRowKeyDown = (
		event: React.KeyboardEvent<HTMLTableRowElement>,
		recordId: string
	) => {
		if (!onSelectRecord || event.target !== event.currentTarget) {
			return;
		}

		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}

		event.preventDefault();
		onSelectRecord(recordId);
	};

	return (
		<div className="overflow-hidden rounded-xl border border-border/70 bg-background">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="min-w-[260px]">Record</TableHead>
						{visibleColumns.map((column) => (
							<TableHead key={column.fieldDefId}>{column.label}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow
							className={cn(
								onSelectRecord &&
									"cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							)}
							key={row.record._id}
							onClick={() => onSelectRecord?.(row.record._id)}
							onKeyDown={(event) =>
								handleSelectableRowKeyDown(event, row.record._id)
							}
							role={onSelectRecord ? "button" : undefined}
							tabIndex={onSelectRecord ? 0 : undefined}
						>
							<TableCell>
								<div className="space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-medium">
											{getAdminRecordTitle({
												adapterContract,
												fields,
												record: row.record,
											})}
										</p>
										<Badge
											variant={
												row.record._kind === "native" ? "secondary" : "outline"
											}
										>
											{row.record._kind === "native"
												? "Native Adapter"
												: "EAV Storage"}
										</Badge>
									</div>
									<p className="text-muted-foreground text-xs">
										{getAdminRecordSupportingText({
											adapterContract,
											objectDef,
											record: row.record,
										})}
									</p>
								</div>
							</TableCell>
							{visibleColumns.map((column) => {
								const field = fieldsByName.get(column.name);
								const cell = row.cells.find(
									(candidate) => candidate.fieldName === column.name
								);
								const cellKey = `${row.record._id}:${column.name}`;
								const relationDisplayValue = isRelationCellDisplayValue(
									cell?.displayValue
								)
									? cell.displayValue
									: null;
								let cellContent: ReactNode;

								if (!(field && cell)) {
									cellContent = (
										<span className="text-muted-foreground">—</span>
									);
								} else if (relationDisplayValue) {
									cellContent = (
										<RelationCell
											expanded={expandedRelationCellKey === cellKey}
											onExpandedChange={(nextExpanded) => {
												setExpandedRelationCellKey(
													nextExpanded ? cellKey : null
												);
											}}
											onNavigate={navigateRelation}
											value={relationDisplayValue}
										/>
									);
								} else {
									cellContent = (
										<div className="truncate">
											{renderAdminFieldValue(
												field,
												cell.displayValue?.kind === "scalar"
													? cell.displayValue.value
													: cell.value,
												row.record
											)}
										</div>
									);
								}

								return (
									<TableCell
										className="align-top"
										key={`${row.record._id}-${column.fieldDefId}`}
									>
										<div className="max-w-[220px] text-sm">{cellContent}</div>
									</TableCell>
								);
							})}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
