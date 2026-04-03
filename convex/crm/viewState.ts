import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Viewer } from "../fluent";
import type {
	AggregatePreset,
	EntityViewAdapterContract,
	EntityViewRow,
	NormalizedFieldDefinition,
	SystemViewDefinition,
	ViewAggregateResult,
	ViewFilterDefinition,
	ViewLayout,
} from "./types";

type FieldDef = Doc<"fieldDefs">;
type ViewField = Doc<"viewFields">;
type CrmQueryCtx = QueryCtx & { viewer: Viewer };

export interface ViewColumnDefinition {
	displayOrder: number;
	fieldDefId: Id<"fieldDefs">;
	fieldType: FieldDef["fieldType"];
	isVisible: boolean;
	label: string;
	name: string;
	width: number | undefined;
}

export interface ResolvedViewState {
	activeFieldDefs: FieldDef[];
	adapterContract: EntityViewAdapterContract;
	columns: ViewColumnDefinition[];
	fieldDefsById: Map<string, FieldDef>;
	fields: NormalizedFieldDefinition[];
	objectDef: Doc<"objectDefs">;
	view: SystemViewDefinition;
	viewDef: Doc<"viewDefs">;
}

function toNormalizedFieldDefinition(
	fieldDef: FieldDef
): NormalizedFieldDefinition {
	return {
		fieldDefId: fieldDef._id,
		objectDefId: fieldDef.objectDefId,
		name: fieldDef.name,
		label: fieldDef.label,
		fieldType: fieldDef.fieldType,
		normalizedFieldKind: fieldDef.normalizedFieldKind,
		description: fieldDef.description,
		isRequired: fieldDef.isRequired,
		isUnique: fieldDef.isUnique,
		isActive: fieldDef.isActive,
		displayOrder: fieldDef.displayOrder,
		defaultValue: fieldDef.defaultValue,
		options: fieldDef.options,
		rendererHint: fieldDef.rendererHint,
		relation: fieldDef.relation,
		computed: fieldDef.computed,
		layoutEligibility: fieldDef.layoutEligibility,
		aggregation: fieldDef.aggregation,
		editability: fieldDef.editability,
		nativeColumnPath: fieldDef.nativeColumnPath,
		nativeReadOnly: fieldDef.nativeReadOnly,
		isVisibleByDefault: fieldDef.isVisibleByDefault,
	};
}

function deriveDisabledLayoutMessages(
	fieldDefs: FieldDef[]
): SystemViewDefinition["disabledLayoutMessages"] | undefined {
	const messages: NonNullable<SystemViewDefinition["disabledLayoutMessages"]> =
		{};

	if (!fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.table.enabled)) {
		messages.table = "Table layout requires at least one active field.";
	}

	if (
		!fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.kanban.enabled)
	) {
		messages.kanban =
			"Add a select or multi-select field to unlock kanban layouts.";
	}

	if (
		!fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.calendar.enabled)
	) {
		messages.calendar =
			"Add a date or datetime field to unlock calendar layouts.";
	}

	return Object.keys(messages).length > 0 ? messages : undefined;
}

function buildAdapterContract(args: {
	fieldDefs: FieldDef[];
	objectDef: Doc<"objectDefs">;
	viewDef: Doc<"viewDefs">;
}): EntityViewAdapterContract {
	const supportedLayouts = new Set<ViewLayout>(["table"]);
	if (
		args.fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.kanban.enabled)
	) {
		supportedLayouts.add("kanban");
	}
	if (
		args.fieldDefs.some(
			(fieldDef) => fieldDef.layoutEligibility.calendar.enabled
		)
	) {
		supportedLayouts.add("calendar");
	}
	supportedLayouts.add(args.viewDef.viewType);
	const titleField = args.fieldDefs.find(
		(fieldDef) => fieldDef.name === "name"
	);
	const statusField = args.fieldDefs.find(
		(fieldDef) => fieldDef.name === "status"
	);
	return {
		entityType: args.objectDef.name,
		objectDefId: args.objectDef._id,
		detailSurfaceKey: args.objectDef.name,
		titleFieldName: titleField?.name,
		statusFieldName: statusField?.name,
		supportedLayouts: [...supportedLayouts],
	};
}

