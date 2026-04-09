import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	audit_events: defineTable({
		canonicalEnvelope: v.optional(v.string()),
		entityId: v.string(),
		entityType: v.string(),
		eventType: v.string(),
		actorId: v.string(),
		beforeState: v.optional(v.string()),
		afterState: v.optional(v.string()),
		metadata: v.optional(v.string()),
		prevHash: v.string(),
		hash: v.string(),
		emitted: v.boolean(),
		emittedAt: v.optional(v.number()),
		sinkReference: v.optional(v.string()),
		emitFailures: v.optional(v.number()),
		archivedAt: v.optional(v.number()),
		retentionUntilAt: v.number(),
		timestamp: v.number(),
	})
		.index("by_entity", ["entityId", "timestamp"])
		.index("by_emitted", ["emitted"])
		.index("by_retention", ["retentionUntilAt"])
		.index("by_timestamp", ["timestamp"]),

	audit_outbox: defineTable({
		eventId: v.id("audit_events"),
		idempotencyKey: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("emitted"),
			v.literal("failed")
		),
		emitFailures: v.number(),
		createdAt: v.number(),
		emittedAt: v.optional(v.number()),
		sinkReference: v.optional(v.string()),
		archivedAt: v.optional(v.number()),
		retentionUntilAt: v.number(),
		lastFailureAt: v.optional(v.number()),
		lastFailureReason: v.optional(v.string()),
	})
		.index("by_status", ["status"])
		.index("by_idempotency_key", ["idempotencyKey"])
		.index("by_event", ["eventId"])
		.index("by_retention", ["retentionUntilAt"]),

	audit_evidence_objects: defineTable({
		eventId: v.id("audit_events"),
		idempotencyKey: v.string(),
		sinkReference: v.string(),
		contentType: v.string(),
		payload: v.string(),
		createdAt: v.number(),
	})
		.index("by_event", ["eventId"])
		.index("by_idempotency_key", ["idempotencyKey"]),
});
