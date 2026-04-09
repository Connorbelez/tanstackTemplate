import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Viewer } from "../fluent";
import { resolveEntityViewAdapterContract } from "./entityAdapterRegistry";
import {
	materializeFieldDef,
	materializeFieldDefinition,
} from "./metadataCompiler";
import { loadActiveFieldDefs } from "./recordQueries";
import type {
	AggregatePreset,
	EffectiveViewDefinition,
	EntityViewAdapterContract,
	EntityViewRow,
	NormalizedFieldDefinition,
	RecordFilter,
	SavedViewFilterDefinition,
	SystemViewDefinition,
	UserSavedViewDefinition,
	ViewAggregateResult,
} from "./types";

type FieldDef = Doc<"fieldDefs">;
type ViewField = Doc<"viewFields">;
type CrmQueryCtx = QueryCtx & { viewer: Viewer };
type DbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type FieldDefId = Id<"fieldDefs">;
type ViewDefDoc = Doc<"viewDefs">;
type ViewFieldDoc = Doc<"viewFields">;
type ViewFilterDoc = Doc<"viewFilters">;
type UserSavedViewDoc = Doc<"userSavedViews">;
interface SavedViewFilterSource {
	filters?: SavedViewFilterDefinition[];
	filtersJson?: string;
}
type UserSavedViewSnapshot = Omit<
	UserSavedViewDefinition,
	"ownerAuthId" | "userSavedViewId"
>;
interface ColumnCandidate {
	displayOrder: number;
	fieldDefId: Id<"fieldDefs">;
	fieldType: FieldDef["fieldType"];
	isVisibleByDefault: boolean;
	label: string;
	name: string;
	width: number | undefined;
}

export interface ViewColumnDefinition {
	displayOrder: number;
	fieldDefId: Id<"fieldDefs">;
	fieldType: FieldDef["fieldType"];
	isVisible: boolean;
	label: string;
	name: string;
	width: number | undefined;
}

export interface EffectiveViewState {
	effectiveView: EffectiveViewDefinition;
	savedView: UserSavedViewDefinition | null;
	systemView: SystemViewDefinition;
	viewDef: ViewDefDoc;
	viewFields: ViewFieldDoc[];
}

export interface ResolvedViewState {
	activeFieldDefs: FieldDef[];
	adapterContract: EntityViewAdapterContract;
	columns: ViewColumnDefinition[];
	effectiveView: EffectiveViewDefinition;
	fieldDefsById: Map<string, FieldDef>;
	fields: NormalizedFieldDefinition[];
	objectDef: Doc<"objectDefs">;
	savedView: UserSavedViewDefinition | null;
	systemView: SystemViewDefinition;
	view: SystemViewDefinition;
	viewDef: ViewDefDoc;
}

function toNormalizedFieldDefinition(
	fieldDef: FieldDef
): NormalizedFieldDefinition {
	return materializeFieldDefinition(fieldDef);
}

