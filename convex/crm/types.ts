import type { Doc, Id } from "../_generated/dataModel";

export type ViewLayout = "table" | "kanban" | "calendar";
export type NormalizedFieldKind =
	| "primitive"
	| "single_select"
	| "multi_select"
	| "user"
	| "relation"
	| "computed";
export type AggregateFn = "count" | "sum" | "avg" | "min" | "max";
export type EditabilityMode = "editable" | "read_only" | "computed";
export type FieldRendererHint =
	| "text"
	| "number"
	| "currency"
	| "percentage"
	| "date"
	| "datetime"
	| "select"
	| "multi_select"
	| "boolean"
	| "rich_text"
	| "user_ref"
	| "relation"
	| "computed";

export interface LayoutEligibilityRule {
	enabled: boolean;
	reason?: string;
}

export interface FieldLayoutEligibility {
	calendar: LayoutEligibilityRule;
	groupBy: LayoutEligibilityRule;
	kanban: LayoutEligibilityRule;
	table: LayoutEligibilityRule;
}

export interface AggregationEligibility {
	enabled: boolean;
	reason?: string;
	supportedFunctions: AggregateFn[];
}

export interface RelationMetadata {
	cardinality: Doc<"linkTypeDefs">["cardinality"];
	relationName?: string;
	targetFieldName?: string;
	targetObjectDefId?: Id<"objectDefs">;
}

export interface ComputedFieldMetadata {
	expressionKey?: string;
	sourceFieldNames?: string[];
}

export interface EditabilityMetadata {
	mode: EditabilityMode;
	reason?: string;
}

export interface AggregatePreset {
	fieldDefId: Id<"fieldDefs">;
	fn: AggregateFn;
	label?: string;
}

export interface SavedViewFilterDefinition {
	fieldDefId: Id<"fieldDefs">;
	logicalOperator?: "and" | "or";
	operator: RecordFilter["operator"];
	value?: string;
}

export interface EntityViewComputedFieldContract {
	description?: string;
	expressionKey: string;
	fieldName: string;
	fieldType: Doc<"fieldDefs">["fieldType"];
	isVisibleByDefault: boolean;
	label: string;
	rendererHint: FieldRendererHint;
	sourceFieldNames: string[];
}

export interface EntityViewDetailContract {
	mode: "dedicated" | "generated";
	surfaceKey: string;
}

export interface EntityViewFieldOverrideContract {
	fieldName: string;
	hiddenInLayouts?: ViewLayout[];
	isVisibleByDefault?: boolean;
	label?: string;
	preferredDisplayOrder?: number;
}

export interface EntityViewLayoutDefaultsContract {
	calendarDateFieldName?: string;
	kanbanFieldName?: string;
	preferredVisibleFieldNames: string[];
}

/** Unified shape returned by all record queries — both EAV and native adapter. */
export interface UnifiedRecord {
	_id: string;
	_kind: "record" | "native";
	createdAt: number;
	fields: Record<string, unknown>;
	objectDefId: Id<"objectDefs">;
	updatedAt: number;
}

/** A single field-level filter condition. */
export interface RecordFilter {
	fieldDefId: Id<"fieldDefs">;
	logicalOperator?: "and" | "or";
	operator:
		| "after"
		| "before"
		| "between"
		| "equals"
		| "eq"
		| "gt"
		| "gte"
		| "is"
		| "is_any_of"
		| "is_false"
		| "is_not"
		| "is_true"
		| "lt"
		| "lte"
		| "contains"
		| "starts_with";
	value: unknown;
}

/** Sort specification for record queries. */
export interface RecordSort {
	direction: "asc" | "desc";
	fieldDefId: Id<"fieldDefs">;
}

export interface NormalizedFieldDefinition {
	aggregation: AggregationEligibility;
	computed?: ComputedFieldMetadata;
	defaultValue?: string;
	description?: string;
	displayOrder: number;
	editability: EditabilityMetadata;
	fieldDefId?: Id<"fieldDefs">;
	fieldSource: "persisted" | "adapter_computed";
	fieldType: Doc<"fieldDefs">["fieldType"];
	isActive: boolean;
	isRequired: boolean;
	isUnique: boolean;
	isVisibleByDefault: boolean;
	label: string;
	layoutEligibility: FieldLayoutEligibility;
	name: string;
	nativeColumnPath?: string;
	nativeReadOnly: boolean;
	normalizedFieldKind: NormalizedFieldKind;
	objectDefId: Id<"objectDefs">;
	options?: Doc<"fieldDefs">["options"];
	relation?: RelationMetadata;
	rendererHint: FieldRendererHint;
}

export interface SystemViewDefinition {
	aggregatePresets: AggregatePreset[];
	boundFieldId?: Id<"fieldDefs">;
	disabledLayoutMessages?: {
		calendar?: string;
		kanban?: string;
		table?: string;
	};
	fieldOrder: Id<"fieldDefs">[];
	filters: RecordFilter[];
	groupByFieldId?: Id<"fieldDefs">;
	isDefault: boolean;
	layout: ViewLayout;
	name: string;
	needsRepair: boolean;
	objectDefId: Id<"objectDefs">;
	viewDefId: Id<"viewDefs">;
	visibleFieldIds: Id<"fieldDefs">[];
}

