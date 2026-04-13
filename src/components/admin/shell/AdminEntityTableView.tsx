"use client";

import { Badge } from "#/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import {
	getAdminRecordSupportingText,
	getAdminRecordTitle,
	renderAdminFieldValue,
} from "./admin-view-rendering";
import type { AdminViewColumn } from "./admin-view-types";

type ObjectDef = Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;

interface AdminEntityTableViewProps {
	readonly adapterContract: Pick<EntityViewAdapterContract, "titleFieldName">;
	readonly columns: readonly AdminViewColumn[];
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly objectDef: ObjectDef;
	readonly onSelectRecord?: (recordId: string) => void;
	readonly rows: readonly UnifiedRecord[];
}

export function AdminEntityTableView({
	adapterContract,
	columns,
	fields,
	objectDef,
	onSelectRecord,
	rows,
}: AdminEntityTableViewProps) {
	const visibleColumns = columns
		.filter((column) => column.isVisible)
		.sort((left, right) => left.displayOrder - right.displayOrder);
	const fieldsByName = new Map(
		fields.map((field) => [field.name, field] as const)
	);

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
					{rows.map((record) => (
						<TableRow
							className={cn(
								onSelectRecord && "cursor-pointer hover:bg-muted/40"
							)}
							key={record._id}
							onClick={() => onSelectRecord?.(record._id)}
						>
							<TableCell>
								<div className="space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-medium">
											{getAdminRecordTitle({
												adapterContract,
												fields,
												record,
											})}
										</p>
										<Badge
											variant={
												record._kind === "native" ? "secondary" : "outline"
											}
										>
											{record._kind === "native"
												? "Native Adapter"
												: "EAV Storage"}
										</Badge>
									</div>
									<p className="text-muted-foreground text-xs">
										{getAdminRecordSupportingText(record, objectDef)}
									</p>
								</div>
							</TableCell>
							{visibleColumns.map((column) => {
								const field = fieldsByName.get(column.name);
								return (
									<TableCell
										className="align-top"
										key={`${record._id}-${column.fieldDefId}`}
									>
										<div className="max-w-[220px] truncate text-sm">
											{field ? (
												renderAdminFieldValue(field, record.fields[column.name])
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</div>
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
