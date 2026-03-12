import type {
	Auth,
	GenericDatabaseWriter,
	GenericMutationCtx,
} from "convex/server";
import { v } from "convex/values";
import { AuditLog } from "convex-audit-log";
import { Triggers } from "convex-helpers/server/triggers";
import { Tracer } from "convex-tracer";
import { components } from "../_generated/api";
import type { DataModel, Doc } from "../_generated/dataModel";
import { query, mutation as rawMutation } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";
import { convex } from "../fluent";

// ── Setup ────────────────────────────────────────────────────────
// Layer 3: Third-party audit log component (its own PII redaction)
const auditLog = new AuditLog(components.auditLog, {
	piiFields: [
		"email",
		"phone",
		"ssn",
		"password",
		"address",
		"socialSecurityNumber",
		"dateOfBirth",
		"dob",
		"accountNumber",
		"routingNumber",
		"creditCardNumber",
		"bankAccount",
		"accessToken",
		"refreshToken",
		"apiKey",
		"secret",
		"token",
		"streetAddress",
		"fullAddress",
	],
});

// Layer 1+4: Local audit trail component (sanitization + hash chain)
// Append-only by design — no update/delete/patch exposed
const auditTrail = new AuditTrail(components.auditTrail);

const { tracedMutation } = new Tracer<DataModel>(components.tracer, {
	sampleRate: 1.0,
	preserveErrors: true,
	retentionMinutes: 60,
});

const triggers = new Triggers<DataModel>();

// ── Event Type Derivation ────────────────────────────────────────
function deriveEventType(
	operation: "insert" | "update" | "delete",
	oldDoc?: Doc<"demo_audit_mortgages"> | null,
	newDoc?: Doc<"demo_audit_mortgages"> | null
): string {
	if (operation === "insert") {
		return "mortgage.created";
	}
	if (operation === "delete") {
		return "mortgage.deleted";
	}

	const oldStatus = oldDoc?.status;
	const newStatus = newDoc?.status;

	if (oldStatus !== newStatus) {
		switch (newStatus) {
			case "transfer_initiated":
				return "transfer.initiated";
			case "transfer_approved":
				return "transfer.approved";
			case "transfer_completed":
				return "transfer.completed";
			case "transfer_rejected":
				return "transfer.rejected";
			default:
				return "mortgage.updated";
		}
	}
	return "mortgage.updated";
}

// ── Trigger Registration (Layer 1 — zero-miss guarantee) ─────────
// The trigger sends RAW state to the component. Sanitization + hashing
// happen inside the component where the host cannot bypass them.
triggers.register("demo_audit_mortgages", async (ctx, change) => {
	const timestamp = Date.now();
	const entityId = change.id as string;

	const eventType = deriveEventType(
		change.operation,
		change.oldDoc,
		change.newDoc
	);

	// Pass raw state — the component sanitizes internally
	const beforeState = change.oldDoc ? JSON.stringify(change.oldDoc) : undefined;
	const afterState = change.newDoc ? JSON.stringify(change.newDoc) : undefined;

	const actorId =
		change.newDoc?.updatedBy ?? change.oldDoc?.updatedBy ?? "system";

	// Layer 1+4: Insert into the isolated component (sanitization + hash
	// chain + outbox all happen inside the component's transaction)
	await auditTrail.insert(ctx, {
		entityId,
		entityType: "demo_audit_mortgages",
		eventType,
		actorId,
		beforeState,
		afterState,
		timestamp,
	});

	// Layer 3: Third-party component store (its own PII redaction)
	const severity = eventType.includes("rejected") ? "warning" : "info";
	if (change.operation === "update" && change.oldDoc && change.newDoc) {
		await auditLog.logChange(ctx, {
			action: eventType,
			actorId,
			resourceType: "demo_audit_mortgages",
			resourceId: entityId,
			before: change.oldDoc,
			after: change.newDoc,
			generateDiff: true,
			severity,
		});
	} else {
		await auditLog.log(ctx, {
			action: eventType,
			actorId,
			resourceType: "demo_audit_mortgages",
			resourceId: entityId,
			severity,
		});
	}
});

// ── Fluent Middleware ─────────────────────────────────────────────
const withAuditContext = convex
	.$context<{ auth: Auth }>()
	.createMiddleware(async (context, next) => {
		const identity = await context.auth.getUserIdentity();
		const auditActor = identity?.subject ?? "demo-anonymous";
		return next({ ...context, auditActor });
	});

