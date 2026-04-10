import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const auditLogSchema = defineSchema({
	auditLogs: defineTable({
		action: v.string(),
		actorId: v.optional(v.string()),
		timestamp: v.number(),
		resourceType: v.optional(v.string()),
		resourceId: v.optional(v.string()),
		metadata: v.optional(v.any()),
		severity: v.union(
			v.literal("info"),
			v.literal("warning"),
			v.literal("error"),
			v.literal("critical")
		),
		ipAddress: v.optional(v.string()),
		userAgent: v.optional(v.string()),
		sessionId: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		before: v.optional(v.any()),
		after: v.optional(v.any()),
		diff: v.optional(v.string()),
		retentionCategory: v.optional(v.string()),
	})
		.index("by_action_timestamp", ["action", "timestamp"])
		.index("by_actor_timestamp", ["actorId", "timestamp"])
		.index("by_resource", ["resourceType", "resourceId", "timestamp"])
		.index("by_severity_timestamp", ["severity", "timestamp"])
		.index("by_timestamp", ["timestamp"])
		.index("by_retention_timestamp", ["retentionCategory", "timestamp"]),
	config: defineTable({
		defaultRetentionDays: v.number(),
		criticalRetentionDays: v.number(),
		piiFieldsToRedact: v.array(v.string()),
		samplingEnabled: v.boolean(),
		samplingRate: v.number(),
		customRetention: v.optional(
			v.array(
				v.object({
					category: v.string(),
					retentionDays: v.number(),
				})
			)
		),
	}),
});

const item = v.object({
	k: v.any(),
	v: v.any(),
	s: v.number(),
});

const aggregate = v.object({
	count: v.number(),
	sum: v.number(),
});

export const aggregateSchema = defineSchema({
	btree: defineTable({
		root: v.id("btreeNode"),
		namespace: v.optional(v.any()),
		maxNodeSize: v.number(),
	}).index("by_namespace", ["namespace"]),
	btreeNode: defineTable({
		items: v.array(item),
		subtrees: v.array(v.id("btreeNode")),
		aggregate: v.optional(aggregate),
	}),
});
