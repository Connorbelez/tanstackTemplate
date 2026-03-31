import { useMutation, useQuery } from "convex/react";
import { KanbanSquare, LoaderCircle, Rows3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { renderEmptyRecordState } from "./cell-renderers";
import { KanbanView } from "./KanbanView";
import { useCrmDemoMetrics } from "./MetricsProvider";
import { RecordTable } from "./RecordTable";
import type {
	CrmDemoKanbanResult,
	CrmDemoMetricSource,
	CrmDemoRecordReference,
	CrmDemoTableResult,
	RecordViewMode,
} from "./types";
import {
	estimateEavReadCount,
	extractCrmErrorMessage,
	hasUnifiedRecordShape,
} from "./utils";
import { ViewToggle } from "./ViewToggle";

type ObjectDef = Doc<"objectDefs">;
type FieldDef = Doc<"fieldDefs">;

interface RecordTableSurfaceProps {
	emptyDescription: string;
	emptyTitle: string;
	enableKanban?: boolean;
	metricNote: string;
	metricSource: CrmDemoMetricSource;
	objectDef?: ObjectDef;
	onDataLoaded?: (rows: CrmDemoTableResult["rows"]) => void;
	onSelectRecord?: (record: CrmDemoRecordReference) => void;
	selectedRecordId?: string;
	trackMetrics?: boolean;
}

function buildTableView(views: Doc<"viewDefs">[] | undefined) {
	return (
		views?.find((view) => view.isDefault && view.viewType === "table") ??
		views?.find((view) => view.viewType === "table") ??
		views?.[0]
	);
}

function buildKanbanRows(groups: CrmDemoKanbanResult | undefined) {
	return groups?.groups.flatMap((group) => group.records) ?? [];
}

function RecordSurfaceLoading() {
	return (
		<div className="flex items-center gap-2 text-muted-foreground text-sm">
			<LoaderCircle className="size-4 animate-spin" />
			Loading views and records...
		</div>
	);
}

function RecordSurfaceHeader({
	canCreateKanban,
	canUseKanban,
	enableKanban,
	handleCreateKanbanView,
	objectDef,
	viewMode,
	setViewMode,
}: {
	canCreateKanban: boolean;
	canUseKanban: boolean;
	enableKanban: boolean;
	handleCreateKanbanView: () => void;
	objectDef: ObjectDef;
	setViewMode: (mode: RecordViewMode) => void;
	viewMode: RecordViewMode;
}) {
	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div>
				<CardTitle className="flex items-center gap-2 text-lg">
					{viewMode === "kanban" ? (
						<KanbanSquare className="size-4" />
					) : (
						<Rows3 className="size-4" />
					)}
					{viewMode === "kanban" ? "Kanban validation" : "Record surface"}
				</CardTitle>
				<CardDescription>
					{viewMode === "kanban"
						? `Grouping ${objectDef.pluralLabel} through crm.viewQueries.queryViewRecords with a kanban view.`
						: `Rendering ${objectDef.pluralLabel} through the shared record table surface.`}
				</CardDescription>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{enableKanban ? (
					<ViewToggle
						canUseKanban={canUseKanban}
						mode={viewMode}
						onModeChange={setViewMode}
					/>
				) : null}
				{canCreateKanban ? (
					<Button onClick={handleCreateKanbanView} size="sm" variant="outline">
						Create kanban view
					</Button>
				) : null}
			</div>
		</div>
	);
}

function RecordSurfaceBody({
	emptyDescription,
	fields,
	kanbanPreview,
	metricSource,
	objectDef,
	onSelectRecord,
	selectedRecordId,
	tablePreview,
	viewMode,
}: {
	emptyDescription: string;
	fields: FieldDef[] | undefined;
	kanbanPreview: CrmDemoKanbanResult | undefined;
	metricSource: CrmDemoMetricSource;
	objectDef: ObjectDef;
	onSelectRecord?: (record: CrmDemoRecordReference) => void;
	selectedRecordId?: string;
	tablePreview: CrmDemoTableResult | undefined;
	viewMode: RecordViewMode;
}) {
	if (fields === undefined || tablePreview === undefined) {
		return <RecordSurfaceLoading />;
	}

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">
					{viewMode === "kanban"
						? `${kanbanPreview?.totalCount ?? buildKanbanRows(kanbanPreview).length} grouped records`
						: `${tablePreview.totalCount} records`}
				</Badge>
				<Badge variant="outline">{fields.length} fields</Badge>
				<Badge variant="outline">
					{metricSource === "native" ? "Native Adapter" : "EAV Storage"}
				</Badge>
			</div>

			{tablePreview.rows.length === 0 ? (
				<div className="rounded-2xl border border-border/70 border-dashed px-4 py-8">
					{renderEmptyRecordState(emptyDescription)}
				</div>
			) : null}

			{viewMode === "table" ? (
				<RecordTable
					fields={fields}
					objectDef={objectDef}
					onSelectRecord={onSelectRecord}
					rows={tablePreview.rows}
					selectedRecordId={selectedRecordId}
					viewColumns={tablePreview.columns}
				/>
			) : null}

			{viewMode === "kanban" && kanbanPreview ? (
				<KanbanView
					fields={fields}
					groups={kanbanPreview.groups}
					objectDef={objectDef}
					onSelectRecord={onSelectRecord}
					selectedRecordId={selectedRecordId}
					viewColumns={tablePreview.columns}
				/>
			) : null}
		</>
	);
}