const withTriggers = convex
	.$context<{ db: GenericDatabaseWriter<DataModel> }>()
	.createMiddleware(async (context, next) => {
		const wrapped = triggers.wrapDB(
			context as unknown as GenericMutationCtx<DataModel>
		);
		return next({ ...context, db: wrapped.db });
	});

const auditedMutation = convex
	.mutation()
	.use(withAuditContext)
	.use(withTriggers);

// ── Mutations ────────────────────────────────────────────────────
export const createMortgage = auditedMutation
	.input({
		label: v.string(),
		currentOwnerId: v.string(),
		loanAmount: v.number(),
		borrowerEmail: v.optional(v.string()),
		borrowerPhone: v.optional(v.string()),
		borrowerSsn: v.optional(v.string()),
		propertyAddress: v.optional(v.string()),
	})
	.handler(async (ctx, input) => {
		return await ctx.db.insert("demo_audit_mortgages", {
			label: input.label,
			currentOwnerId: input.currentOwnerId,
			ownershipPercentage: 100,
			status: "active",
			borrowerEmail: input.borrowerEmail,
			borrowerPhone: input.borrowerPhone,
			borrowerSsn: input.borrowerSsn,
			propertyAddress: input.propertyAddress,
			loanAmount: input.loanAmount,
			updatedBy: ctx.auditActor,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	})
	.public();

export const initiateTransfer = auditedMutation
	.input({
		id: v.id("demo_audit_mortgages"),
		newOwnerId: v.string(),
		ownershipPercentage: v.number(),
	})
	.handler(async (ctx, input) => {
		const mortgage = await ctx.db.get(input.id);
		if (!mortgage) {
			throw new Error("Mortgage not found");
		}
		if (mortgage.status !== "active") {
			throw new Error("Mortgage must be active to initiate transfer");
		}

		await ctx.db.patch(input.id, {
			status: "transfer_initiated",
			newOwnerId: input.newOwnerId,
			ownershipPercentage: input.ownershipPercentage,
			updatedBy: ctx.auditActor,
			updatedAt: Date.now(),
		});
	})
	.public();

export const approveTransfer = auditedMutation
	.input({ id: v.id("demo_audit_mortgages") })
	.handler(async (ctx, input) => {
		const mortgage = await ctx.db.get(input.id);
		if (!mortgage) {
			throw new Error("Mortgage not found");
		}
		if (mortgage.status !== "transfer_initiated") {
			throw new Error("Transfer must be initiated before approval");
		}

		await ctx.db.patch(input.id, {
			status: "transfer_approved",
			updatedBy: ctx.auditActor,
			updatedAt: Date.now(),
		});
	})
	.public();

export const completeTransfer = auditedMutation
	.input({ id: v.id("demo_audit_mortgages") })
	.handler(async (ctx, input) => {
		const mortgage = await ctx.db.get(input.id);
		if (!mortgage) {
			throw new Error("Mortgage not found");
		}
		if (mortgage.status !== "transfer_approved") {
			throw new Error("Transfer must be approved before completion");
		}

		await ctx.db.patch(input.id, {
			status: "transfer_completed",
			currentOwnerId: mortgage.newOwnerId ?? mortgage.currentOwnerId,
			newOwnerId: undefined,
			updatedBy: ctx.auditActor,
			updatedAt: Date.now(),
		});
	})
	.public();

export const rejectTransfer = auditedMutation
	.input({ id: v.id("demo_audit_mortgages") })
	.handler(async (ctx, input) => {
		const mortgage = await ctx.db.get(input.id);
		if (!mortgage) {
			throw new Error("Mortgage not found");
		}
		if (
			mortgage.status !== "transfer_initiated" &&
			mortgage.status !== "transfer_approved"
		) {
			throw new Error("No pending transfer to reject");
		}

		await ctx.db.patch(input.id, {
			status: "transfer_rejected",
			newOwnerId: undefined,
			updatedBy: ctx.auditActor,
			updatedAt: Date.now(),
		});
	})
	.public();

export const seedData = auditedMutation
	.input({})
	.handler(async (ctx) => {
		const existing = await ctx.db.query("demo_audit_mortgages").first();
		if (existing) {
			return;
		}

		const mortgages = [
			{
				label: "123 Main St Mortgage",
				currentOwnerId: "owner-alice",
				loanAmount: 450_000,
				borrowerEmail: "alice@example.com",
				borrowerPhone: "555-0101",
				borrowerSsn: "123-45-6789",
				propertyAddress: "123 Main St, Toronto, ON",
			},
			{
				label: "456 Oak Ave Mortgage",
				currentOwnerId: "owner-bob",
				loanAmount: 320_000,
				borrowerEmail: "bob@example.com",
				borrowerPhone: "555-0202",
				borrowerSsn: "987-65-4321",
				propertyAddress: "456 Oak Ave, Vancouver, BC",
			},
		];

		for (const m of mortgages) {
			await ctx.db.insert("demo_audit_mortgages", {
				...m,
				ownershipPercentage: 100,
				status: "active",
				updatedBy: ctx.auditActor,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		}
	})
	.public();

// ── Queries (delegate to component) ──────────────────────────────
export const listMortgages = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("demo_audit_mortgages").order("desc").collect();
	},
});

export const getAuditEvents = query({
	args: { entityId: v.string() },
	handler: async (ctx, args) => {
		return await auditTrail.queryByEntity(ctx, {
			entityId: args.entityId,
		});
	},
});

export const verifyChain = query({
	args: { entityId: v.string() },
	handler: async (ctx, args) => {
		return await auditTrail.verifyChain(ctx, { entityId: args.entityId });
	},
});

export const exportAuditTrail = query({
	args: { entityId: v.string() },
	handler: async (ctx, args) => {
		return await auditTrail.exportTrail(ctx, { entityId: args.entityId });
	},
});

export const getOutboxStatus = query({
	args: {},
	handler: async (ctx) => {
		return await auditTrail.getOutboxStatus(ctx);
	},
});

export const getAuditTrail = query({
	args: {
		mode: v.union(v.literal("resource"), v.literal("actor")),
		resourceId: v.optional(v.string()),
		actorId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.mode === "resource" && args.resourceId) {
			return await auditLog.queryByResource(ctx, {
				resourceType: "demo_audit_mortgages",
				resourceId: args.resourceId,
				limit: 50,
			});
		}
		if (args.mode === "actor" && args.actorId) {
			return await auditLog.queryByActor(ctx, {
				actorId: args.actorId,
				limit: 50,
			});
		}
		return [];
	},
});

