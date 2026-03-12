import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	draftStateValidator,
	formatOptionsValidator,
	pageDimensionValidator,
	signatoryConfigValidator,
	variableTypeValidator,
} from "./documentEngine/validators";

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
		organizationName: v.optional(v.string()),
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
	})
		.index("by_player", ["player"])
		.index("by_score", ["score"]),

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

	// ── Demo fluent-convex tables ───────────────────────────────────
	demo_fluent_widgets: defineTable({
		name: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	}),
	demo_fluent_widget_users: defineTable({
		widgetId: v.id("demo_fluent_widgets"),
		userId: v.string(),
		role: v.string(),
	}).index("by_widget", ["widgetId"]),

	// ── Demo Audit & Traceability ────────────────────────────────────
	demo_audit_mortgages: defineTable({
		label: v.string(),
		currentOwnerId: v.string(),
		newOwnerId: v.optional(v.string()),
		ownershipPercentage: v.number(),
		status: v.union(
			v.literal("active"),
			v.literal("transfer_initiated"),
			v.literal("transfer_approved"),
			v.literal("transfer_completed"),
			v.literal("transfer_rejected")
		),
		borrowerEmail: v.optional(v.string()),
		borrowerPhone: v.optional(v.string()),
		borrowerSsn: v.optional(v.string()),
		propertyAddress: v.optional(v.string()),
		loanAmount: v.number(),
		updatedBy: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_status", ["status"]),

	// NOTE: demo_audit_events and demo_audit_outbox have moved into the
	// auditTrail component (convex/components/auditTrail/). The host app's
	// ctx.db cannot access them — append-only by design, not policy.

	// ── Mortgage Ownership Ledger ────────────────────────────────────

	ledger_accounts: defineTable({
		type: v.union(
			v.literal("WORLD"),
			v.literal("TREASURY"),
			v.literal("POSITION")
		),
		mortgageId: v.optional(v.string()),
		investorId: v.optional(v.string()),
		cumulativeDebits: v.int64(),
		cumulativeCredits: v.int64(),
		createdAt: v.float64(),
		metadata: v.optional(v.record(v.string(), v.any())),
	})
		.index("by_mortgage", ["mortgageId"])
		.index("by_investor", ["investorId"])
		.index("by_mortgage_and_investor", ["mortgageId", "investorId"])
		.index("by_type_and_mortgage", ["type", "mortgageId"]),

	ledger_journal_entries: defineTable({
		sequenceNumber: v.int64(),
		entryType: v.union(
			v.literal("MORTGAGE_MINTED"),
			v.literal("SHARES_ISSUED"),
			v.literal("SHARES_TRANSFERRED"),
			v.literal("SHARES_REDEEMED"),
			v.literal("MORTGAGE_BURNED"),
			v.literal("CORRECTION")
		),
		mortgageId: v.string(),
		effectiveDate: v.string(),
		timestamp: v.float64(),
		debitAccountId: v.id("ledger_accounts"),
		creditAccountId: v.id("ledger_accounts"),
		amount: v.int64(),
		idempotencyKey: v.string(),
		causedBy: v.optional(v.id("ledger_journal_entries")),
		source: v.object({
			type: v.union(
				v.literal("user"),
				v.literal("system"),
				v.literal("webhook"),
				v.literal("cron")
			),
			actor: v.optional(v.string()),
			channel: v.optional(v.string()),
		}),
		reason: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.any())),
	})
		.index("by_idempotency", ["idempotencyKey"])
		.index("by_mortgage_and_time", ["mortgageId", "timestamp"])
		.index("by_sequence", ["sequenceNumber"])
		.index("by_debit_account", ["debitAccountId", "timestamp"])
		.index("by_credit_account", ["creditAccountId", "timestamp"])
		.index("by_entry_type", ["entryType", "timestamp"]),

	ledger_cursors: defineTable({
		consumerId: v.string(),
		lastProcessedSequence: v.int64(),
		lastProcessedAt: v.float64(),
	}).index("by_consumer", ["consumerId"]),

	// ── Demo Governed Transitions ───────────────────────────────────
	demo_gt_entities: defineTable({
		entityType: v.string(),
		label: v.string(),
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),
		data: v.optional(v.any()),
		createdAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_type", ["entityType"]),

	demo_gt_journal: defineTable({
		entityType: v.string(),
		entityId: v.id("demo_gt_entities"),
		eventType: v.string(),
		payload: v.optional(v.any()),
		previousState: v.string(),
		newState: v.string(),
		outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
		reason: v.optional(v.string()),
		source: v.object({
			channel: v.string(),
			actorId: v.optional(v.string()),
			actorType: v.optional(v.string()),
			sessionId: v.optional(v.string()),
			ip: v.optional(v.string()),
		}),
		machineVersion: v.optional(v.string()),
		timestamp: v.number(),
		effectsScheduled: v.optional(v.array(v.string())),
	})
		.index("by_entity", ["entityId", "timestamp"])
		.index("by_outcome", ["outcome", "timestamp"])
		.index("by_actor", ["source.actorId", "timestamp"])
		.index("by_type_and_time", ["entityType", "timestamp"]),

	demo_gt_effects_log: defineTable({
		entityId: v.id("demo_gt_entities"),
		journalEntryId: v.id("demo_gt_journal"),
		effectName: v.string(),
		status: v.union(
			v.literal("scheduled"),
			v.literal("completed"),
			v.literal("failed")
		),
		scheduledAt: v.number(),
		completedAt: v.optional(v.number()),
	})
		.index("by_entity", ["entityId"])
		.index("by_journal", ["journalEntryId"]),

	// ── Document Engine ──────────────────────────────────────────────

	documentBasePdfs: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		fileRef: v.id("_storage"),
		fileHash: v.string(),
		fileSize: v.number(),
		pageCount: v.number(),
		pageDimensions: v.array(pageDimensionValidator),
		uploadedBy: v.optional(v.string()),
		uploadedAt: v.number(),
	})
		.index("by_hash", ["fileHash"])
		.index("by_name", ["name"]),

	systemVariables: defineTable({
		key: v.string(),
		label: v.string(),
		type: variableTypeValidator,
		description: v.optional(v.string()),
		systemPath: v.optional(v.string()),
		formatOptions: formatOptionsValidator,
		createdBy: v.optional(v.string()),
		createdAt: v.number(),
	}).index("by_key", ["key"]),

	documentTemplates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		basePdfId: v.id("documentBasePdfs"),
		basePdfHash: v.string(),
		draft: draftStateValidator,
		currentPublishedVersion: v.optional(v.number()),
		hasDraftChanges: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_name", ["name"])
		.index("by_base_pdf", ["basePdfId"]),

	documentTemplateVersions: defineTable({
		templateId: v.id("documentTemplates"),
		version: v.number(),
		basePdfId: v.id("documentBasePdfs"),
		basePdfHash: v.string(),
		snapshot: draftStateValidator,
		publishedBy: v.optional(v.string()),
		publishedAt: v.number(),
	}).index("by_template", ["templateId", "version"]),

	documentTemplateGroups: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		templateRefs: v.array(
			v.object({
				templateId: v.id("documentTemplates"),
				order: v.number(),
				pinnedVersion: v.optional(v.number()),
			})
		),
		signatories: v.array(signatoryConfigValidator),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_name", ["name"]),
});
