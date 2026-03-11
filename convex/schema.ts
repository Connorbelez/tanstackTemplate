import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	products: defineTable({
		title: v.string(),
		imageId: v.string(),
		price: v.number(),
	}),
	todos: defineTable({
		text: v.string(),
		completed: v.boolean(),
	}),
	numbers: defineTable({
		value: v.number(),
	}),
	users: defineTable({
		authId: v.string(),
		email: v.string(),
		firstName: v.string(),
		lastName: v.string(),
		phoneNumber: v.optional(v.string()),
	}).index("authId", ["authId"]),

	organizations: defineTable({
		workosId: v.string(),
		name: v.string(),
		allowProfilesOutsideOrganization: v.boolean(),
		externalId: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.string())),
	}).index("workosId", ["workosId"]),

	organizationMemberships: defineTable({
		workosId: v.string(),
		organizationWorkosId: v.string(),
		organizationName: v.string(),
		userWorkosId: v.string(),
		status: v.string(),
		roleSlug: v.string(),
		roleSlugs: v.optional(v.array(v.string())),
	})
		.index("workosId", ["workosId"])
		.index("byUser", ["userWorkosId"])
		.index("byOrganization", ["organizationWorkosId"]),

	roles: defineTable({
		slug: v.string(),
		permissions: v.array(v.string()),
	}).index("slug", ["slug"]),

	// ── Demo tables (prefixed demo_) ──────────────────────────────────
	demo_auth_action_logs: defineTable({
		actionType: v.string(),
		email: v.string(),
		verdict: v.string(),
		message: v.optional(v.string()),
		timestamp: v.number(),
	}),
	demo_presence_messages: defineTable({
		room: v.string(),
		author: v.string(),
		text: v.string(),
	}).index("by_room", ["room"]),

	demo_aggregate_scores: defineTable({
		player: v.string(),
		score: v.number(),
	}).index("by_player", ["player"]),

	demo_geospatial_places: defineTable({
		name: v.string(),
		latitude: v.number(),
		longitude: v.number(),
		category: v.string(),
	}),

	demo_timeline_notes: defineTable({
		title: v.string(),
		content: v.string(),
		scope: v.string(),
	}),

	demo_audit_documents: defineTable({
		title: v.string(),
		body: v.string(),
		status: v.string(),
	}),

	demo_crons_log: defineTable({
		jobName: v.string(),
		message: v.string(),
		ranAt: v.number(),
	}).index("by_job", ["jobName"]),

	demo_workflow_orders: defineTable({
		amount: v.number(),
		status: v.string(),
		currentStep: v.string(),
	}),

	demo_cascade_authors: defineTable({
		name: v.string(),
	}),
	demo_cascade_posts: defineTable({
		authorId: v.id("demo_cascade_authors"),
		title: v.string(),
	}).index("by_author", ["authorId"]),
	demo_cascade_comments: defineTable({
		postId: v.id("demo_cascade_posts"),
		text: v.string(),
	}).index("by_post", ["postId"]),

	demo_migrations_items: defineTable({
		value: v.string(),
		migrated: v.optional(v.boolean()),
	}),

	demo_api_resources: defineTable({
		name: v.string(),
		isProtected: v.boolean(),
	}),

	demo_files_metadata: defineTable({
		fileName: v.string(),
		path: v.string(),
		storageId: v.optional(v.id("_storage")),
	}),

	// ── Demo Triggers tables ─────────────────────────────────────────
	demo_triggers_contacts: defineTable({
		firstName: v.string(),
		lastName: v.string(),
		email: v.string(),
		fullName: v.string(),
		category: v.string(),
	}).index("by_email", ["email"]),

	demo_triggers_stats: defineTable({
		category: v.string(),
		count: v.number(),
	}).index("by_category", ["category"]),

	demo_triggers_log: defineTable({
		contactId: v.id("demo_triggers_contacts"),
		operation: v.string(),
		summary: v.string(),
		timestamp: v.number(),
	}),
});
