import { useQuery } from "convex/react";
import { LoaderCircle, Rows3 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { useCrmDemoMetrics } from "./MetricsProvider";
import type { CrmDemoMetricSource, CrmDemoRecordKind } from "./types";
import {
	estimateEavReadCount,
	formatFieldValue,
	hasUnifiedRecordShape,
} from "./utils";

type ObjectDef = Doc<"objectDefs">;
type FieldDef = Doc<"fieldDefs">;

interface RecordTableSurfaceProps {
	emptyDescription: string;
	emptyTitle: string;
	metricNote: string;
	metricSource: CrmDemoMetricSource;
	objectDef?: ObjectDef;
	onSelectRecord?: (record: {
		recordId: string;
		recordKind: CrmDemoRecordKind;
	}) => void;
	selectedRecordId?: string;
	trackMetrics?: boolean;
}

export function RecordTableSurface({
	emptyDescription,
	emptyTitle,
	metricNote,
	metricSource,
	objectDef,
	onSelectRecord,
	selectedRecordId,
	trackMetrics = true,
}: RecordTableSurfaceProps) {
	const views = useQuery(
		api.crm.viewDefs.listViews,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const defaultView = useMemo(
		() => views?.find((view) => view.isDefault) ?? views?.[0],
		[views]
	);
	const preview = useQuery(
		api.crm.viewQueries.queryViewRecords,
		defaultView
			? {
					viewDefId: defaultView._id,
					cursor: null,
					limit: 25,
				}
			: "skip"
	);
	const fields = useQuery(
		api.crm.fieldDefs.listFields,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const tablePreview = preview && "rows" in preview ? preview : undefined;
	const { setMetricNotes, setReadCount, setRenderTime, setUnifiedShapeMatch } =
		useCrmDemoMetrics();
	const startedAtRef = useRef(performance.now());

	useEffect(() => {
		if (trackMetrics && tablePreview && fields) {
			startedAtRef.current = performance.now();
		}
	}, [trackMetrics, tablePreview, fields]);

	useEffect(() => {
		if (!(trackMetrics && tablePreview && fields)) {
			return;
		}

		setReadCount(
			metricSource,
			metricSource === "eav"
				? estimateEavReadCount(fields, tablePreview.rows.length)
				: 4 + tablePreview.rows.length
		);
		setRenderTime(Math.round(performance.now() - startedAtRef.current));
		setMetricNotes(metricNote);
		setUnifiedShapeMatch(tablePreview.rows.every(hasUnifiedRecordShape));
	}, [
		fields,
		metricNote,
		metricSource,
		setMetricNotes,
		setReadCount,
		setRenderTime,
		setUnifiedShapeMatch,
		tablePreview,
		trackMetrics,
	]);

	if (!objectDef) {
		return (
			<Card className="border-border/70 shadow-sm">
				<CardHeader>
					<CardTitle className="text-lg">{emptyTitle}</CardTitle>
					<CardDescription>{emptyDescription}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader>
				<div className="flex items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2 text-lg">
							<Rows3 className="size-4" />
							Live record preview
						</CardTitle>
						<CardDescription>
							Querying `{defaultView?.name ?? "default view"}` for{" "}
							{objectDef.pluralLabel}.
						</CardDescription>
					</div>
					{defaultView ? (
						<Badge variant="outline">{defaultView.viewType}</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{tablePreview === undefined || fields === undefined ? (
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<LoaderCircle className="size-4 animate-spin" />
						Loading records and view schema...
					</div>
				) : null}

				{tablePreview &&
				tablePreview.rows.length > 0 &&
				fields &&
				fields.length > 0 ? (
					<>
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<Badge variant="secondary">
									{tablePreview.totalCount} records
								</Badge>
								<Badge variant="outline">{fields.length} fields</Badge>
							</div>
							<p className="text-muted-foreground text-xs">
								UnifiedRecord rows from `crm.viewQueries.queryViewRecords`
							</p>
						</div>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[180px]">Record</TableHead>
									{fields.map((field) => (
										<TableHead key={field._id}>{field.label}</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{tablePreview.rows.map((row) => (
									<TableRow
										className={cn(
											onSelectRecord && "cursor-pointer",
											row._id === selectedRecordId && "bg-muted/40"
										)}
										key={row._id}
										onClick={() =>
											onSelectRecord?.({
												recordId: row._id,
												recordKind: row._kind,
											})
										}
									>
										<TableCell className="font-medium">
											<div>
												<p>{row._kind}</p>
												<p className="text-muted-foreground text-xs">
													{row._id}
												</p>
											</div>
										</TableCell>
										{fields.map((field: FieldDef) => (
											<TableCell key={`${row._id}-${field._id}`}>
												{formatFieldValue(field, row.fields[field.name])}
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</>
				) : null}

				{tablePreview && tablePreview.rows.length === 0 ? (
					<div className="rounded-2xl border border-border/70 border-dashed px-4 py-8 text-center">
						<p className="font-medium text-sm">No records yet</p>
						<p className="mt-1 text-muted-foreground text-sm">
							{emptyDescription}
						</p>
					</div>
				) : null}

				<Separator />

				<div className="grid gap-3 md:grid-cols-3">
					<PreviewCallout label="View source" value="viewDefs.listViews" />
					<PreviewCallout
						label="Query source"
						value="viewQueries.queryViewRecords"
					/>
					<PreviewCallout label="Contract" value="UnifiedRecord[]" />
				</div>
			</CardContent>
		</Card>
	);
}

function PreviewCallout({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
				{label}
			</p>
			<p className="mt-1 font-medium text-sm">{value}</p>
		</div>
	);
}
