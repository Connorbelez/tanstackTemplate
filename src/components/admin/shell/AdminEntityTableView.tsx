"use client";

import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
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
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	EntityViewRow,
	NormalizedFieldDefinition,
	RecordFilter,
	RecordSort,
	TableFooterAggregateResult,
} from "../../../../convex/crm/types";
import { AdminTableAggregateFooter } from "./AdminTableAggregateFooter";
import {
	type AdminTableColumnFilterState,
	AdminTableColumnHeaderControls,
} from "./AdminTableColumnHeaderControls";
import { AdminTableHeaderControls } from "./AdminTableHeaderControls";
import {
	getAdminRecordSupportingText,
	getAdminRecordTitle,
	renderAdminFieldValue,
} from "./admin-view-rendering";
import type {
	AdminViewColumn,
	AdminViewSchemaColumn,
} from "./admin-view-types";
import { isRelationCellDisplayValue, RelationCell } from "./RelationCell";

type ObjectDef = Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;

interface AdminEntityTableViewProps {
	readonly activeFilters: readonly RecordFilter[];
	readonly activeSort?: RecordSort;
	readonly adapterContract: Pick<
		EntityViewAdapterContract,
		"entityType" | "titleFieldName"
	>;
	readonly columns: readonly AdminViewColumn[];
	readonly defaultVisibleFieldIds: readonly Id<"fieldDefs">[];
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly footerAggregates: readonly TableFooterAggregateResult[];
	readonly isMutating?: boolean;
	readonly objectDef: ObjectDef;
	readonly onApplyColumnFilter: (
		fieldDefId: Id<"fieldDefs">,
		nextFilter: AdminTableColumnFilterState | null
	) => void;
	readonly onChangeColumnSort: (
		fieldDefId: Id<"fieldDefs">,
		direction: RecordSort["direction"] | null
	) => void;
	readonly onChangeColumnVisibility: (
		fieldDefId: Id<"fieldDefs">,
		nextVisible: boolean
	) => void;
	readonly onClearAllControls: () => void;
	readonly onClearFieldFilter: (fieldDefId: Id<"fieldDefs">) => void;
	readonly onClearSort: () => void;
	readonly onRestoreDefaults: () => void;
	readonly onSelectRecord?: (recordId: string) => void;
	readonly rows: readonly EntityViewRow[];
	readonly schemaColumns: readonly AdminViewSchemaColumn[];
}

function appendSearchFragments(fragments: string[], value: unknown) {
	if (value === null || value === undefined) {
		return;
	}

	if (typeof value === "string" || typeof value === "number") {
		fragments.push(String(value));
		return;
	}

	if (typeof value === "boolean") {
		fragments.push(value ? "true" : "false");
		return;
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			appendSearchFragments(fragments, entry);
		}
		return;
	}

	if (typeof value === "object") {
		for (const entry of Object.values(value as Record<string, unknown>)) {
			appendSearchFragments(fragments, entry);
		}
	}
}

export function AdminEntityTableView({
	adapterContract,
	activeFilters,
	activeSort,
	columns,
	defaultVisibleFieldIds,
	footerAggregates,
	fields,
	isMutating = false,
	objectDef,
	onApplyColumnFilter,
	onChangeColumnSort,
	onChangeColumnVisibility,
	onClearAllControls,
	onClearFieldFilter,
	onClearSort,
	onRestoreDefaults,
	onSelectRecord,
	rows,
	schemaColumns,
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
	const sortedSchemaColumns = [...schemaColumns].sort(
		(left, right) => left.displayOrder - right.displayOrder
	);
	const schemaColumnsById = new Map(
		sortedSchemaColumns.map(
			(column) => [String(column.fieldDefId), column] as const
		)
	);
	const activeFiltersByFieldId = new Map(
		activeFilters.map((filter) => [String(filter.fieldDefId), filter] as const)
	);
	const [searchValue, setSearchValue] = useState("");
	const deferredSearchValue = useDeferredValue(
		searchValue.trim().toLowerCase()
	);
	const fieldsByName = new Map(
		fields.map((field) => [field.name, field] as const)
	);
	const displayedRows = useMemo(() => {
		if (deferredSearchValue.length === 0) {
			return rows;
		}

		return rows.filter((row) => {
			const fragments = [
				getAdminRecordTitle({
					adapterContract,
					fields,
					record: row.record,
				}),
				getAdminRecordSupportingText({
					adapterContract,
					objectDef,
					record: row.record,
				}),
			];

			for (const column of visibleColumns) {
				const cell = row.cells.find(
					(candidate) => candidate.fieldName === column.name
				);
				if (!cell) {
					continue;
				}

				if (isRelationCellDisplayValue(cell.displayValue)) {
					for (const item of cell.displayValue.items) {
						fragments.push(item.label);
					}
					continue;
				}

				appendSearchFragments(
					fragments,
					cell.displayValue?.kind === "scalar"
						? cell.displayValue.value
						: cell.value
				);
			}

			return fragments.join(" ").toLowerCase().includes(deferredSearchValue);
		});
	}, [
		adapterContract,
		deferredSearchValue,
		fields,
		objectDef,
		rows,
		visibleColumns,
	]);
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
			<AdminTableHeaderControls
				activeFilters={activeFilters}
				activeSort={activeSort}
				columns={sortedSchemaColumns}
				defaultVisibleFieldIds={defaultVisibleFieldIds}
				disabled={isMutating}
				onClearAll={() => {
					setSearchValue("");
					onClearAllControls();
				}}
				onClearFieldFilter={onClearFieldFilter}
				onClearSort={onClearSort}
				onRestoreDefaults={onRestoreDefaults}
				onSearchChange={setSearchValue}
				onToggleColumnVisibility={onChangeColumnVisibility}
				searchValue={searchValue}
			/>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="min-w-[260px]">Record</TableHead>
						{visibleColumns.map((column) => {
							const schemaColumn = schemaColumnsById.get(
								String(column.fieldDefId)
							);
							const currentFilter = activeFiltersByFieldId.get(
								String(column.fieldDefId)
							);
							const currentSortDirection =
								activeSort?.fieldDefId === column.fieldDefId
									? activeSort.direction
									: undefined;

							return (
								<TableHead key={column.fieldDefId}>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate font-medium">{column.label}</p>
										</div>
										{schemaColumn ? (
											<AdminTableColumnHeaderControls
												column={schemaColumn}
												currentFilter={currentFilter}
												currentSortDirection={currentSortDirection}
												disabled={isMutating}
												onApplyFilter={(nextFilter) =>
													onApplyColumnFilter(column.fieldDefId, nextFilter)
												}
												onChangeSort={(direction) =>
													onChangeColumnSort(column.fieldDefId, direction)
												}
											/>
										) : null}
									</div>
								</TableHead>
							);
						})}
					</TableRow>
				</TableHeader>
				<TableBody>
					{displayedRows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={visibleColumns.length + 1}>
								<p className="py-6 text-center text-muted-foreground text-sm">
									No rows match the current page search.
								</p>
							</TableCell>
						</TableRow>
					) : (
						displayedRows.map((row) => (
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
													row.record._kind === "native"
														? "secondary"
														: "outline"
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
						))
					)}
				</TableBody>
				{deferredSearchValue.length === 0 ? (
					<AdminTableAggregateFooter
						columns={visibleColumns}
						fields={fields}
						footerAggregates={footerAggregates}
						objectDef={objectDef}
						rowCount={rows.length}
						rowKind={rows[0]?.record._kind}
					/>
				) : null}
			</Table>
		</div>
	);
}
