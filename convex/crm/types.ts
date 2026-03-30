import type { Id } from "../_generated/dataModel";

/** Unified shape returned by all record queries — both EAV and native adapter. */
export type UnifiedRecord = {
	_id: string;
	_kind: "record" | "native";
	objectDefId: Id<"objectDefs">;
	fields: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
};

/** A single field-level filter condition. */
export type RecordFilter = {
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
};

/** Sort specification for record queries. */
export type RecordSort = {
	fieldDefId: Id<"fieldDefs">;
	direction: "asc" | "desc";
};

/** Result shape for paginated record queries. */
export type QueryRecordsResult = {
	records: UnifiedRecord[];
	continueCursor: string | null;
	isDone: boolean;
	truncated: boolean;
};

/** Result shape for getRecord with linked entities. */
export type GetRecordResult = {
	record: UnifiedRecord;
	links: {
		outbound: LinkedRecord[];
		inbound: LinkedRecord[];
	};
};

/** A linked record reference (lightweight, for display in relation sections). */
export type LinkedRecord = {
	linkId: string;
	linkTypeDefId: Id<"linkTypeDefs">;
	recordId: string;
	recordKind: "record" | "native";
	objectDefId: Id<"objectDefs">;
	labelValue?: string;
};
