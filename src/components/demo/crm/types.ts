import type { Id } from "../../../../convex/_generated/dataModel";

export type CrmDemoRecordKind = "record" | "native";
export type CrmDemoMetricSource = "eav" | "native";

export interface CrmDemoRecordReference {
	labelValue?: string;
	objectDefId: Id<"objectDefs">;
	recordId: string;
	recordKind: CrmDemoRecordKind;
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