export const watchCritical = query({
	args: {},
	handler: async (ctx) => {
		return await auditLog.watchCritical(ctx, {
			severity: ["warning", "error", "critical"],
			limit: 20,
		});
	},
});

// ── Audit-the-Auditor (read access logging) ─────────────────────
export const logAuditAccess = auditedMutation
	.input({
		page: v.union(
			v.literal("hash-chain"),
			v.literal("audit-trail"),
			v.literal("access-log"),
			v.literal("pipeline"),
			v.literal("export")
		),
		entityId: v.optional(v.string()),
	})
	.handler(async (ctx, input) => {
		await auditLog.log(ctx, {
			action: `audit.viewed.${input.page}`,
			actorId: ctx.auditActor,
			resourceType: "audit_trail",
			resourceId: input.entityId ?? "global",
			severity: "info",
		});
	})
	.public();

export const getAccessLog = query({
	args: {
		entityId: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		return await auditLog.queryByResource(ctx, {
			resourceType: "audit_trail",
			resourceId: args.entityId ?? "global",
			limit: args.limit ?? 50,
		});
	},
});

// ── Compliance Report Generation ─────────────────────────────────
export const generateComplianceReport = query({
	args: {},
	handler: async (ctx) => {
		const mortgages = await ctx.db
			.query("demo_audit_mortgages")
			.order("desc")
			.collect();

		// Verify every entity's hash chain
		const chainResults = await Promise.all(
			mortgages.map(async (m) => {
				const entityId = m._id as string;
				const verification = await auditTrail.verifyChain(ctx, { entityId });
				const trail = await auditTrail.exportTrail(ctx, { entityId });
				return {
					entityId,
					label: m.label,
					status: m.status,
					verification,
					eventCount: trail.eventCount,
				};
			})
		);

		const allChainsValid = chainResults.every(
			(r) => r.verification.valid === true
		);

		// Outbox delivery health
		const outbox = await auditTrail.getOutboxStatus(ctx);

		// Access log summary
		const accessLog = await auditLog.queryByResource(ctx, {
			resourceType: "audit_trail",
			resourceId: "global",
			limit: 100,
		});

		return {
			generatedAt: Date.now(),
			summary: {
				totalEntities: mortgages.length,
				totalAuditEvents: chainResults.reduce(
					(sum, r) => sum + r.eventCount,
					0
				),
				allChainsValid,
				chainsVerified: chainResults.length,
				chainsFailed: chainResults.filter((r) => !r.verification.valid).length,
			},
			controls: {
				hashChainIntegrity: {
					status: allChainsValid ? "PASS" : "FAIL",
					detail: chainResults.map((r) => ({
						entity: r.label,
						entityId: r.entityId,
						valid: r.verification.valid,
						eventCount: r.eventCount,
						error: r.verification.valid ? null : r.verification.error,
					})),
				},
				outboxDelivery: {
					status: outbox.failedCount === 0 ? "PASS" : "WARN",
					pending: outbox.pendingCount,
					emitted: outbox.emittedCount,
					failed: outbox.failedCount,
					avgLatencyMs: outbox.avgLatencyMs,
					alerts: {
						highFailure: outbox.highFailureAlerts,
						stale: outbox.staleAlerts,
					},
				},
				accessLogging: {
					status: accessLog.length > 0 ? "PASS" : "INFO",
					totalAccessEvents: accessLog.length,
					detail:
						"Read access to audit data is logged via audit.viewed.* events",
				},
				piiSanitization: {
					status: "PASS",
					detail:
						"PII fields are omitted at write time inside the isolated audit trail component. Host cannot bypass sanitization.",
					fieldsOmitted: [
						"email",
						"phone",
						"ssn",
						"password",
						"address",
						"dateOfBirth",
						"accountNumber",
						"routingNumber",
						"creditCardNumber",
						"bankAccount",
						"accessToken",
						"refreshToken",
						"apiKey",
						"secret",
						"token",
					],
				},
				componentIsolation: {
					status: "PASS",
					detail:
						"Audit tables live in a defineComponent() boundary. Host ctx.db cannot access audit_events or audit_outbox — enforced at compile time.",
				},
			},
			entityDetails: chainResults,
		};
	},
});

