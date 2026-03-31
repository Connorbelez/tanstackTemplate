import type { Id } from "../_generated/dataModel";

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
	operator:
		| "eq"
		| "gt"
		| "lt"
		| "gte"
		| "lte"
		| "contains"
		| "starts_with"
		| "is_any_of"
		| "is_true"
		| "is_false";
	value: unknown;
}

/** Sort specification for record queries. */
export interface RecordSort {
	direction: "asc" | "desc";
	fieldDefId: Id<"fieldDefs">;
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

/** A linked record reference (lightweight, for display in relation sections). */
export interface LinkedRecord {
	labelValue?: string;
	linkId: Id<"recordLinks">;
	linkTypeDefId: Id<"linkTypeDefs">;
	objectDefId: Id<"objectDefs">;
	recordId: string;
	recordKind: "record" | "native";
}
