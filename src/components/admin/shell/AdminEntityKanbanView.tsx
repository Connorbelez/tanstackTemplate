"use client";

import { Layers3 } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
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

type ObjectDef = Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;

interface AdminEntityKanbanViewProps {
	readonly adapterContract: Pick<EntityViewAdapterContract, "titleFieldName">;
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
	const previewColumns = columns
		.filter((column) => column.isVisible)
		.sort((left, right) => left.displayOrder - right.displayOrder)
		.slice(0, 3);
	const fieldsByName = new Map(
		fields.map((field) => [field.name, field] as const)
	);

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

							{group.records.map((record) => (
								<Button
									className={cn(
										"h-auto w-full flex-col items-start gap-3 rounded-2xl border border-border/70 bg-background/90 p-4 text-left text-foreground shadow-sm hover:bg-background"
									)}
									key={record._id}
									onClick={() => onSelectRecord?.(record._id)}
									variant="ghost"
								>
									<div className="flex w-full items-start justify-between gap-3">
										<div className="space-y-1">
											<p className="font-medium text-sm">
												{getAdminRecordTitle({
													adapterContract,
													fields,
													record,
												})}
											</p>
											<p className="text-muted-foreground text-xs">
												{getAdminRecordSupportingText(record, objectDef)}
											</p>
										</div>
										<Badge
											variant={
												record._kind === "native" ? "secondary" : "outline"
											}
										>
											{record._kind === "native" ? "Native" : "EAV"}
										</Badge>
									</div>

									<div className="grid w-full gap-2">
										{previewColumns.map((column) => {
											const field = fieldsByName.get(column.name);
											if (!field) {
												return null;
											}

											return (
												<div
													className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
													key={`${group.groupId}-${record._id}-${column.fieldDefId}`}
												>
													<span className="text-muted-foreground text-xs">
														{column.label}
													</span>
													<div className="max-w-[60%] truncate text-right text-sm">
														{renderAdminFieldValue(
															field,
															record.fields[column.name]
														)}
													</div>
												</div>
											);
										})}
									</div>
								</Button>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
