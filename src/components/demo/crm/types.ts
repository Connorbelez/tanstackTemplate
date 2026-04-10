import type { Doc, Id } from "../../../../convex/_generated/dataModel";

export type CrmDemoRecordKind = "record" | "native";
export type CrmDemoMetricSource = "eav" | "native";
export type RecordViewMode = "table" | "kanban";

export interface CrmDemoRecordReference {
	labelValue?: string;
	objectDefId: Id<"objectDefs">;
	recordId: string;
	recordKind: CrmDemoRecordKind;
}

export interface CrmDemoViewColumn {
	displayOrder: number;
	fieldDefId: Id<"fieldDefs">;
	fieldType: Doc<"fieldDefs">["fieldType"];
	isVisible: boolean;
	label: string;
	name: string;
	width?: number;
}

export interface CrmDemoTableResult {
	columns: CrmDemoViewColumn[];
	cursor: string | null;
	rows: Array<{
		_id: string;
		_kind: CrmDemoRecordKind;
		createdAt: number;
		fields: Record<string, unknown>;
		objectDefId: Id<"objectDefs">;
		updatedAt: number;
	}>;
	totalCount: number;
	totalCountExact: boolean;
}

export interface CrmDemoKanbanGroup {
	color: string;
	count: number;
	groupId: Id<"viewKanbanGroups">;
	isCollapsed: boolean;
	label: string;
	records: CrmDemoTableResult["rows"];
}

export interface CrmDemoKanbanResult {
	groups: CrmDemoKanbanGroup[];
	totalCount: number;
}

export interface CrmDemoMetricsState {
	activeSource: CrmDemoMetricSource | null;
	eavReadCount: number | null;
	lastUpdatedAt: number | null;
	nativeReadCount: number | null;
	notes: string | null;
	renderTimeMs: number | null;
	unifiedShapeMatch: boolean | null;
}

export interface CrmDemoSeedSummary {
	customObjectCount: number;
	demoObjectId?: Id<"objectDefs">;
	demoViewId?: Id<"viewDefs">;
	recordCount: number;
	seeded: boolean;
}
