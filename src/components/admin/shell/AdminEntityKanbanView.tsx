"use client";

import { Layers3 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { useAdminRelationNavigation } from "#/hooks/useAdminRelationNavigation";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
} from "../../../../convex/crm/types";
import {
	getAdminRecordSupportingText,
	getAdminRecordTitle,
	renderAdminFieldValue,
} from "./admin-view-rendering";
import type { AdminKanbanGroup, AdminViewColumn } from "./admin-view-types";
import { isRelationCellDisplayValue, RelationCell } from "./RelationCell";

type ObjectDef = Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;

interface AdminEntityKanbanViewProps {
	readonly adapterContract: Pick<
		EntityViewAdapterContract,
		"entityType" | "titleFieldName"
	>;
	readonly columns: readonly AdminViewColumn[];
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly groups: readonly AdminKanbanGroup[];
	readonly objectDef: ObjectDef;
	readonly onSelectRecord?: (recordId: string) => void;
}

export function AdminEntityKanbanView({
	adapterContract,
	columns,
	fields,
	groups,
	objectDef,
	onSelectRecord,
}: AdminEntityKanbanViewProps) {
	const navigateRelation = useAdminRelationNavigation({
		presentation: "sheet",
	});
	const [expandedRelationCellKey, setExpandedRelationCellKey] = useState<
		string | null
	>(null);
	const previewColumns = columns
		.filter((column) => column.isVisible)
		.sort((left, right) => left.displayOrder - right.displayOrder)
		.slice(0, 3);
	const fieldsByName = new Map(
		fields.map((field) => [field.name, field] as const)
	);
	const handleSelectableCardKeyDown = (
		event: KeyboardEvent<HTMLDivElement>,
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
		<div className="overflow-x-auto pb-2">
			<div className="flex min-w-max gap-4">
				{groups.map((group) => (
					<section
						className="flex w-[300px] shrink-0 flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4"
						key={group.groupId}
					>
						<header className="flex items-center justify-between gap-3">
							<div className="space-y-1">
								<p className="font-medium text-sm">{group.label}</p>
								<div className="flex items-center gap-2 text-muted-foreground text-xs">
									<Layers3 className="size-3.5" />
									{group.count} records
								</div>
							</div>
							{group.color ? (
								<Badge variant="outline">{group.color}</Badge>
							) : null}
						</header>

						<div className="space-y-3">
							{group.records.length === 0 ? (
								<div className="rounded-xl border border-border/70 border-dashed px-3 py-8 text-center text-muted-foreground text-sm">
									No records in this lane.
								</div>
							) : null}

							{group.rows.map((row) => {
								const cardBody = (
									<>
										<div className="flex w-full items-start justify-between gap-3">
											<div className="space-y-1">
												<p className="font-medium text-sm">
													{getAdminRecordTitle({
														adapterContract,
														fields,
														record: row.record,
													})}
												</p>
												<p className="text-muted-foreground text-xs">
													{getAdminRecordSupportingText({
														adapterContract,
														objectDef,
														record: row.record,
													})}
												</p>
											</div>
											<Badge
												variant={
													row.record._kind === "native"
														? "secondary"
														: "outline"
												}
											>
												{row.record._kind === "native" ? "Native" : "EAV"}
											</Badge>
										</div>

										<div className="grid w-full gap-2">
											{previewColumns.map((column) => {
												const field = fieldsByName.get(column.name);
												const cell = row.cells.find(
													(candidate) => candidate.fieldName === column.name
												);
												let cellContent: ReactNode;

												if (field && cell) {
													const cellKey = `${row.record._id}:${column.name}`;
													const relationDisplayValue =
														isRelationCellDisplayValue(cell.displayValue)
															? cell.displayValue
															: null;

													cellContent = relationDisplayValue ? (
														<RelationCell
															className="justify-end"
															expanded={expandedRelationCellKey === cellKey}
															onExpandedChange={(nextExpanded) => {
																setExpandedRelationCellKey(
																	nextExpanded ? cellKey : null
																);
															}}
															onNavigate={navigateRelation}
															value={relationDisplayValue}
														/>
													) : (
														<div className="truncate">
															{renderAdminFieldValue(
																field,
																cell.displayValue?.kind === "scalar"
																	? cell.displayValue.value
																	: cell.value
															)}
														</div>
													);
												} else {
													cellContent = (
														<span className="text-muted-foreground">—</span>
													);
												}

												return (
													<div
														className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
														key={`${group.groupId}-${row.record._id}-${column.fieldDefId}`}
													>
														<span className="text-muted-foreground text-xs">
															{column.label}
														</span>
														<div className="max-w-[60%] text-right text-sm">
															{cellContent}
														</div>
													</div>
												);
											})}
										</div>
									</>
								);

								if (!onSelectRecord) {
									return (
										<div
											className="flex h-auto w-full flex-col items-start gap-3 rounded-2xl border border-border/70 bg-background/90 p-4 text-left text-foreground shadow-sm"
											key={row.record._id}
										>
											{cardBody}
										</div>
									);
								}

								return (
									<div
										className="flex h-auto w-full cursor-pointer flex-col items-start gap-3 rounded-2xl border border-border/70 bg-background/90 p-4 text-left text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
										key={row.record._id}
										onClick={() => onSelectRecord(row.record._id)}
										onKeyDown={(event) =>
											handleSelectableCardKeyDown(event, row.record._id)
										}
										role="button"
										tabIndex={0}
									>
										{cardBody}
									</div>
								);
							})}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
