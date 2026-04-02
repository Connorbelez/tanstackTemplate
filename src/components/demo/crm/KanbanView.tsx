import { Layers3 } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
	getRecordSupportingText,
	getRecordTitle,
	renderFieldValue,
	renderSourceBadge,
} from "./cell-renderers";
import type {
	CrmDemoKanbanResult,
	CrmDemoRecordReference,
	CrmDemoViewColumn,
} from "./types";

type FieldDef = Doc<"fieldDefs">;

interface KanbanViewProps {
	fields: FieldDef[];
	groups: CrmDemoKanbanResult["groups"];
	objectDef: Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;
	onSelectRecord?: (record: CrmDemoRecordReference) => void;
	selectedRecordId?: string;
	viewColumns: CrmDemoViewColumn[];
}

export function KanbanView({
	fields,
	groups,
	objectDef,
	onSelectRecord,
	selectedRecordId,
	viewColumns,
}: KanbanViewProps) {
	const previewColumns = viewColumns
		.filter((column) => column.isVisible)
		.slice(0, 3);
	const fieldMap = new Map(fields.map((field) => [field.name, field]));

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
							<Badge variant="outline">{group.color}</Badge>
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
										"h-auto w-full flex-col items-start gap-3 rounded-2xl border border-border/70 bg-background/90 p-4 text-left text-foreground shadow-sm hover:bg-background",
										selectedRecordId === record._id &&
											"border-primary/50 ring-2 ring-primary/15"
									)}
									key={record._id}
									onClick={() =>
										onSelectRecord?.({
											labelValue: getRecordTitle(record, fields),
											objectDefId: record.objectDefId,
											recordId: record._id,
											recordKind: record._kind,
										})
									}
									variant="ghost"
								>
									<div className="flex w-full items-start justify-between gap-3">
										<div className="space-y-1">
											<p className="font-medium text-sm">
												{getRecordTitle(record, fields)}
											</p>
											<p className="text-muted-foreground text-xs">
												{getRecordSupportingText(record, objectDef)}
											</p>
										</div>
										{renderSourceBadge(record._kind)}
									</div>

									<div className="grid w-full gap-2">
										{previewColumns.map((column) => {
											const field = fieldMap.get(column.name);
											if (!field) {
												return null;
											}

											return (
												<div
													className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
													key={`${group.groupId}-${record._id}-${column.name}`}
												>
													<span className="text-muted-foreground text-xs">
														{column.label}
													</span>
													<div className="max-w-[60%] truncate text-right text-sm">
														{renderFieldValue(
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