function parseViewFiltersJson(
	filtersJson: string | undefined
): ViewFilterDefinition[] | undefined {
	if (!(filtersJson && filtersJson.trim().length > 0)) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(filtersJson);
		if (!Array.isArray(parsed)) {
			return undefined;
		}

		return parsed.flatMap((candidate) => {
			if (!(candidate && typeof candidate === "object")) {
				return [];
			}

			const filter = candidate as Partial<ViewFilterDefinition>;
			if (
				typeof filter.fieldDefId !== "string" ||
				typeof filter.operator !== "string"
			) {
				return [];
			}

			return [
				{
					fieldDefId: filter.fieldDefId as Id<"fieldDefs">,
					logicalOperator:
						typeof filter.logicalOperator === "string"
							? filter.logicalOperator
							: undefined,
					operator: filter.operator as ViewFilterDefinition["operator"],
					value: filter.value,
				},
			];
		});
	} catch {
		return undefined;
	}
}

function sanitizeFieldIdList(
	fieldIds: Id<"fieldDefs">[],
	fieldDefsById: Map<string, FieldDef>
): Id<"fieldDefs">[] {
	const seen = new Set<string>();
	const sanitized: Id<"fieldDefs">[] = [];

	for (const fieldId of fieldIds) {
		const key = fieldId.toString();
		if (seen.has(key) || !fieldDefsById.has(key)) {
			continue;
		}
		seen.add(key);
		sanitized.push(fieldId);
	}

	return sanitized;
}

function buildBaseViewDefinition(args: {
	fieldDefsById: Map<string, FieldDef>;
	objectDefId: Id<"objectDefs">;
	viewDef: Doc<"viewDefs">;
	viewFields: ViewField[];
	viewFilters: Doc<"viewFilters">[];
}): SystemViewDefinition {
	const orderedFields = [...args.viewFields].sort(
		(a, b) => a.displayOrder - b.displayOrder
	);
	const fieldOrder = orderedFields
		.filter((viewField) =>
			args.fieldDefsById.has(viewField.fieldDefId.toString())
		)
		.map((viewField) => viewField.fieldDefId);
	const visibleFieldIds = orderedFields
		.filter(
			(viewField) =>
				viewField.isVisible &&
				args.fieldDefsById.has(viewField.fieldDefId.toString())
		)
		.map((viewField) => viewField.fieldDefId);

	return {
		viewDefId: args.viewDef._id,
		objectDefId: args.objectDefId,
		name: args.viewDef.name,
		layout: args.viewDef.viewType,
		boundFieldId: args.viewDef.boundFieldId,
		fieldOrder,
		visibleFieldIds,
		filters: args.viewFilters.map((viewFilter) => {
			let parsedValue: unknown = viewFilter.value;
			if (viewFilter.value !== undefined) {
				try {
					parsedValue = JSON.parse(viewFilter.value);
				} catch {
					parsedValue = viewFilter.value;
				}
			}

			return {
				fieldDefId: viewFilter.fieldDefId,
				logicalOperator: viewFilter.logicalOperator,
				operator: viewFilter.operator,
				value: parsedValue,
			};
		}),
		groupByFieldId: args.viewDef.groupByFieldId,
		aggregatePresets: args.viewDef.aggregatePresets ?? [],
		disabledLayoutMessages:
			args.viewDef.disabledLayoutMessages ??
			deriveDisabledLayoutMessages([...args.fieldDefsById.values()]),
		isDefault: args.viewDef.isDefault,
		needsRepair: args.viewDef.needsRepair,
	};
}

function buildEffectiveViewDefinition(args: {
	baseView: SystemViewDefinition;
	fieldDefsById: Map<string, FieldDef>;
	savedView?: Doc<"userSavedViews">;
}): SystemViewDefinition {
	if (!args.savedView) {
		return args.baseView;
	}

	const savedFieldOrder = sanitizeFieldIdList(
		args.savedView.fieldOrder,
		args.fieldDefsById
	);
	const savedVisibleFieldIds = sanitizeFieldIdList(
		args.savedView.visibleFieldIds,
		args.fieldDefsById
	);
	const savedFilters = parseViewFiltersJson(args.savedView.filtersJson);

	return {
		...args.baseView,
		name: args.savedView.name,
		layout: args.savedView.viewType,
		fieldOrder:
			savedFieldOrder.length > 0 ? savedFieldOrder : args.baseView.fieldOrder,
		visibleFieldIds:
			savedVisibleFieldIds.length > 0
				? savedVisibleFieldIds
				: args.baseView.visibleFieldIds,
		filters: savedFilters ?? args.baseView.filters,
		groupByFieldId:
			args.savedView.groupByFieldId ?? args.baseView.groupByFieldId,
		aggregatePresets:
			args.savedView.aggregatePresets ?? args.baseView.aggregatePresets,
		isDefault: args.savedView.isDefault,
	};
}