function parseStoredFilterValue(value: string | undefined): unknown {
	if (value === undefined) {
		return undefined;
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function normalizeFieldOrder(
	preferred: FieldDefId[] | undefined,
	fallback: FieldDefId[]
): FieldDefId[] {
	const orderedIds = preferred && preferred.length > 0 ? preferred : fallback;
	const uniqueIds = new Set<string>();
	const normalized: FieldDefId[] = [];

	for (const fieldId of [...orderedIds, ...fallback]) {
		const key = fieldId.toString();
		if (uniqueIds.has(key)) {
			continue;
		}
		uniqueIds.add(key);
		normalized.push(fieldId);
	}

	return normalized;
}

function normalizeVisibleFieldIds(
	preferred: FieldDefId[] | undefined,
	fallback: FieldDefId[]
): FieldDefId[] {
	const sourceIds = preferred ?? fallback;
	const uniqueIds = new Set<string>();
	const normalized: FieldDefId[] = [];

	for (const fieldId of sourceIds) {
		const key = fieldId.toString();
		if (uniqueIds.has(key)) {
			continue;
		}
		uniqueIds.add(key);
		normalized.push(fieldId);
	}

	return normalized;
}

function deriveDisabledLayoutMessages(
	fieldDefs: FieldDef[]
): SystemViewDefinition["disabledLayoutMessages"] | undefined {
	const materializedFieldDefs = fieldDefs.map(materializeFieldDef);
	const messages: NonNullable<SystemViewDefinition["disabledLayoutMessages"]> =
		{};

	if (
		!materializedFieldDefs.some(
			(fieldDef) => fieldDef.layoutEligibility.table.enabled
		)
	) {
		messages.table = "Table layout requires at least one active field.";
	}

	if (
		!materializedFieldDefs.some(
			(fieldDef) => fieldDef.layoutEligibility.kanban.enabled
		)
	) {
		messages.kanban =
			"Add a select or multi-select field to unlock kanban layouts.";
	}

	if (
		!materializedFieldDefs.some(
			(fieldDef) => fieldDef.layoutEligibility.calendar.enabled
		)
	) {
		messages.calendar =
			"Add a date or datetime field to unlock calendar layouts.";
	}

	return Object.keys(messages).length > 0 ? messages : undefined;
}

function buildAdapterContract(args: {
	fieldDefs: FieldDef[];
	objectDef: Doc<"objectDefs">;
	viewDef: ViewDefDoc;
}): EntityViewAdapterContract {
	return resolveEntityViewAdapterContract({
		currentLayout: args.viewDef.viewType,
		fieldDefs: args.fieldDefs,
		objectDef: args.objectDef,
		objectDefId: args.objectDef._id,
	});
}

function buildSchemaOrderHints(args: {
	adapterContract: EntityViewAdapterContract;
	viewIsDefault: boolean;
}): Map<string, number> {
	const orderHints = new Map<string, number>();

	if (!args.viewIsDefault) {
		return orderHints;
	}

	args.adapterContract.layoutDefaults.preferredVisibleFieldNames.forEach(
		(fieldName, index) => {
			orderHints.set(fieldName, index);
		}
	);

	return orderHints;
}

function buildFieldOverridesByName(
	adapterContract: EntityViewAdapterContract
): Map<string, EntityViewAdapterContract["fieldOverrides"][number]> {
	return new Map(
		adapterContract.fieldOverrides.map((override) => [
			override.fieldName,
			override,
		])
	);
}

function applyFieldOverridesToColumn(args: {
	column: ViewColumnDefinition;
	currentLayout: SystemViewDefinition["layout"];
	override?: EntityViewAdapterContract["fieldOverrides"][number];
}): ViewColumnDefinition {
	const hiddenInCurrentLayout =
		args.override?.hiddenInLayouts?.includes(args.currentLayout) ?? false;

	return {
		...args.column,
		isVisible: hiddenInCurrentLayout
			? false
			: (args.override?.isVisibleByDefault ?? args.column.isVisible),
		label: args.override?.label ?? args.column.label,
	};
}

function toSyntheticFieldDefId(fieldName: string): Id<"fieldDefs"> {
	return `computed:${fieldName}` as Id<"fieldDefs">;
}

function applyFieldOverridesToDefinition(args: {
	currentLayout: SystemViewDefinition["layout"];
	field: NormalizedFieldDefinition;
	override?: EntityViewAdapterContract["fieldOverrides"][number];
}): NormalizedFieldDefinition {
	const hiddenInCurrentLayout =
		args.override?.hiddenInLayouts?.includes(args.currentLayout) ?? false;

	return {
		...args.field,
		displayOrder: args.field.displayOrder,
		isVisibleByDefault: hiddenInCurrentLayout
			? false
			: (args.override?.isVisibleByDefault ?? args.field.isVisibleByDefault),
		label: args.override?.label ?? args.field.label,
	};
}

function toComputedNormalizedFieldDefinition(args: {
	computedField: EntityViewAdapterContract["computedFields"][number];
	displayOrder: number;
	objectDefId: Id<"objectDefs">;
}): NormalizedFieldDefinition {
	return {
		aggregation: {
			enabled: false,
			reason: "Computed adapter fields do not support aggregation.",
			supportedFunctions: [],
		},
		computed: {
			expressionKey: args.computedField.expressionKey,
			sourceFieldNames: args.computedField.sourceFieldNames,
		},
		description: args.computedField.description,
		displayOrder: args.displayOrder,
		editability: {
			mode: "computed",
			reason: "Computed adapter fields are read-only projections.",
		},
		fieldDefId: toSyntheticFieldDefId(args.computedField.fieldName),
		fieldSource: "adapter_computed",
		fieldType: args.computedField.fieldType,
		isActive: true,
		isRequired: false,
		isUnique: false,
		isVisibleByDefault: args.computedField.isVisibleByDefault,
		label: args.computedField.label,
		layoutEligibility: {
			table: { enabled: true },
			kanban: {
				enabled: false,
				reason: "Computed adapter fields cannot drive kanban grouping.",
			},
			calendar: {
				enabled: false,
				reason: "Computed adapter fields cannot drive calendar layouts.",
			},
			groupBy: {
				enabled: false,
				reason: "Computed adapter fields cannot drive grouping.",
			},
		},
		name: args.computedField.fieldName,
		nativeReadOnly: true,
		normalizedFieldKind: "computed",
		objectDefId: args.objectDefId,
		options: undefined,
		relation: undefined,
		rendererHint: args.computedField.rendererHint,
	};
}

function compareSchemaOrderedEntries(args: {
	left: { displayOrder: number; name: string };
	right: { displayOrder: number; name: string };
	orderHints: ReadonlyMap<string, number>;
	overrideByName: ReadonlyMap<
		string,
		EntityViewAdapterContract["fieldOverrides"][number]
	>;
}): number {
	const leftHint = args.orderHints.get(args.left.name);
	const rightHint = args.orderHints.get(args.right.name);
	const leftOverride = args.overrideByName.get(args.left.name);
	const rightOverride = args.overrideByName.get(args.right.name);

	if (leftHint !== undefined || rightHint !== undefined) {
		if (leftHint === undefined) {
			return 1;
		}
		if (rightHint === undefined) {
			return -1;
		}
		if (leftHint !== rightHint) {
			return leftHint - rightHint;
		}
	}

	const leftOverrideOrder = leftOverride?.preferredDisplayOrder;
	const rightOverrideOrder = rightOverride?.preferredDisplayOrder;
	if (leftOverrideOrder !== undefined || rightOverrideOrder !== undefined) {
		if (leftOverrideOrder === undefined) {
			return 1;
		}
		if (rightOverrideOrder === undefined) {
			return -1;
		}
		if (leftOverrideOrder !== rightOverrideOrder) {
			return leftOverrideOrder - rightOverrideOrder;
		}
	}

	if (args.left.displayOrder !== args.right.displayOrder) {
		return args.left.displayOrder - args.right.displayOrder;
	}

	return args.left.name.localeCompare(args.right.name);
}

function parseLegacySavedViewFiltersJson(
	filtersJson: string | undefined
): SavedViewFilterDefinition[] | undefined {
	if (!filtersJson) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(filtersJson);
		if (!Array.isArray(parsed)) {
			return undefined;
		}

		return parsed.flatMap((entry) => {
			if (entry === null || typeof entry !== "object") {
				return [];
			}

			const candidate = entry as Partial<SavedViewFilterDefinition>;
			if (
				candidate.fieldDefId === undefined ||
				candidate.operator === undefined
			) {
				return [];
			}

			return [
				{
					fieldDefId: candidate.fieldDefId,
					operator: candidate.operator,
					value: candidate.value,
					logicalOperator: candidate.logicalOperator,
				},
			];
		});
	} catch {
		return undefined;
	}
}

function getStoredSavedViewFilters(
	doc: SavedViewFilterSource
): SavedViewFilterDefinition[] {
	return doc.filters ?? parseLegacySavedViewFiltersJson(doc.filtersJson) ?? [];
}
function toSavedViewFilters(
	viewFilters: ViewFilterDoc[]
): SavedViewFilterDefinition[] {
	return viewFilters.map((viewFilter) => ({
		fieldDefId: viewFilter.fieldDefId,
		operator: viewFilter.operator,
		value: viewFilter.value,
		logicalOperator: viewFilter.logicalOperator,
	}));
}

function toRuntimeFilters(
	filters: SavedViewFilterDefinition[]
): RecordFilter[] {
	return filters.map((filter) => ({
		fieldDefId: filter.fieldDefId,
		logicalOperator: filter.logicalOperator,
		operator: filter.operator,
		value: parseStoredFilterValue(filter.value),
	}));
}

function toSystemViewDefinition(args: {
	disabledLayoutMessages: SystemViewDefinition["disabledLayoutMessages"];
	viewDef: ViewDefDoc;
	viewFields: ViewFieldDoc[];
	viewFilters: ViewFilterDoc[];
}): SystemViewDefinition {
	const orderedViewFields = [...args.viewFields].sort(
		(left, right) => left.displayOrder - right.displayOrder
	);
	const fieldOrder = orderedViewFields.map((viewField) => viewField.fieldDefId);
	const visibleFieldIds = orderedViewFields
		.filter((viewField) => viewField.isVisible)
		.map((viewField) => viewField.fieldDefId);

	return {
		viewDefId: args.viewDef._id,
		objectDefId: args.viewDef.objectDefId,
		name: args.viewDef.name,
		layout: args.viewDef.viewType,
		boundFieldId: args.viewDef.boundFieldId,
		fieldOrder,
		visibleFieldIds,
		filters: toRuntimeFilters(toSavedViewFilters(args.viewFilters)),
		groupByFieldId: args.viewDef.groupByFieldId,
		aggregatePresets: args.viewDef.aggregatePresets ?? [],
		disabledLayoutMessages: args.disabledLayoutMessages,
		isDefault: args.viewDef.isDefault,
		needsRepair: args.viewDef.needsRepair,
	};
}

function buildBaseColumnDefinitions(
	viewFields: ViewField[],
	fieldDefsById: Map<string, FieldDef>
): Map<string, ColumnCandidate> {
	return new Map(
		viewFields.flatMap((viewField) => {
			const fieldDef = fieldDefsById.get(viewField.fieldDefId.toString());
			if (!fieldDef) {
				return [];
			}

			return [
				[
					viewField.fieldDefId.toString(),
					{
						fieldDefId: viewField.fieldDefId,
						name: fieldDef.name,
						label: fieldDef.label,
						fieldType: fieldDef.fieldType,
						width: viewField.width,
						displayOrder: viewField.displayOrder,
						isVisibleByDefault: viewField.isVisible,
					},
				] satisfies [string, ColumnCandidate],
			];
		})
	);
}

function buildComputedColumnDefinitions(
	adapterContract: EntityViewAdapterContract,
	persistedCount: number
): Map<string, ColumnCandidate> {
	return new Map(
		adapterContract.computedFields.map((computedField, index) => {
			const fieldDefId = toSyntheticFieldDefId(computedField.fieldName);

			return [
				fieldDefId.toString(),
				{
					fieldDefId,
					name: computedField.fieldName,
					label: computedField.label,
					fieldType: computedField.fieldType,
					width: undefined,
					displayOrder: persistedCount + index,
					isVisibleByDefault: computedField.isVisibleByDefault,
				},
			] satisfies [string, ColumnCandidate];
		})
	);
}

function sanitizeColumnIdList(
	preferred: Id<"fieldDefs">[],
	fallback: Id<"fieldDefs">[],
	availableColumnsById: ReadonlyMap<string, ColumnCandidate>
): Id<"fieldDefs">[] {
	const seen = new Set<string>();
	const sanitized: Id<"fieldDefs">[] = [];

	for (const fieldId of [...preferred, ...fallback]) {
		const key = fieldId.toString();
		if (seen.has(key) || !availableColumnsById.has(key)) {
			continue;
		}
		seen.add(key);
		sanitized.push(fieldId);
	}

	return sanitized;
}

function buildEffectiveColumns(args: {
	adapterContract: EntityViewAdapterContract;
	effectiveView: SystemViewDefinition;
	fieldDefsById: Map<string, FieldDef>;
	viewFields: ViewField[];
	viewIsDefault: boolean;
}): ViewColumnDefinition[] {
	const persistedColumnsById = buildBaseColumnDefinitions(
		args.viewFields,
		args.fieldDefsById
	);
	const computedColumnsById = buildComputedColumnDefinitions(
		args.adapterContract,
		persistedColumnsById.size
	);
	const baseColumnsById = new Map([
		...persistedColumnsById,
		...computedColumnsById,
	]);
	const fallbackFieldOrder = [...baseColumnsById.values()]
		.sort((a, b) => a.displayOrder - b.displayOrder)
		.map((column) => column.fieldDefId);
	const orderedFieldIds = sanitizeColumnIdList(
		[...args.effectiveView.fieldOrder, ...fallbackFieldOrder],
		fallbackFieldOrder,
		baseColumnsById
	);
	const visibleFieldIds = new Set(
		args.effectiveView.visibleFieldIds.map((fieldId) => fieldId.toString())
	);
	const fieldOverridesByName = buildFieldOverridesByName(args.adapterContract);
	const schemaOrderHints = buildSchemaOrderHints({
		adapterContract: args.adapterContract,
		viewIsDefault: args.viewIsDefault,
	});

	return orderedFieldIds
		.flatMap((fieldId, index) => {
			const baseColumn = baseColumnsById.get(fieldId.toString());
			if (!baseColumn) {
				return [];
			}

			return [
				applyFieldOverridesToColumn({
					column: {
						fieldDefId: baseColumn.fieldDefId,
						name: baseColumn.name,
						label: baseColumn.label,
						fieldType: baseColumn.fieldType,
						width: baseColumn?.width,
						isVisible:
							visibleFieldIds.has(fieldId.toString()) ||
							baseColumn.isVisibleByDefault,
						displayOrder: index,
					},
					currentLayout: args.effectiveView.layout,
					override: fieldOverridesByName.get(baseColumn.name),
				}),
			];
		})
		.sort((left, right) =>
			compareSchemaOrderedEntries({
				left,
				right,
				orderHints: schemaOrderHints,
				overrideByName: fieldOverridesByName,
			})
		)
		.map((column, index) => ({
			...column,
			displayOrder: index,
		}));
}

export function toUserSavedViewDefinition(
	doc: UserSavedViewDoc
): UserSavedViewDefinition {
	return {
		userSavedViewId: doc._id,
		objectDefId: doc.objectDefId,
		ownerAuthId: doc.ownerAuthId,
		sourceViewDefId: doc.sourceViewDefId,
		name: doc.name,
		viewType: doc.viewType,
		visibleFieldIds: doc.visibleFieldIds,
		fieldOrder: doc.fieldOrder,
		filters: getStoredSavedViewFilters(doc as SavedViewFilterSource),
		groupByFieldId: doc.groupByFieldId,
		aggregatePresets: doc.aggregatePresets ?? [],
		isDefault: doc.isDefault,
	};
}

export function buildUserSavedViewSnapshot(args: {
	savedView?: UserSavedViewDoc | null;
	viewDef: ViewDefDoc;
	viewFields: ViewFieldDoc[];
	viewFilters: ViewFilterDoc[];
}): UserSavedViewSnapshot {
	if (args.savedView) {
		const savedView = toUserSavedViewDefinition(args.savedView);
		return {
			objectDefId: savedView.objectDefId,
			sourceViewDefId: savedView.sourceViewDefId,
			name: savedView.name,
			viewType: savedView.viewType,
			visibleFieldIds: savedView.visibleFieldIds,
			fieldOrder: savedView.fieldOrder,
			filters: savedView.filters,
			groupByFieldId: savedView.groupByFieldId,
			aggregatePresets: savedView.aggregatePresets,
			isDefault: savedView.isDefault,
		};
	}

	const orderedViewFields = [...args.viewFields].sort(
		(left, right) => left.displayOrder - right.displayOrder
	);

	return {
		objectDefId: args.viewDef.objectDefId,
		sourceViewDefId: args.viewDef._id,
		name: args.viewDef.name,
		viewType: args.viewDef.viewType,
		visibleFieldIds: orderedViewFields
			.filter((viewField) => viewField.isVisible)
			.map((viewField) => viewField.fieldDefId),
		fieldOrder: orderedViewFields.map((viewField) => viewField.fieldDefId),
		filters: toSavedViewFilters(args.viewFilters),
		groupByFieldId: args.viewDef.groupByFieldId,
		aggregatePresets: args.viewDef.aggregatePresets ?? [],
		isDefault: args.viewDef.isDefault,
	};
}

async function loadActiveFieldDefsFromDb(
	ctx: DbCtx,
	objectDefId: Id<"objectDefs">
): Promise<FieldDef[]> {
	const allFieldDefs = await ctx.db
		.query("fieldDefs")
		.withIndex("by_object", (query) => query.eq("objectDefId", objectDefId))
		.collect();

	return allFieldDefs.filter((fieldDef) => fieldDef.isActive);
}

export async function loadBaseViewState(
	ctx: DbCtx,
	viewDefId: Id<"viewDefs">,
	orgId: string
): Promise<{
	viewDef: ViewDefDoc;
	viewFields: ViewFieldDoc[];
	viewFilters: ViewFilterDoc[];
}> {
	const viewDef = await ctx.db.get(viewDefId);
	if (!viewDef || viewDef.orgId !== orgId) {
		throw new ConvexError("View not found or access denied");
	}

	const [viewFields, viewFilters] = await Promise.all([
		ctx.db
			.query("viewFields")
			.withIndex("by_view", (query) => query.eq("viewDefId", viewDefId))
			.collect(),
		ctx.db
			.query("viewFilters")
			.withIndex("by_view", (query) => query.eq("viewDefId", viewDefId))
			.collect(),
	]);

	return { viewDef, viewFields, viewFilters };
}

export async function findDefaultUserSavedView(
	ctx: DbCtx,
	args: {
		objectDefId: Id<"objectDefs">;
		ownerAuthId: string;
		orgId: string;
	}
): Promise<UserSavedViewDoc | null> {
	return await ctx.db
		.query("userSavedViews")
		.withIndex("by_owner_object_default", (query) =>
			query
				.eq("ownerAuthId", args.ownerAuthId)
				.eq("objectDefId", args.objectDefId)
				.eq("isDefault", true)
		)
		.filter((query) => query.eq(query.field("orgId"), args.orgId))
		.first();
}

export async function loadOwnedUserSavedView(
	ctx: DbCtx,
	args: {
		userSavedViewId: Id<"userSavedViews">;
		viewer: Pick<Viewer, "authId" | "orgId">;
	}
): Promise<UserSavedViewDoc> {
	const orgId = args.viewer.orgId;
	if (!orgId) {
		throw new ConvexError("Org context required");
	}

	const savedView = await ctx.db.get(args.userSavedViewId);
	if (
		!savedView ||
		savedView.orgId !== orgId ||
		savedView.ownerAuthId !== args.viewer.authId
	) {
		throw new ConvexError("Saved view not found or access denied");
	}

	return savedView;
}

async function loadRequestedView(
	ctx: DbCtx,
	args: {
		orgId: string;
		requestedViewDefId: Id<"viewDefs">;
	}
): Promise<ViewDefDoc> {
	const requestedView = await ctx.db.get(args.requestedViewDefId);
	if (!requestedView || requestedView.orgId !== args.orgId) {
		throw new ConvexError("View not found or access denied");
	}
	return requestedView;
}

async function resolveRequestedSavedView(
	ctx: DbCtx,
	args: {
		requestedView: ViewDefDoc;
		userSavedViewId?: Id<"userSavedViews">;
		viewer: Pick<Viewer, "authId" | "orgId">;
	}
): Promise<UserSavedViewDoc | null> {
	if (args.userSavedViewId === undefined) {
		return null;
	}

	const requestedSavedView = await loadOwnedUserSavedView(ctx, {
		userSavedViewId: args.userSavedViewId,
		viewer: args.viewer,
	});
	if (requestedSavedView.sourceViewDefId !== args.requestedView._id) {
		throw new ConvexError(
			"Saved view does not belong to the requested system view"
		);
	}

	return requestedSavedView;
}

async function resolveImplicitDefaultSavedView(
	ctx: DbCtx,
	args: {
		orgId: string;
		requestedView: ViewDefDoc;
		viewer: Pick<Viewer, "authId">;
	}
): Promise<UserSavedViewDoc | null> {
	const defaultSavedView = await findDefaultUserSavedView(ctx, {
		objectDefId: args.requestedView.objectDefId,
		ownerAuthId: args.viewer.authId,
		orgId: args.orgId,
	});

	return defaultSavedView?.sourceViewDefId === args.requestedView._id
		? defaultSavedView
		: null;
}

function validateResolvedSavedView(
	savedView: UserSavedViewDoc | null,
	viewDef: ViewDefDoc
) {
	if (savedView && savedView.objectDefId !== viewDef.objectDefId) {
		throw new ConvexError(
			"Saved view does not belong to the requested entity definition"
		);
	}

	if (savedView && savedView.viewType !== viewDef.viewType) {
		throw new ConvexError(
			"Saved view layout no longer matches its source system view"
		);
	}
}

export async function resolveEffectiveViewState(
	ctx: DbCtx,
	args: {
		requestedViewDefId: Id<"viewDefs">;
		userSavedViewId?: Id<"userSavedViews">;
		viewer: Pick<Viewer, "authId" | "orgId">;
	}
): Promise<EffectiveViewState> {
	const orgId = args.viewer.orgId;
	if (!orgId) {
		throw new ConvexError("Org context required");
	}

	const requestedView = await loadRequestedView(ctx, {
		requestedViewDefId: args.requestedViewDefId,
		orgId,
	});
	const requestedSavedView = await resolveRequestedSavedView(ctx, {
		requestedView,
		userSavedViewId: args.userSavedViewId,
		viewer: args.viewer,
	});
	const savedView =
		requestedSavedView ??
		(await resolveImplicitDefaultSavedView(ctx, {
			requestedView,
			viewer: args.viewer,
			orgId,
		}));

	const sourceViewDefId = savedView?.sourceViewDefId ?? requestedView._id;
	const { viewDef, viewFields, viewFilters } = await loadBaseViewState(
		ctx,
		sourceViewDefId,
		orgId
	);
	const activeFieldDefs = await loadActiveFieldDefsFromDb(
		ctx,
		viewDef.objectDefId
	);
	const disabledLayoutMessages =
		viewDef.disabledLayoutMessages ??
		deriveDisabledLayoutMessages(activeFieldDefs);

	validateResolvedSavedView(savedView, viewDef);

	const systemView = toSystemViewDefinition({
		disabledLayoutMessages,
		viewDef,
		viewFields,
		viewFilters,
	});
	const orderedFieldIds = normalizeFieldOrder(
		savedView?.fieldOrder,
		systemView.fieldOrder
	);
	const visibleFieldIds = normalizeVisibleFieldIds(
		savedView?.visibleFieldIds,
		systemView.visibleFieldIds
	);

	return {
		viewDef,
		viewFields,
		systemView,
		savedView: savedView ? toUserSavedViewDefinition(savedView) : null,
		effectiveView: {
			activeSavedViewId: savedView?._id,
			objectDefId: viewDef.objectDefId,
			sourceViewDefId: viewDef._id,
			name: savedView?.name ?? viewDef.name,
			viewType: savedView?.viewType ?? viewDef.viewType,
			boundFieldId: viewDef.boundFieldId,
			fieldOrder: orderedFieldIds,
			visibleFieldIds,
			filters: savedView
				? toRuntimeFilters(
						getStoredSavedViewFilters(savedView as SavedViewFilterSource)
					)
				: toRuntimeFilters(toSavedViewFilters(viewFilters)),
			groupByFieldId: savedView?.groupByFieldId ?? viewDef.groupByFieldId,
			aggregatePresets:
				savedView?.aggregatePresets ?? viewDef.aggregatePresets ?? [],
			disabledLayoutMessages,
			isDefault: savedView?.isDefault ?? viewDef.isDefault,
		},
	};
}

function toResolvedSystemView(
	effectiveState: EffectiveViewState
): SystemViewDefinition {
	return {
		...effectiveState.systemView,
		name: effectiveState.effectiveView.name,
		layout: effectiveState.effectiveView.viewType,
		fieldOrder: effectiveState.effectiveView.fieldOrder,
		visibleFieldIds: effectiveState.effectiveView.visibleFieldIds,
		filters: effectiveState.effectiveView.filters,
		groupByFieldId: effectiveState.effectiveView.groupByFieldId,
		aggregatePresets: effectiveState.effectiveView.aggregatePresets,
		disabledLayoutMessages: effectiveState.effectiveView.disabledLayoutMessages,
		isDefault: effectiveState.effectiveView.isDefault,
	};
}

export async function resolveViewState(
	ctx: CrmQueryCtx,
	viewDefId: Id<"viewDefs">,
	userSavedViewId?: Id<"userSavedViews">
): Promise<ResolvedViewState> {
	const orgId = ctx.viewer.orgId;
	if (!orgId) {
		throw new ConvexError("Org context required");
	}

	const effectiveState = await resolveEffectiveViewState(ctx, {
		requestedViewDefId: viewDefId,
		userSavedViewId,
		viewer: ctx.viewer,
	});
	const objectDef = await ctx.db.get(effectiveState.viewDef.objectDefId);
	if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
		throw new ConvexError("Object not found or access denied");
	}

	const activeFieldDefs = await loadActiveFieldDefs(
		ctx,
		effectiveState.viewDef.objectDefId
	);
	const fieldDefsById = new Map(
		activeFieldDefs.map((fieldDef) => [fieldDef._id.toString(), fieldDef])
	);
	const view = toResolvedSystemView(effectiveState);
	const adapterContract = buildAdapterContract({
		fieldDefs: activeFieldDefs,
		objectDef,
		viewDef: effectiveState.viewDef,
	});
	const fieldOverridesByName = buildFieldOverridesByName(adapterContract);
	const schemaOrderHints = buildSchemaOrderHints({
		adapterContract,
		viewIsDefault:
			effectiveState.viewDef.isDefault && !effectiveState.savedView,
	});
	const persistedFields = activeFieldDefs.map((fieldDef) =>
		applyFieldOverridesToDefinition({
			field: toNormalizedFieldDefinition(fieldDef),
			currentLayout: view.layout,
			override: fieldOverridesByName.get(fieldDef.name),
		})
	);
	const computedFields = adapterContract.computedFields
		.filter(
			(computedField) =>
				!persistedFields.some((field) => field.name === computedField.fieldName)
		)
		.map((computedField, index) =>
			toComputedNormalizedFieldDefinition({
				computedField,
				displayOrder: persistedFields.length + index,
				objectDefId: objectDef._id,
			})
		);
	const fields = [...persistedFields, ...computedFields]
		.sort((left, right) =>
			compareSchemaOrderedEntries({
				left,
				right,
				orderHints: schemaOrderHints,
				overrideByName: fieldOverridesByName,
			})
		)
		.map((field, index) => ({
			...field,
			displayOrder: index,
		}));

	return {
		viewDef: effectiveState.viewDef,
		view,
		objectDef,
		activeFieldDefs,
		effectiveView: effectiveState.effectiveView,
		fieldDefsById,
		fields,
		adapterContract,
		savedView: effectiveState.savedView,
		systemView: effectiveState.systemView,
		columns: buildEffectiveColumns({
			adapterContract,
			effectiveView: view,
			fieldDefsById,
			viewFields: effectiveState.viewFields,
			viewIsDefault:
				effectiveState.viewDef.isDefault && !effectiveState.savedView,
		}),
	};
}

