"use client";

import { TableCell, TableFooter, TableRow } from "#/components/ui/table";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	NormalizedFieldDefinition,
	TableFooterAggregateResult,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import { renderAdminFieldValue } from "./admin-view-rendering";
import type { AdminViewColumn } from "./admin-view-types";

type ObjectDef = Pick<Doc<"objectDefs">, "nativeTable">;

interface AdminTableAggregateFooterProps {
	readonly columns: readonly AdminViewColumn[];
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly footerAggregates: readonly TableFooterAggregateResult[];
	readonly objectDef: ObjectDef;
	readonly rowCount: number;
	readonly rowKind?: UnifiedRecord["_kind"];
}

export function AdminTableAggregateFooter({
	columns,
	fields,
	footerAggregates,
	objectDef,
	rowCount,
	rowKind,
}: AdminTableAggregateFooterProps) {
	if (footerAggregates.length === 0) {
		return null;
	}

	const footerByFieldName = new Map(
		footerAggregates.map(
			(aggregate) => [aggregate.fieldName, aggregate] as const
		)
	);
	const fieldsByName = new Map(
		fields.map((field) => [field.name, field] as const)
	);

	return (
		<TableFooter>
			<TableRow className="hover:bg-muted/50">
				<TableCell className="align-top">
					<div className="space-y-1">
						<p className="font-medium text-xs uppercase tracking-[0.12em]">
							Footer
						</p>
						<p className="text-muted-foreground text-xs">
							{rowCount} row{rowCount === 1 ? "" : "s"}
						</p>
					</div>
				</TableCell>

				{columns.map((column) => {
					const aggregate = footerByFieldName.get(column.name);
					const field = fieldsByName.get(column.name);

					return (
						<TableCell
							className="align-top"
							key={`footer-${column.fieldDefId}`}
						>
							{aggregate && field ? (
								<div className="space-y-1">
									<p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
										Summary
									</p>
									<div className="font-medium text-sm">
										{renderAdminFieldValue(field, aggregate.summary, {
											_kind: rowKind ?? "native",
											nativeTable: objectDef.nativeTable ?? null,
										})}
									</div>
								</div>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
					);
				})}
			</TableRow>
		</TableFooter>
	);
}
