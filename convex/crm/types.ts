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
