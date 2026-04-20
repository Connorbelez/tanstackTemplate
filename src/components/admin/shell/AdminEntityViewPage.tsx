"use client";

import { useMutation, useQuery } from "convex/react";
import { CircleDashed, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import {
	type AdminEntityViewMode,
	findSavedViewForSourceView,
	resolveAdminEntityViewContext,
} from "#/lib/admin-view-context";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type {
	RecordFilter,
	RecordSort,
	UserSavedViewDefinition,
} from "../../../../convex/crm/types";
import { AdminEntityKanbanView } from "./AdminEntityKanbanView";
import { AdminEntityTableView } from "./AdminEntityTableView";
import {
	type AdminEntityKanbanFieldOption,
	AdminEntityViewToolbar,
} from "./AdminEntityViewToolbar";
import { AdminPageSkeleton, AdminTableSkeleton } from "./AdminRouteStates";
import { createKanbanFieldOptions } from "./admin-view-rendering";
import type {
	AdminKanbanQueryResult,
	AdminTableQueryResult,
	AdminViewSchemaResult,
} from "./admin-view-types";

type ObjectDef = Doc<"objectDefs">;
const RECORD_PAGE_SIZE = 50;

function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return "Something went wrong while updating the admin view.";
}

function buildKanbanViewName(objectDef: Pick<ObjectDef, "pluralLabel">) {
	return `${objectDef.pluralLabel} Board`;
}

function findFieldIdByName(
	schema: AdminViewSchemaResult | undefined,
	fieldName: string | undefined
) {
	if (!(fieldName && schema)) {
		return undefined;
	}

	const field = schema.fields.find((entry) => entry.name === fieldName);
	return field?.fieldDefId;
}

function serializeFilterValue(value: unknown) {
	return value === undefined ? undefined : JSON.stringify(value);
}

function serializeRecordFilters(filters: readonly RecordFilter[]) {
	return filters.map((filter) => ({
		fieldDefId: filter.fieldDefId,
		logicalOperator: filter.logicalOperator,
		operator: filter.operator,
		value: serializeFilterValue(filter.value),
	}));
}