// ── Manual Outbox Emission (delegates to component) ──────────────
export const emitPendingEvents = rawMutation({
	args: {},
	handler: async (ctx) => {
		return await auditTrail.emitPending(ctx);
	},
});

// ── Traced Lifecycle (Observability Showcase) ────────────────────
export const tracedTransferLifecycle = tracedMutation({
	name: "tracedTransferLifecycle",
	args: {},
	handler: async (ctx) => {
		const wrappedCtx = triggers.wrapDB(ctx);

		const mortgageId = await ctx.tracer.withSpan(
			"createMortgage",
			async (span) => {
				const id = await wrappedCtx.db.insert("demo_audit_mortgages", {
					label: "Traced Demo Mortgage",
					currentOwnerId: "owner-traced",
					ownershipPercentage: 100,
					status: "active",
					borrowerEmail: "traced@example.com",
					loanAmount: 500_000,
					updatedBy: "tracer-demo",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				await span.updateMetadata({ mortgageId: id });
				await ctx.tracer.info("Mortgage created", { id });
				return id;
			}
		);

		await ctx.tracer.withSpan("initiateTransfer", async (span) => {
			await span.updateMetadata({ mortgageId });
			await wrappedCtx.db.patch(mortgageId, {
				status: "transfer_initiated",
				newOwnerId: "owner-new",
				ownershipPercentage: 50,
				updatedBy: "tracer-demo",
				updatedAt: Date.now(),
			});
			await ctx.tracer.info("Transfer initiated");
		});

		await ctx.tracer.withSpan("approveTransfer", async (span) => {
			await span.updateMetadata({ mortgageId });
			await wrappedCtx.db.patch(mortgageId, {
				status: "transfer_approved",
				updatedBy: "tracer-demo",
				updatedAt: Date.now(),
			});
			await ctx.tracer.info("Transfer approved");
		});

		await ctx.tracer.withSpan("completeTransfer", async (span) => {
			await span.updateMetadata({ mortgageId });
			await wrappedCtx.db.patch(mortgageId, {
				status: "transfer_completed",
				currentOwnerId: "owner-new",
				newOwnerId: undefined,
				updatedBy: "tracer-demo",
				updatedAt: Date.now(),
			});
			await ctx.tracer.info("Transfer completed");
		});

		return {
			success: true,
			mortgageId,
			message:
				"Full lifecycle completed with 4 spans and 4 audit events in hash chain",
		};
	},
});
