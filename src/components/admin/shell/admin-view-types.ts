import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type {
	AggregationEligibility,
	EditabilityMetadata,
	EffectiveViewDefinition,
	EntityViewAdapterContract,
	EntityViewPageResult,
	EntityViewRow,
	FieldLayoutEligibility,
	FieldRendererHint,
	NormalizedFieldDefinition,
	NormalizedFieldKind,
	RelationMetadata,
	SystemViewDefinition,
	TableFooterAggregateResult,
	UserSavedViewDefinition,
	ViewAggregateResult,
	ViewLayout,
} from "../../../../convex/crm/types";

export interface AdminViewColumn {
	displayOrder: number;
	fieldDefId: Id<"fieldDefs">;
	fieldType: Doc<"fieldDefs">["fieldType"];
	isVisible: boolean;
	label: string;
	name: string;
	width?: number;
}

export interface AdminViewSchemaColumn extends AdminViewColumn {
	aggregation: AggregationEligibility;
	editability: EditabilityMetadata;
	hasSortCapability: boolean;
	isVisibleByDefault: boolean;
	layoutEligibility: FieldLayoutEligibility;
	normalizedFieldKind: NormalizedFieldKind;
	options?: Doc<"fieldDefs">["options"];
	relation?: RelationMetadata;
	rendererHint: FieldRendererHint;
}

export interface AdminViewSchemaResult {
	adapterContract: EntityViewAdapterContract;
	columns: AdminViewSchemaColumn[];
	effectiveView: EffectiveViewDefinition;
	fields: NormalizedFieldDefinition[];
	needsRepair: boolean;
	savedView: UserSavedViewDefinition | null;
	systemView: SystemViewDefinition;
	view: SystemViewDefinition;
	viewType: ViewLayout;
}

export interface AdminTableQueryResult {
	adapterContract: EntityViewAdapterContract;
	aggregates: ViewAggregateResult[];
	columns: AdminViewColumn[];
	cursor: string | null;
	fields: NormalizedFieldDefinition[];
	footerAggregates: TableFooterAggregateResult[];
	needsRepair: boolean;
	page: EntityViewPageResult;
	rows: EntityViewRow["record"][];
	totalCount: number;
	totalCountExact: boolean;
	truncated: boolean;
	view: SystemViewDefinition;
	viewType: ViewLayout;
}

export interface AdminKanbanGroup {
	color: string;
	count: number;
	groupId: Id<"viewKanbanGroups">;
	isCollapsed: boolean;
	label: string;
	records: EntityViewRow["record"][];
	rows: EntityViewRow[];
}

export interface AdminKanbanQueryResult {
	adapterContract: EntityViewAdapterContract;
	aggregates: ViewAggregateResult[];
	columns: AdminViewColumn[];
	fields: NormalizedFieldDefinition[];
	groups: AdminKanbanGroup[];
	needsRepair: boolean;
	totalCount: number;
	totalCountExact: boolean;
	truncated: boolean;
	view: SystemViewDefinition;
	viewType: ViewLayout;
}
