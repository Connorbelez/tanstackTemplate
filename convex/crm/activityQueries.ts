import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmQuery } from "../fluent";
import type { ActivityEvent, ActivityQueryResult } from "./types";
import { entityKindValidator } from "./validators";

// ── Action → EventType Mapping ──────────────────────────────────────

type ActivityEventType = ActivityEvent["eventType"];

const ACTION_EVENT_TYPE_MAP: Record<string, ActivityEventType> = {
	"crm.record.created": "created",
	"crm.record.updated": "field_updated",
	"crm.link.created": "linked",
	"crm.link.deleted": "unlinked",
};
const LEADING_WORD_CHARACTER_RE = /^\w/;

function mapActionToEventType(action: string): ActivityEventType {
	const mapped = ACTION_EVENT_TYPE_MAP[action];
	if (mapped) {
		return mapped;
	}
	if (action.includes("status")) {
		return "status_changed";
	}
	return "other";
}

// ── Action → Human-readable Description ─────────────────────────────

function describeAction(
	action: string,
	metadata?: Record<string, unknown>
): string {
	const linkTypeName =
		typeof metadata?.linkTypeName === "string" ? metadata.linkTypeName : null;

	switch (action) {
		case "crm.record.created":
			return "Record created";
		case "crm.record.updated":
			return "Record fields updated";
		case "crm.link.created":
			return linkTypeName ? `${linkTypeName} linked` : "Link created";
		case "crm.link.deleted":
			return linkTypeName ? `${linkTypeName} removed` : "Link removed";
		default:
			if (action.includes("status")) {
				return "Status changed";
			}
			return action
				.replaceAll(".", " ")
				.replace(LEADING_WORD_CHARACTER_RE, (c) => c.toUpperCase());
	}
}

// ── Audit Event Shape (from convex-audit-log component) ─────────────

interface AuditLogEntry {
	_creationTime: number;
	_id: string;
	action: string;
	actorId?: string;
	after?: unknown;
	before?: unknown;
	diff?: string;
	metadata?: Record<string, unknown>;
	timestamp: number;
}

// ── Actor Enrichment ────────────────────────────────────────────────

interface ActorInfo {
	avatarUrl?: string;
	id: string;
	name: string;
}

const SYSTEM_ACTOR: ActorInfo = { id: "system", name: "System" };
const UNKNOWN_ACTOR_PREFIX = "Unknown User";

/**
 * Batch-resolve actor display info from the users table.
 * Deduplicates IDs and caches within a single query invocation.
 */
async function resolveActors(
	ctx: QueryCtx,
	actorIds: string[]
): Promise<Map<string, ActorInfo>> {
	const uniqueIds = [...new Set(actorIds.filter(Boolean))];
	const results = new Map<string, ActorInfo>();

	await Promise.all(
		uniqueIds.map(async (authId) => {
			const user = await ctx.db
				.query("users")
				.withIndex("authId", (q) => q.eq("authId", authId))
				.first();

			if (user) {
				const name =
					[user.firstName, user.lastName].filter(Boolean).join(" ") ||
					UNKNOWN_ACTOR_PREFIX;
				results.set(authId, { id: authId, name });
			} else {
				results.set(authId, { id: authId, name: UNKNOWN_ACTOR_PREFIX });
			}
		})
	);

	return results;
}

// ── Org Validation ─────────────────────────────────────────────────

type NativeTable =
	| "mortgages"
	| "borrowers"
	| "lenders"
	| "brokers"
	| "deals"
	| "obligations";

/**
 * Get orgId from a native entity in QueryCtx (read-only version).
 */
async function getNativeEntityOrgId(
	ctx: QueryCtx,
	tableName: NativeTable,
	entityId: string
): Promise<string | null> {
	const normalizedId = ctx.db.normalizeId(tableName, entityId);
	if (!normalizedId) {
		return null;
	}
	const doc = await ctx.db.get(normalizedId);
	return doc?.orgId ?? null;
}

/**
 * Get orgId for a record or native entity. Returns null if not found.
 */
async function getEntityOrgId(
	ctx: QueryCtx,
	recordKind: "record" | "native",
	recordId: string
): Promise<string | null> {
	if (recordKind === "record") {
		const normalizedId = ctx.db.normalizeId("records", recordId);
		if (!normalizedId) {
			return null;
		}
		const doc = await ctx.db.get(normalizedId);
		return doc?.orgId ?? null;
	}
	// Try each native table
	for (const tableName of NATIVE_AUDIT_RESOURCE_TYPES) {
		const orgId = await getNativeEntityOrgId(ctx, tableName, recordId);
		if (orgId !== null) {
			return orgId;
		}
	}
	return null;
}

// ── Diff Parsing ────────────────────────────────────────────────────