function renderEmptyState(args: { description: string; title: string }) {
	return (
		<Empty className="rounded-2xl border border-border/70 border-dashed p-8">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CircleDashed className="size-5" />
				</EmptyMedia>
				<EmptyTitle>{args.title}</EmptyTitle>
				<EmptyDescription>{args.description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

export function AdminEntityViewPage({
	entityType,
}: {
	readonly entityType: string;
}) {
	const { open } = useAdminDetailSheet();
	const objectDefs = useQuery(api.crm.objectDefs.listObjects);
	const objectDefOptions = objectDefs ?? [];
	const objectDef = useMemo(
		() =>
			resolveAdminEntityViewContext({
				entityType,
				objectDefs: objectDefOptions,
				savedViews: [],
				views: [],
			}).objectDef,
		[entityType, objectDefOptions]
	);
	const views = useQuery(
		api.crm.viewDefs.listViews,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const savedViews = useQuery(
		api.crm.userSavedViews.listUserSavedViews,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const createView = useMutation(api.crm.viewDefs.createView);
	const updateView = useMutation(api.crm.viewDefs.updateView);
	const createUserSavedView = useMutation(
		api.crm.userSavedViews.createUserSavedView
	);
	const updateUserSavedView = useMutation(
		api.crm.userSavedViews.updateUserSavedView
	);
	const setDefaultUserSavedView = useMutation(
		api.crm.userSavedViews.setDefaultUserSavedView
	);
	const [tablePagination, setTablePagination] = useState<{
		cursorHistory: Array<string | null>;
		pageIndex: number;
	}>({
		cursorHistory: [null],
		pageIndex: 0,
	});
	const [isMutating, setIsMutating] = useState(false);
	const [selectedKanbanFieldId, setSelectedKanbanFieldId] = useState<
		Id<"fieldDefs"> | undefined
	>(undefined);

	const resolvedContext = useMemo(
		() =>
			resolveAdminEntityViewContext({
				entityType,
				objectDefs: objectDefs ?? [],
				savedViews: savedViews ?? [],
				views: views ?? [],
			}),
		[entityType, objectDefs, savedViews, views]
	);
	const activeSourceView = resolvedContext.activeSourceView;
	const activeSavedView = resolvedContext.activeSavedView;
	const schema = useQuery(
		api.crm.viewQueries.getViewSchema,
		activeSourceView
			? {
					viewDefId: activeSourceView._id,
					userSavedViewId: activeSavedView?.userSavedViewId,
				}
			: "skip"
	) as AdminViewSchemaResult | undefined;
	const activeViewMode: AdminEntityViewMode = resolvedContext.viewMode;
	const tableCursor =
		tablePagination.cursorHistory[tablePagination.pageIndex] ?? null;
	const tableResult = useQuery(
		api.crm.viewQueries.queryViewRecords,
		activeSourceView && activeViewMode === "table"
			? {
					cursor: tableCursor,
					limit: RECORD_PAGE_SIZE,
					userSavedViewId: activeSavedView?.userSavedViewId,
					viewDefId: activeSourceView._id,
				}
			: "skip"
	) as AdminTableQueryResult | undefined;
	const kanbanResult = useQuery(
		api.crm.viewQueries.queryViewRecords,
		activeSourceView && activeViewMode === "kanban"
			? {
					cursor: null,
					limit: RECORD_PAGE_SIZE,
					userSavedViewId: activeSavedView?.userSavedViewId,
					viewDefId: activeSourceView._id,
				}
			: "skip"
	) as AdminKanbanQueryResult | undefined;

	const kanbanFieldOptions = useMemo<AdminEntityKanbanFieldOption[]>(
		() => createKanbanFieldOptions(schema?.fields ?? []),
		[schema?.fields]
	);
	const preferredKanbanFieldId = useMemo(() => {
		if (resolvedContext.kanbanView?.boundFieldId) {
			return resolvedContext.kanbanView.boundFieldId;
		}

		const defaultFieldId = findFieldIdByName(
			schema,
			schema?.adapterContract.layoutDefaults.kanbanFieldName
		);
		if (defaultFieldId) {
			return defaultFieldId;
		}

		return kanbanFieldOptions[0]?.fieldDefId;
	}, [kanbanFieldOptions, resolvedContext.kanbanView, schema]);
	const previousActiveViewRef = useRef<string | undefined>(undefined);
	const currentActiveViewKey = activeSourceView?._id;

	useEffect(() => {
		if (previousActiveViewRef.current === currentActiveViewKey) {
			return;
		}

		previousActiveViewRef.current = currentActiveViewKey;
		setTablePagination({
			cursorHistory: [null],
			pageIndex: 0,
		});
	}, [currentActiveViewKey]);

	useEffect(() => {
		if (!preferredKanbanFieldId) {
			setSelectedKanbanFieldId(undefined);
			return;
		}

		setSelectedKanbanFieldId((current) =>
			current === preferredKanbanFieldId ? current : preferredKanbanFieldId
		);
	}, [preferredKanbanFieldId]);

	const isLoadingContext =
		objectDefs === undefined ||
		(objectDef !== undefined &&
			(views === undefined || savedViews === undefined));
	const isLoadingViewData =
		Boolean(activeSourceView) &&
		(schema === undefined ||
			(activeViewMode === "table" && tableResult === undefined) ||
			(activeViewMode === "kanban" && kanbanResult === undefined));
	const pageTitle = resolvedContext.entity?.pluralLabel ?? entityType;
	const pageDescription = objectDef
		? `Shared admin surface for ${objectDef.pluralLabel} backed by the CRM view engine.`
		: `This admin route now resolves through the CRM view engine, but ${pageTitle.toLowerCase()} are not configured for this organization yet.`;
	const kanbanDisabledReason =
		schema?.systemView.disabledLayoutMessages?.kanban ??
		(objectDef
			? "Add an eligible single-select field to unlock kanban layouts."
			: "View engine configuration is required before kanban can be enabled.");
	const canUseKanban = kanbanFieldOptions.length > 0;

	async function ensureDefaultSavedViewFor(args: {
		objectDef: ObjectDef;
		savedViews: readonly UserSavedViewDefinition[];
		viewDefId: Id<"viewDefs">;
		viewName: string;
		viewType: AdminEntityViewMode;
	}) {
		if (
			activeSavedView?.sourceViewDefId === args.viewDefId &&
			activeSavedView.viewType === args.viewType &&
			activeSavedView.isDefault
		) {
			return;
		}

		const existingSavedView = findSavedViewForSourceView({
			savedViews: args.savedViews,
			viewDefId: args.viewDefId,
			viewType: args.viewType,
		});

		if (existingSavedView) {
			await setDefaultUserSavedView({
				userSavedViewId: existingSavedView.userSavedViewId,
			});
			return;
		}

		await createUserSavedView({
			isDefault: true,
			name: args.viewName,
			objectDefId: args.objectDef._id,
			sourceViewDefId: args.viewDefId,
			viewType: args.viewType,
		});
	}

	async function ensureKanbanView(boundFieldId: Id<"fieldDefs">) {
		if (!objectDef) {
			throw new Error("Object definition is not available for this route.");
		}

		if (resolvedContext.kanbanView) {
			if (resolvedContext.kanbanView.boundFieldId !== boundFieldId) {
				await updateView({
					boundFieldId,
					viewDefId: resolvedContext.kanbanView._id,
				});
			}

			return {
				name: resolvedContext.kanbanView.name,
				viewDefId: resolvedContext.kanbanView._id,
			};
		}

		const name = buildKanbanViewName(objectDef);
		const viewDefId = await createView({
			boundFieldId,
			name,
			objectDefId: objectDef._id,
			viewType: "kanban",
		});
		return { name, viewDefId };
	}

	async function handleKanbanFieldChange(nextFieldId: string) {
		const typedFieldId = nextFieldId as Id<"fieldDefs">;
		setSelectedKanbanFieldId(typedFieldId);

		if (!objectDef) {
			return;
		}

		setIsMutating(true);
		try {
			const kanbanView = await ensureKanbanView(typedFieldId);
			if (activeViewMode === "kanban") {
				await ensureDefaultSavedViewFor({
					objectDef,
					savedViews: savedViews ?? [],
					viewDefId: kanbanView.viewDefId,
					viewName: kanbanView.name,
					viewType: "kanban",
				});
			}

			toast.success("Kanban board field updated.");
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setIsMutating(false);
		}
	}

	async function handleViewModeChange(nextMode: AdminEntityViewMode) {
		if (!(objectDef && nextMode !== activeViewMode)) {
			return;
		}

		setIsMutating(true);
		try {
			if (nextMode === "table") {
				if (!resolvedContext.tableView) {
					throw new Error("A table system view is not configured yet.");
				}

				await ensureDefaultSavedViewFor({
					objectDef,
					savedViews: savedViews ?? [],
					viewDefId: resolvedContext.tableView._id,
					viewName: resolvedContext.tableView.name,
					viewType: "table",
				});
				toast.success("Table layout selected.");
				return;
			}

			if (!selectedKanbanFieldId) {
				throw new Error(kanbanDisabledReason);
			}

			const kanbanView = await ensureKanbanView(selectedKanbanFieldId);
			await ensureDefaultSavedViewFor({
				objectDef,
				savedViews: savedViews ?? [],
				viewDefId: kanbanView.viewDefId,
				viewName: kanbanView.name,
				viewType: "kanban",
			});
			toast.success("Kanban layout selected.");
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setIsMutating(false);
		}
	}

	function handleNextTablePage() {
		if (!tableResult?.cursor) {
			return;
		}

		setTablePagination((current) => {
			const nextPageIndex = current.pageIndex + 1;
			const nextCursorHistory =
				current.cursorHistory[nextPageIndex] === tableResult.cursor
					? current.cursorHistory
					: [...current.cursorHistory, tableResult.cursor];

			return {
				cursorHistory: nextCursorHistory,
				pageIndex: nextPageIndex,
			};
		});
	}

	function handlePreviousTablePage() {
		setTablePagination((current) => ({
			...current,
			pageIndex: Math.max(current.pageIndex - 1, 0),
		}));
	}

	async function persistTableSavedViewState(args: {
		filters?: readonly RecordFilter[];
		sort?: RecordSort | null;
		visibleFieldIds?: readonly Id<"fieldDefs">[];
	}) {
		if (
			!(activeViewMode === "table" && objectDef && activeSourceView && schema)
		) {
			return;
		}

		const nextFilters = args.filters ?? schema.effectiveView.filters;
		const nextSort =
			args.sort === undefined ? (schema.effectiveView.sort ?? null) : args.sort;
		const nextVisibleFieldIds =
			args.visibleFieldIds ?? schema.effectiveView.visibleFieldIds;

		setIsMutating(true);
		try {
			if (activeSavedView) {
				await updateUserSavedView({
					fieldOrder: [...schema.effectiveView.fieldOrder],
					filters: serializeRecordFilters(nextFilters),
					sort: nextSort,
					userSavedViewId: activeSavedView.userSavedViewId,
					visibleFieldIds: [...nextVisibleFieldIds],
				});
			} else {
				await createUserSavedView({
					fieldOrder: [...schema.effectiveView.fieldOrder],
					filters: serializeRecordFilters(nextFilters),
					isDefault: true,
					name: activeSourceView.name,
					objectDefId: objectDef._id,
					sort: nextSort,
					sourceViewDefId: activeSourceView._id,
					viewType: "table",
					visibleFieldIds: [...nextVisibleFieldIds],
				});
			}

			setTablePagination({
				cursorHistory: [null],
				pageIndex: 0,
			});
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setIsMutating(false);
		}
	}

	async function handleColumnVisibilityChange(
		fieldDefId: Id<"fieldDefs">,
		nextVisible: boolean
	) {
		if (!schema) {
			return;
		}

		const currentVisibleFieldIds = schema.effectiveView.visibleFieldIds;
		const currentVisibleSet = new Set(
			currentVisibleFieldIds.map((visibleFieldId) => String(visibleFieldId))
		);
		const isCurrentlyVisible = currentVisibleSet.has(String(fieldDefId));

		if (nextVisible === isCurrentlyVisible) {
			return;
		}

		if (!nextVisible && currentVisibleFieldIds.length === 1) {
			toast.error("At least one table column must remain visible.");
			return;
		}

		const nextVisibleFieldIds = nextVisible
			? schema.effectiveView.fieldOrder.filter(
					(candidateFieldDefId) =>
						String(candidateFieldDefId) === String(fieldDefId) ||
						currentVisibleSet.has(String(candidateFieldDefId))
				)
			: currentVisibleFieldIds.filter(
					(candidateFieldDefId) =>
						String(candidateFieldDefId) !== String(fieldDefId)
				);

		await persistTableSavedViewState({
			visibleFieldIds: nextVisibleFieldIds,
		});
	}

	async function handleColumnFilterChange(
		fieldDefId: Id<"fieldDefs">,
		nextFilter: {
			logicalOperator?: RecordFilter["logicalOperator"];
			operator: RecordFilter["operator"];
			value: unknown;
		} | null
	) {
		if (!schema) {
			return;
		}

		const nextFilters = schema.effectiveView.filters.filter(
			(filter) => String(filter.fieldDefId) !== String(fieldDefId)
		);

		if (nextFilter) {
			nextFilters.push({
				fieldDefId,
				logicalOperator: nextFilter.logicalOperator,
				operator: nextFilter.operator,
				value: nextFilter.value,
			});
		}

		await persistTableSavedViewState({
			filters: nextFilters,
		});
	}

	async function handleColumnSortChange(
		fieldDefId: Id<"fieldDefs">,
		direction: RecordSort["direction"] | null
	) {
		await persistTableSavedViewState({
			sort: direction
				? {
						direction,
						fieldDefId,
					}
				: null,
		});
	}

	async function handleClearAllTableControls() {
		await persistTableSavedViewState({
			filters: [],
			sort: null,
		});
	}

	async function handleClearTableSort() {
		await persistTableSavedViewState({
			sort: null,
		});
	}

	async function handleRestoreDefaultTableControls() {
		if (!schema) {
			return;
		}

		await persistTableSavedViewState({
			filters: schema.systemView.filters,
			sort: null,
			visibleFieldIds: schema.systemView.visibleFieldIds,
		});
	}

	if (isLoadingContext) {
		return (
			<AdminPageSkeleton descriptionWidth="w-72" titleWidth="w-56">
				<AdminTableSkeleton columnCount={4} rowCount={6} />
			</AdminPageSkeleton>
		);
	}

	if (!objectDef) {
		return (
			<div className="space-y-6">
				<AdminEntityViewToolbar
					canUseKanban={false}
					description={pageDescription}
					kanbanDisabledReason={kanbanDisabledReason}
					onViewModeChange={() => undefined}
					title={pageTitle}
					viewMode="table"
				/>
				{renderEmptyState({
					description:
						"Create or bootstrap the matching CRM object definition before this admin route can render real records.",
					title: "View engine not configured",
				})}
			</div>
		);
	}

	if (!activeSourceView) {
		return (
			<div className="space-y-6">
				<AdminEntityViewToolbar
					canUseKanban={false}
					description={pageDescription}
					kanbanDisabledReason={kanbanDisabledReason}
					onViewModeChange={() => undefined}
					title={pageTitle}
					viewMode="table"
				/>
				{renderEmptyState({
					description:
						"This object does not have a system view yet, so there is no admin layout to render.",
					title: "No system views available",
				})}
			</div>
		);
	}

	if (isLoadingViewData || !schema) {
		return (
			<div className="space-y-6">
				<AdminEntityViewToolbar
					canUseKanban={false}
					description={pageDescription}
					isMutating={isMutating}
					onViewModeChange={() => undefined}
					title={pageTitle}
					viewMode={activeViewMode}
				/>
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<LoaderCircle className="size-4 animate-spin" />
					Loading view configuration...
				</div>
				<AdminTableSkeleton columnCount={4} rowCount={6} />
			</div>
		);
	}

	const activeTotalCount =
		activeViewMode === "kanban"
			? (kanbanResult?.totalCount ?? 0)
			: (tableResult?.totalCount ?? 0);
	const activeCountExact =
		activeViewMode === "kanban"
			? (kanbanResult?.totalCountExact ?? true)
			: (tableResult?.totalCountExact ?? true);
	const activeRows =
		activeViewMode === "kanban"
			? (kanbanResult?.groups.flatMap((group) => group.rows) ?? [])
			: (tableResult?.page.rows ?? []);
	const activeCountLabel =
		activeViewMode === "kanban"
			? `${activeTotalCount}${activeCountExact ? "" : "+"} grouped records`
			: `${activeTotalCount}${activeCountExact ? "" : "+"} records`;

	return (
		<div className="space-y-6">
			<AdminEntityViewToolbar
				canUseKanban={canUseKanban}
				description={pageDescription}
				isMutating={isMutating}
				kanbanDisabledReason={kanbanDisabledReason}
				kanbanFieldOptions={kanbanFieldOptions}
				metaSlot={
					<>
						<Badge variant="secondary">
							{schema.adapterContract.variant === "dedicated"
								? "Dedicated adapter"
								: "Metadata fallback"}
						</Badge>
						<Badge variant="outline">
							{activeSavedView ? "Saved view" : "System view"}
						</Badge>
						<Badge variant="outline">{activeCountLabel}</Badge>
					</>
				}
				onKanbanFieldChange={(fieldDefId) => {
					void handleKanbanFieldChange(fieldDefId);
				}}
				onViewModeChange={(mode) => {
					void handleViewModeChange(mode);
				}}
				selectedKanbanFieldId={selectedKanbanFieldId}
				title={pageTitle}
				viewMode={activeViewMode}
			/>

			{activeRows.length === 0 ? (
				<div className="rounded-2xl border border-border/70 border-dashed px-4 py-8">
					{renderEmptyState({
						description:
							activeViewMode === "kanban"
								? "No records match the current kanban layout yet."
								: "No records match the current table layout yet.",
						title: "No records available",
					})}
				</div>
			) : null}

			{activeViewMode === "table" && tableResult && activeRows.length > 0 ? (
				<>
					<AdminEntityTableView
						activeFilters={schema.effectiveView.filters}
						activeSort={schema.effectiveView.sort}
						adapterContract={schema.adapterContract}
						columns={tableResult.columns}
						defaultVisibleFieldIds={schema.systemView.visibleFieldIds}
						fields={schema.fields}
						footerAggregates={tableResult.footerAggregates}
						isMutating={isMutating}
						objectDef={objectDef}
						onApplyColumnFilter={(fieldDefId, nextFilter) => {
							void handleColumnFilterChange(fieldDefId, nextFilter);
						}}
						onChangeColumnSort={(fieldDefId, direction) => {
							void handleColumnSortChange(fieldDefId, direction);
						}}
						onChangeColumnVisibility={(fieldDefId, nextVisible) => {
							void handleColumnVisibilityChange(fieldDefId, nextVisible);
						}}
						onClearAllControls={() => {
							void handleClearAllTableControls();
						}}
						onClearFieldFilter={(fieldDefId) => {
							void handleColumnFilterChange(fieldDefId, null);
						}}
						onClearSort={() => {
							void handleClearTableSort();
						}}
						onRestoreDefaults={() => {
							void handleRestoreDefaultTableControls();
						}}
						onSelectRecord={(recordId) => open(recordId)}
						rows={tableResult.page.rows}
						schemaColumns={schema.columns}
					/>
					{tableResult.totalCount > RECORD_PAGE_SIZE ? (
						<div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3 text-sm lg:flex-row lg:items-center lg:justify-between">
							<div className="space-y-1">
								<p className="font-medium">
									Server page {tablePagination.pageIndex + 1}
								</p>
								<p className="text-muted-foreground">
									Showing records{" "}
									{tablePagination.pageIndex * RECORD_PAGE_SIZE + 1}-
									{tablePagination.pageIndex * RECORD_PAGE_SIZE +
										tableResult.page.rows.length}{" "}
									of {tableResult.totalCount}
									{tableResult.totalCountExact ? "." : "+."}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Button
									disabled={tablePagination.pageIndex === 0}
									onClick={handlePreviousTablePage}
									size="sm"
									variant="outline"
								>
									Previous 50
								</Button>
								<Button
									disabled={!tableResult.cursor}
									onClick={handleNextTablePage}
									size="sm"
									variant="outline"
								>
									Next 50
								</Button>
							</div>
						</div>
					) : null}
				</>
			) : null}

			{activeViewMode === "kanban" && kanbanResult && activeRows.length > 0 ? (
				<AdminEntityKanbanView
					adapterContract={schema.adapterContract}
					columns={kanbanResult.columns}
					fields={schema.fields}
					groups={kanbanResult.groups}
					objectDef={objectDef}
					onSelectRecord={(recordId) => open(recordId)}
				/>
			) : null}

			<Empty className="border-0 px-0 py-0">
				<EmptyContent className="justify-start px-0">
					<p className="text-muted-foreground text-xs">
						Kanban remains read-only in this release. Drag-and-drop status
						changes are intentionally disabled.
					</p>
				</EmptyContent>
			</Empty>
		</div>
	);
}