function useRecordSurfaceMetrics({
	activeRows,
	fields,
	metricNote,
	metricSource,
	onDataLoaded,
	trackMetrics,
}: {
	activeRows: CrmDemoTableResult["rows"];
	fields: FieldDef[] | undefined;
	metricNote: string;
	metricSource: CrmDemoMetricSource;
	onDataLoaded?: (rows: CrmDemoTableResult["rows"]) => void;
	trackMetrics: boolean;
}) {
	const { setMetricNotes, setReadCount, setRenderTime, setUnifiedShapeMatch } =
		useCrmDemoMetrics();
	const startedAtRef = useRef<number | null>(null);

	useEffect(() => {
		if (!(trackMetrics && fields && activeRows.length > 0)) {
			return;
		}

		if (startedAtRef.current === null) {
			startedAtRef.current = performance.now();
		}

		setReadCount(
			metricSource,
			metricSource === "eav"
				? estimateEavReadCount(fields, activeRows.length)
				: 4 + activeRows.length
		);
		setRenderTime(Math.round(performance.now() - startedAtRef.current));
		setMetricNotes(metricNote);
		setUnifiedShapeMatch(activeRows.every(hasUnifiedRecordShape));
		onDataLoaded?.(activeRows);
	}, [
		activeRows,
		fields,
		metricNote,
		metricSource,
		onDataLoaded,
		setMetricNotes,
		setReadCount,
		setRenderTime,
		setUnifiedShapeMatch,
		trackMetrics,
	]);
}

export function RecordTableSurface({
	emptyDescription,
	emptyTitle,
	enableKanban = true,
	metricNote,
	metricSource,
	objectDef,
	onDataLoaded,
	onSelectRecord,
	selectedRecordId,
	trackMetrics = true,
}: RecordTableSurfaceProps) {
	const views = useQuery(
		api.crm.viewDefs.listViews,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const fields = useQuery(
		api.crm.fieldDefs.listFields,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const createView = useMutation(api.crm.viewDefs.createView);
	const [viewMode, setViewMode] = useState<RecordViewMode>("table");

	const tableView = useMemo(() => buildTableView(views), [views]);
	const kanbanView = useMemo(
		() => views?.find((view) => view.viewType === "kanban"),
		[views]
	);

	const prevObjectDefId = useRef(objectDef?._id);
	useEffect(() => {
		if (prevObjectDefId.current !== objectDef?._id) {
			prevObjectDefId.current = objectDef?._id;
			setViewMode("table");
		}
	}, [objectDef?._id]);

	useEffect(() => {
		if (viewMode === "kanban" && !kanbanView) {
			setViewMode("table");
		}
	}, [kanbanView, viewMode]);

	const tablePreview = useQuery(
		api.crm.viewQueries.queryViewRecords,
		tableView
			? {
					cursor: null,
					limit: 50,
					viewDefId: tableView._id,
				}
			: "skip"
	) as CrmDemoTableResult | undefined;

	const kanbanPreview = useQuery(
		api.crm.viewQueries.queryViewRecords,
		viewMode === "kanban" && kanbanView
			? {
					cursor: null,
					limit: 50,
					viewDefId: kanbanView._id,
				}
			: "skip"
	) as CrmDemoKanbanResult | undefined;

	const firstKanbanField = useMemo(
		() =>
			(fields ?? []).find((field) =>
				["select", "multi_select"].includes(field.fieldType)
			),
		[fields]
	);
	const activeRows =
		viewMode === "kanban"
			? buildKanbanRows(kanbanPreview)
			: (tablePreview?.rows ?? []);
	const canUseKanban = enableKanban && Boolean(kanbanView);
	const canCreateKanban =
		enableKanban &&
		!objectDef?.isSystem &&
		!kanbanView &&
		Boolean(firstKanbanField);

	useRecordSurfaceMetrics({
		activeRows,
		fields,
		metricNote,
		metricSource,
		onDataLoaded,
		trackMetrics,
	});

	async function handleCreateKanbanView() {
		if (!(objectDef && firstKanbanField)) {
			return;
		}

		try {
			await createView({
				boundFieldId: firstKanbanField._id,
				name: `${objectDef.pluralLabel} Pipeline`,
				objectDefId: objectDef._id,
				viewType: "kanban",
			});
			setViewMode("kanban");
			toast.success(`Created kanban view bound to ${firstKanbanField.label}.`);
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		}
	}

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
				<RecordSurfaceHeader
					canCreateKanban={canCreateKanban}
					canUseKanban={canUseKanban}
					enableKanban={enableKanban}
					handleCreateKanbanView={handleCreateKanbanView}
					objectDef={objectDef}
					setViewMode={setViewMode}
					viewMode={viewMode}
				/>
			</CardHeader>

			<CardContent className="space-y-4">
				<RecordSurfaceBody
					emptyDescription={emptyDescription}
					fields={fields as FieldDef[] | undefined}
					kanbanPreview={kanbanPreview}
					metricSource={metricSource}
					objectDef={objectDef}
					onSelectRecord={onSelectRecord}
					selectedRecordId={selectedRecordId}
					tablePreview={tablePreview}
					viewMode={viewMode}
				/>
			</CardContent>
		</Card>
	);
}