function parseDiff(entry: AuditLogEntry): ActivityEvent["diff"] | undefined {
	if (entry.before != null || entry.after != null) {
		return {
			before: entry.before as Record<string, unknown> | undefined,
			after: entry.after as Record<string, unknown> | undefined,
		};
	}
	// The diff field is stored as a JSON string by convex-audit-log
	if (entry.diff) {
		try {
			const parsed = JSON.parse(entry.diff) as Record<string, unknown>;
			return { after: parsed };
		} catch {
			return undefined;
		}
	}
	return undefined;
}

// ── Constants ───────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const NATIVE_AUDIT_RESOURCE_TYPES = [
	"mortgages",
	"borrowers",
	"lenders",
	"brokers",
	"deals",
	"obligations",
] as const;

function getAuditResourceTypes(
	ctx: QueryCtx,
	recordId: string,
	recordKind: "record" | "native"
): string[] {
	if (recordKind === "record") {
		return ["records"];
	}

	const matchingNativeTypes = NATIVE_AUDIT_RESOURCE_TYPES.filter(
		(tableName) => ctx.db.normalizeId(tableName, recordId) !== null
	);

	return matchingNativeTypes.length > 0
		? [...matchingNativeTypes]
		: [...NATIVE_AUDIT_RESOURCE_TYPES];
}

async function loadAuditEntries(
	ctx: QueryCtx,
	resourceTypes: string[],
	recordId: string,
	limit: number
): Promise<AuditLogEntry[]> {
	const eventGroups = await Promise.all(
		resourceTypes.map(
			(resourceType) =>
				auditLog.queryByResource(ctx, {
					resourceType,
					resourceId: recordId,
					limit,
				}) as Promise<AuditLogEntry[]>
		)
	);

	const deduped = new Map<string, AuditLogEntry>();
	for (const entries of eventGroups) {
		for (const entry of entries) {
			deduped.set(String(entry._id), entry);
		}
	}

	return [...deduped.values()].sort((a, b) => b.timestamp - a.timestamp);
}

// ── getRecordActivity Query ─────────────────────────────────────────

export const getRecordActivity = crmQuery
	.input({
		recordId: v.string(),
		recordKind: entityKindValidator,
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<ActivityQueryResult> => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// Validate the record belongs to the caller's org
		const recordOrgId = await getEntityOrgId(
			ctx,
			args.recordKind,
			args.recordId
		);
		if (recordOrgId !== orgId) {
			throw new ConvexError("Record not found or access denied");
		}

		// ── Input validation & sanitization ──────────────────────────────
		const MAX_CURSOR = 10_000;
		const MIN_LIMIT = 1;
		const MAX_LIMIT = 100;

		// Validate cursor: reject non-numeric, negative, or absurdly large values
		let offset = 0;
		if (args.cursor !== undefined) {
			const parsed = Number(args.cursor);
			if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
				throw new ConvexError(
					`Invalid cursor "${args.cursor}": must be an integer`
				);
			}
			if (parsed < 0) {
				throw new ConvexError(
					`Invalid cursor "${args.cursor}": must not be negative`
				);
			}
			offset = Math.min(parsed, MAX_CURSOR);
		}

		// Validate and clamp limit
		let limit = args.limit ?? DEFAULT_LIMIT;
		if (!(Number.isFinite(limit) && Number.isInteger(limit))) {
			throw new ConvexError(
				`Invalid limit "${args.limit}": must be an integer`
			);
		}
		if (limit < MIN_LIMIT) {
			throw new ConvexError(
				`Invalid limit "${limit}": must be at least ${MIN_LIMIT}`
			);
		}
		limit = Math.min(limit, MAX_LIMIT);
		const resourceTypes = getAuditResourceTypes(
			ctx,
			args.recordId,
			args.recordKind
		);
		const allEvents = await loadAuditEntries(
			ctx,
			resourceTypes,
			args.recordId,
			// Use a buffer to account for deduplication across resource types
			Math.ceil((offset + limit + 1) * 1.5)
		);
		const pageEvents = allEvents.slice(offset, offset + limit);
		const hasMore = allEvents.length > offset + limit;

		// Batch-resolve actor display info
		const actorIds = pageEvents
			.map((e) => e.actorId)
			.filter((id): id is string => id != null);
		const actorMap = await resolveActors(ctx, actorIds);

		// Map to ActivityEvent shape
		const events: ActivityEvent[] = pageEvents.map((entry) => {
			const actorInfo = entry.actorId
				? (actorMap.get(entry.actorId) ?? {
						id: entry.actorId,
						name: UNKNOWN_ACTOR_PREFIX,
					})
				: SYSTEM_ACTOR;

			return {
				_id: String(entry._id),
				eventType: mapActionToEventType(entry.action),
				action: entry.action,
				description: describeAction(entry.action, entry.metadata),
				actor: actorInfo,
				timestamp: entry.timestamp,
				diff: parseDiff(entry),
				metadata: entry.metadata,
			};
		});

		return {
			events,
			continueCursor: hasMore ? String(offset + limit) : null,
			isDone: !hasMore,
		};
	})
	.public();