function buildBaseColumnDefinitions(
	viewFields: ViewField[],
	fieldDefsById: Map<string, FieldDef>
): Map<string, ViewColumnDefinition> {
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
						isVisible: viewField.isVisible,
						displayOrder: viewField.displayOrder,
					},
				] satisfies [string, ViewColumnDefinition],
			];
		})
	);
}

function buildEffectiveColumns(args: {
	effectiveView: SystemViewDefinition;
	fieldDefsById: Map<string, FieldDef>;
	viewFields: ViewField[];
}): ViewColumnDefinition[] {
	const baseColumnsById = buildBaseColumnDefinitions(
		args.viewFields,
		args.fieldDefsById
	);
	const fallbackFieldOrder = [...baseColumnsById.values()]
		.sort((a, b) => a.displayOrder - b.displayOrder)
		.map((column) => column.fieldDefId);
	const orderedFieldIds = sanitizeFieldIdList(
		[...args.effectiveView.fieldOrder, ...fallbackFieldOrder],
		args.fieldDefsById
	);
	const visibleFieldIds = new Set(
		args.effectiveView.visibleFieldIds.map((fieldId) => fieldId.toString())
	);

	return orderedFieldIds.flatMap((fieldId, index) => {
		const fieldDef = args.fieldDefsById.get(fieldId.toString());
		if (!fieldDef) {
			return [];
		}

		const baseColumn = baseColumnsById.get(fieldId.toString());
		return [
			{
				fieldDefId: fieldDef._id,
				name: fieldDef.name,
				label: fieldDef.label,
				fieldType: fieldDef.fieldType,
				width: baseColumn?.width,
				isVisible: visibleFieldIds.has(fieldId.toString()),
				displayOrder: index,
			},
		];
	});
}

async function loadSavedViewOverlay(
	ctx: CrmQueryCtx,
	viewDef: Doc<"viewDefs">
): Promise<Doc<"userSavedViews"> | undefined> {
	const savedViews = await ctx.db
		.query("userSavedViews")
		.withIndex("by_owner_object", (q) =>
			q
				.eq("ownerAuthId", ctx.viewer.authId)
				.eq("objectDefId", viewDef.objectDefId)
		)
		.collect();

	return savedViews
		.filter(
			(savedView) =>
				savedView.sourceViewDefId?.toString() === viewDef._id.toString() &&
				savedView.viewType === viewDef.viewType &&
				savedView.isDefault
		)
		.sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

export async function resolveViewState(
	ctx: CrmQueryCtx,
	viewDefId: Id<"viewDefs">
): Promise<ResolvedViewState> {
	const orgId = ctx.viewer.orgId;
	if (!orgId) {
		throw new ConvexError("Org context required");
	}

	const viewDef = await ctx.db.get(viewDefId);
	if (!viewDef || viewDef.orgId !== orgId) {
		throw new ConvexError("View not found or access denied");
	}

	const objectDef = await ctx.db.get(viewDef.objectDefId);
	if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
		throw new ConvexError("Object not found or access denied");
	}

	const [viewFields, viewFilters, allFieldDefs, savedView] = await Promise.all([
		ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", viewDefId))
			.collect(),
		ctx.db
			.query("viewFilters")
			.withIndex("by_view", (q) => q.eq("viewDefId", viewDefId))
			.collect(),
		ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", viewDef.objectDefId))
			.collect(),
		loadSavedViewOverlay(ctx, viewDef),
	]);

	const activeFieldDefs = allFieldDefs.filter((fieldDef) => fieldDef.isActive);
	const fieldDefsById = new Map(
		activeFieldDefs.map((fieldDef) => [fieldDef._id.toString(), fieldDef])
	);
	const baseView = buildBaseViewDefinition({
		fieldDefsById,
		objectDefId: viewDef.objectDefId,
		viewDef,
		viewFields,
		viewFilters,
	});
	const view = buildEffectiveViewDefinition({
		baseView,
		fieldDefsById,
		savedView,
	});

	return {
		viewDef,
		view,
		objectDef,
		activeFieldDefs,
		fieldDefsById,
		fields: activeFieldDefs.map(toNormalizedFieldDefinition),
		adapterContract: buildAdapterContract({
			fieldDefs: activeFieldDefs,
			objectDef,
			viewDef,
		}),
		columns: buildEffectiveColumns({
			effectiveView: view,
			fieldDefsById,
			viewFields,
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
