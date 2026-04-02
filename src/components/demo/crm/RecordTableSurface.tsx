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
const RECORD_PAGE_SIZE = 50;

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
		views?.find((view) => view.viewType === "table")
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
	emptyTitle,
	fields,
	kanbanPreview,
	metricSource,
	objectDef,
	onSelectRecord,
	onNextTablePage,
	onPreviousTablePage,
	selectedRecordId,
	tablePreview,
	tablePageIndex,
	viewMode,
}: {
	emptyDescription: string;
	emptyTitle: string;
	fields: FieldDef[] | undefined;
	kanbanPreview: CrmDemoKanbanResult | undefined;
	metricSource: CrmDemoMetricSource;
	objectDef: ObjectDef;
	onSelectRecord?: (record: CrmDemoRecordReference) => void;
	onNextTablePage: () => void;
	onPreviousTablePage: () => void;
	selectedRecordId?: string;
	tablePreview: CrmDemoTableResult | undefined;
	tablePageIndex: number;
	viewMode: RecordViewMode;
}) {
	const activePreview = viewMode === "kanban" ? kanbanPreview : tablePreview;
	const activeRows =
		viewMode === "kanban"
			? buildKanbanRows(kanbanPreview)
			: (tablePreview?.rows ?? []);

	if (fields === undefined || activePreview === undefined) {
		return <RecordSurfaceLoading />;
	}

	const tablePageCount = Math.max(
		1,
		Math.ceil((tablePreview?.totalCount ?? 0) / RECORD_PAGE_SIZE)
	);
	const visibleRangeStart =
		activeRows.length === 0 ? 0 : tablePageIndex * RECORD_PAGE_SIZE + 1;
	const visibleRangeEnd = tablePageIndex * RECORD_PAGE_SIZE + activeRows.length;

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">
					{viewMode === "kanban"
						? `${kanbanPreview?.totalCount ?? 0} grouped records`
						: `${tablePreview?.totalCount ?? 0} records`}
				</Badge>
				<Badge variant="outline">{fields.length} fields</Badge>
				<Badge variant="outline">
					{metricSource === "native" ? "Native Adapter" : "EAV Storage"}
				</Badge>
			</div>

			{activeRows.length === 0 ? (
				<div className="rounded-2xl border border-border/70 border-dashed px-4 py-8">
					{renderEmptyRecordState(emptyDescription, emptyTitle)}
				</div>
			) : null}

			{viewMode === "table" ? (
				<RecordTable
					fields={fields}
					objectDef={objectDef}
					onSelectRecord={onSelectRecord}
					rows={tablePreview?.rows ?? []}
					selectedRecordId={selectedRecordId}
					viewColumns={tablePreview?.columns ?? []}
				/>
			) : null}

			{viewMode === "kanban" && kanbanPreview ? (
				<KanbanView
					fields={fields}
					groups={kanbanPreview.groups}
					objectDef={objectDef}
					onSelectRecord={onSelectRecord}
					selectedRecordId={selectedRecordId}
					viewColumns={tablePreview?.columns ?? []}
				/>
			) : null}

			{viewMode === "table" &&
			(tablePreview?.totalCount ?? 0) > RECORD_PAGE_SIZE ? (
				<div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3 text-sm lg:flex-row lg:items-center lg:justify-between">
					<div className="space-y-1">
						<p className="font-medium">
							Server page {tablePageIndex + 1} of {tablePageCount}
						</p>
						<p className="text-muted-foreground">
							Showing records {visibleRangeStart}-{visibleRangeEnd} of{" "}
							{tablePreview?.totalCount ?? 0}.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							disabled={tablePageIndex === 0}
							onClick={onPreviousTablePage}
							size="sm"
							variant="outline"
						>
							Previous 50
						</Button>
						<Button
							disabled={!tablePreview?.cursor}
							onClick={onNextTablePage}
							size="sm"
							variant="outline"
						>
							Next 50
						</Button>
					</div>
				</div>
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
		if (!(trackMetrics && fields)) {
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
	const [pendingKanbanViewId, setPendingKanbanViewId] = useState<
		Doc<"viewDefs">["_id"] | null
	>(null);
	const [tableCursorHistory, setTableCursorHistory] = useState<
		Array<string | null>
	>([null]);
	const [tablePageIndex, setTablePageIndex] = useState(0);

	const tableView = useMemo(() => buildTableView(views), [views]);
	const kanbanView = useMemo(
		() => views?.find((view) => view.viewType === "kanban"),
		[views]
	);
	const tableCursor = tableCursorHistory[tablePageIndex] ?? null;
	const objectDefId = objectDef?._id;
	const tableViewId = tableView?._id;

	const prevObjectDefId = useRef(objectDefId);
	const prevTableViewId = useRef(tableViewId);
	useEffect(() => {
		if (prevObjectDefId.current !== objectDefId) {
			prevObjectDefId.current = objectDefId;
			setViewMode("table");
			setPendingKanbanViewId(null);
			setTableCursorHistory([null]);
			setTablePageIndex(0);
		}
	}, [objectDefId]);

	useEffect(() => {
		if (prevTableViewId.current === tableViewId) {
			return;
		}

		prevTableViewId.current = tableViewId;
		setTableCursorHistory([null]);
		setTablePageIndex(0);
	}, [tableViewId]);

	useEffect(() => {
		if (
			pendingKanbanViewId &&
			views?.some((view) => view._id === pendingKanbanViewId)
		) {
			setPendingKanbanViewId(null);
		}
	}, [pendingKanbanViewId, views]);

	useEffect(() => {
		if (viewMode === "table" && !tableView && kanbanView && enableKanban) {
			setViewMode("kanban");
			return;
		}

		if (viewMode === "kanban" && !kanbanView && !pendingKanbanViewId) {
			setViewMode("table");
		}
	}, [enableKanban, kanbanView, pendingKanbanViewId, tableView, viewMode]);

	const tablePreview = useQuery(
		api.crm.viewQueries.queryViewRecords,
		tableView
			? {
					cursor: tableCursor,
					limit: RECORD_PAGE_SIZE,
					viewDefId: tableView._id,
				}
			: "skip"
	) as CrmDemoTableResult | undefined;

	const kanbanPreview = useQuery(
		api.crm.viewQueries.queryViewRecords,
		viewMode === "kanban" && kanbanView
			? {
					cursor: null,
					limit: RECORD_PAGE_SIZE,
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
			const nextKanbanViewId = await createView({
				boundFieldId: firstKanbanField._id,
				name: `${objectDef.pluralLabel} Pipeline`,
				objectDefId: objectDef._id,
				viewType: "kanban",
			});
			setPendingKanbanViewId(nextKanbanViewId);
			setViewMode("kanban");
			toast.success(`Created kanban view bound to ${firstKanbanField.label}.`);
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		}
	}

	function handleNextTablePage() {
		if (!tablePreview?.cursor) {
			return;
		}

		setTableCursorHistory((current) =>
			current[tablePageIndex + 1] === tablePreview.cursor
				? current
				: [...current, tablePreview.cursor]
		);
		setTablePageIndex((current) => current + 1);
	}

	function handlePreviousTablePage() {
		setTablePageIndex((current) => Math.max(current - 1, 0));
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
					emptyTitle={emptyTitle}
					fields={fields as FieldDef[] | undefined}
					kanbanPreview={kanbanPreview}
					metricSource={metricSource}
					objectDef={objectDef}
					onNextTablePage={handleNextTablePage}
					onPreviousTablePage={handlePreviousTablePage}
					onSelectRecord={onSelectRecord}
					selectedRecordId={selectedRecordId}
					tablePageIndex={tablePageIndex}
					tablePreview={tablePreview}
					viewMode={viewMode}
				/>
			</CardContent>
		</Card>
	);
}