export function projectRecordToVisibleColumns(
	record: {
		createdAt: number;
		fields: Record<string, unknown>;
		objectDefId: Id<"objectDefs">;
		updatedAt: number;
		_id: string;
		_kind: "record" | "native";
	},
	columns: ViewColumnDefinition[]
) {
	const visibleFieldNames = new Set(
		columns.filter((column) => column.isVisible).map((column) => column.name)
	);
	const visibleFields: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(record.fields)) {
		if (visibleFieldNames.has(key)) {
			visibleFields[key] = value;
		}
	}

	return {
		...record,
		fields: visibleFields,
	};
}

export function buildEntityViewRows(
	records: Array<{
		createdAt: number;
		fields: Record<string, unknown>;
		objectDefId: Id<"objectDefs">;
		updatedAt: number;
		_id: string;
		_kind: "record" | "native";
	}>,
	columns: ViewColumnDefinition[]
): EntityViewRow[] {
	const visibleColumns = columns.filter((column) => column.isVisible);

	return records.map((record) => ({
		record,
		cells: visibleColumns.map((column) => ({
			fieldDefId: column.fieldDefId,
			fieldName: column.name,
			label: column.label,
			value: record.fields[column.name],
		})),
	}));
}

function collectNumericValues(
	records: Array<{ fields: Record<string, unknown> }>,
	fieldName: string
): number[] {
	return records.flatMap((record) => {
		const value = record.fields[fieldName];
		return typeof value === "number" ? [value] : [];
	});
}