export interface UserSavedViewDefinition {
	aggregatePresets: AggregatePreset[];
	fieldOrder: Id<"fieldDefs">[];
	filters: SavedViewFilterDefinition[];
	groupByFieldId?: Id<"fieldDefs">;
	isDefault: boolean;
	name: string;
	objectDefId: Id<"objectDefs">;
	ownerAuthId: string;
	sourceViewDefId?: Id<"viewDefs">;
	userSavedViewId: Id<"userSavedViews">;
	viewType: ViewLayout;
	visibleFieldIds: Id<"fieldDefs">[];
}

export interface EffectiveViewDefinition {
	activeSavedViewId?: Id<"userSavedViews">;
	aggregatePresets: AggregatePreset[];
	boundFieldId?: Id<"fieldDefs">;
	disabledLayoutMessages?: SystemViewDefinition["disabledLayoutMessages"];
	fieldOrder: Id<"fieldDefs">[];
	filters: RecordFilter[];
	groupByFieldId?: Id<"fieldDefs">;
	isDefault: boolean;
	name: string;
	objectDefId: Id<"objectDefs">;
	sourceViewDefId: Id<"viewDefs">;
	viewType: ViewLayout;
	visibleFieldIds: Id<"fieldDefs">[];
}

export interface EntityViewAdapterContract {
	computedFields: EntityViewComputedFieldContract[];
	detail: EntityViewDetailContract;
	detailSurfaceKey?: string;
	entityType: string;
	fieldOverrides: EntityViewFieldOverrideContract[];
	layoutDefaults: EntityViewLayoutDefaultsContract;
	objectDefId?: Id<"objectDefs">;
	statusFieldName?: string;
	supportedLayouts: ViewLayout[];
	titleFieldName?: string;
	variant: "dedicated" | "fallback";
}

export interface RelationCellItem {
	label: string;
	objectDefId: Id<"objectDefs">;
	recordId: string;
	recordKind: "record" | "native";
}

export interface ScalarCellDisplayValue {
	kind: "scalar";
	value: unknown;
}

export interface RelationCellDisplayValue {
	cardinality: RelationMetadata["cardinality"];
	items: RelationCellItem[];
	kind: "relation";
}

export type EntityViewCellDisplayValue =
	| ScalarCellDisplayValue
	| RelationCellDisplayValue;

export interface EntityViewCell {
	displayValue?: EntityViewCellDisplayValue;
	fieldDefId: Id<"fieldDefs">;
	fieldName: string;
	label: string;
	value: unknown;
}

export interface EntityViewRow {
	cells: EntityViewCell[];
	record: UnifiedRecord;
}

export interface ViewAggregateResult {
	fieldDefId: Id<"fieldDefs">;
	fieldName: string;
	fn: AggregateFn;
	label: string;
	value: number | string | null;
}

export interface EntityViewPageResult {
	continueCursor: string | null;
	isDone: boolean;
	limit: number;
	returnedCount: number;
	rows: EntityViewRow[];
	totalCount: number;
	totalCountExact: boolean;
	truncated: boolean;
}

/** Result shape for paginated record queries. */
export interface QueryRecordsResult {
	continueCursor: string | null;
	isDone: boolean;
	records: UnifiedRecord[];
	truncated: boolean;
}

/** Result shape for getRecord with linked entities. */
export interface GetRecordResult {
	links: {
		outbound: LinkedRecord[];
		inbound: LinkedRecord[];
	};
	record: UnifiedRecord;
}

/** Result shape for detail surfaces backed by normalized adapter contracts. */
export interface GetRecordDetailSurfaceResult {
	adapterContract: EntityViewAdapterContract;
	fields: NormalizedFieldDefinition[];
	objectDef: Doc<"objectDefs">;
	record: UnifiedRecord;
}

/** A linked record reference (lightweight, for display in relation sections). */
export interface LinkedRecord {
	labelValue?: string;
	linkId: Id<"recordLinks">;
	linkTypeDefId: Id<"linkTypeDefs">;
	objectDefId: Id<"objectDefs">;
	recordId: string;
	recordKind: "record" | "native";
}

// ── Activity Timeline Types ─────────────────────────────────────────

/** A single activity event for the timeline display. */
export interface ActivityEvent {
	_id: string;
	/** The raw audit action string (e.g. "crm.record.created", "crm.link.created") */
	action: string;
	/** Actor info */
	actor: {
		id: string;
		name: string;
		avatarUrl?: string;
	};
	/** Human-readable description */
	description: string;
	/** Optional before/after diff for field changes */
	diff?: {
		before?: Record<string, unknown>;
		after?: Record<string, unknown>;
	};
	/** Event category for icon/color selection */
	eventType:
		| "created"
		| "field_updated"
		| "linked"
		| "unlinked"
		| "status_changed"
		| "other";
	/** Optional metadata from the audit event */
	metadata?: Record<string, unknown>;
	/** Unix timestamp ms */
	timestamp: number;
}

/** Result shape for paginated activity queries. */
export interface ActivityQueryResult {
	continueCursor: string | null;
	events: ActivityEvent[];
	isDone: boolean;
}