function formatAggregateLabel(
	fieldDef: FieldDef,
	preset: AggregatePreset
): string {
	return preset.label ?? `${fieldDef.label} (${preset.fn})`;
}

export function buildViewAggregates(
	records: Array<{ fields: Record<string, unknown> }>,
	presets: AggregatePreset[],
	fieldDefsById: Map<string, FieldDef>
): ViewAggregateResult[] {
	return presets.flatMap((preset) => {
		const fieldDef = fieldDefsById.get(preset.fieldDefId.toString());
		if (!fieldDef) {
			return [];
		}

		const numericValues = collectNumericValues(records, fieldDef.name);
		const populatedValues = records
			.map((record) => record.fields[fieldDef.name])
			.filter((value) => value !== undefined && value !== null);

		let value: number | string | null;
		switch (preset.fn) {
			case "count":
				value = populatedValues.length;
				break;
			case "sum":
				value =
					numericValues.length > 0
						? numericValues.reduce((total, current) => total + current, 0)
						: 0;
				break;
			case "avg":
				value =
					numericValues.length > 0
						? numericValues.reduce((total, current) => total + current, 0) /
							numericValues.length
						: null;
				break;
			case "min":
				value = numericValues.length > 0 ? Math.min(...numericValues) : null;
				break;
			case "max":
				value = numericValues.length > 0 ? Math.max(...numericValues) : null;
				break;
			default: {
				const exhaustiveCheck: never = preset.fn;
				throw new Error(
					`Unsupported aggregate function: ${String(exhaustiveCheck)}`
				);
			}
		}

		return [
			{
				fieldDefId: fieldDef._id,
				fieldName: fieldDef.name,
				fn: preset.fn,
				label: formatAggregateLabel(fieldDef, preset),
				value,
			},
		];
	});
}
