import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── PII Sanitization ─────────────────────────────────────────────
// Lives inside the component — host cannot bypass it
const SENSITIVE_FIELDS = [
	"email",
	"phone",
	"ssn",
	"password",
	"address",
	"socialsecuritynumber",
	"dateofbirth",
	"dob",
	"accountnumber",
	"routingnumber",
	"creditcardnumber",
	"bankaccount",
	"accesstoken",
	"refreshtoken",
	"apikey",
	"secret",
	"token",
	"streetaddress",
	"fulladdress",
];

function sanitizeState(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))) {
			continue; // Omit entirely per spec (REQ-145/153)
		}
		if (value && typeof value === "object" && !Array.isArray(value)) {
			result[key] = sanitizeState(value as Record<string, unknown>);
		} else if (Array.isArray(value)) {
			result[key] = value.map((item) =>
				item && typeof item === "object"
					? sanitizeState(item as Record<string, unknown>)
					: item
			);
		} else {
			result[key] = value;
		}
	}
	return result;
}

// ── Hash Chain Computation ───────────────────────────────────────
// Lives inside the component — host cannot forge hashes
async function computeHash(parts: {
	prevHash: string;
	eventType: string;
	entityId: string;
	actorId: string;
	timestamp: number;
	afterState: string;
}): Promise<string> {
	const payload = JSON.stringify({
		p: parts.prevHash,
		t: parts.eventType,
		e: parts.entityId,
		a: parts.actorId,
		ts: parts.timestamp,
		s: parts.afterState,
	});

	const data = new TextEncoder().encode(payload);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Insert (append-only — the ONLY write operation exposed) ──────
export const insert = mutation({
	args: {
		entityId: v.string(),
		entityType: v.string(),
		eventType: v.string(),
		actorId: v.string(),
		beforeState: v.optional(v.string()),
		afterState: v.optional(v.string()),
		metadata: v.optional(v.string()),
		timestamp: v.number(),
	},
	returns: v.id("audit_events"),
	handler: async (ctx, args) => {
		// Sanitize all payload fields inside the component
		const beforeState = args.beforeState
			? JSON.stringify(
					sanitizeState(JSON.parse(args.beforeState) as Record<string, unknown>)
				)
			: undefined;
		const afterState = args.afterState
			? JSON.stringify(
					sanitizeState(JSON.parse(args.afterState) as Record<string, unknown>)
				)
			: undefined;
		const metadata = args.metadata
			? JSON.stringify(
					sanitizeState(JSON.parse(args.metadata) as Record<string, unknown>)
				)
			: undefined;

		// Chain: get previous hash
		const prevEvent = await ctx.db
			.query("audit_events")
			.withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
			.order("desc")
			.first();
		const prevHash = prevEvent?.hash ?? "";

		const hash = await computeHash({
			prevHash,
			eventType: args.eventType,
			entityId: args.entityId,
			actorId: args.actorId,
			timestamp: args.timestamp,
			afterState: afterState ?? "",
		});

		const eventId = await ctx.db.insert("audit_events", {
			entityId: args.entityId,
			entityType: args.entityType,
			eventType: args.eventType,
			actorId: args.actorId,
			beforeState,
			afterState,
			metadata,
			prevHash,
			hash,
			emitted: false,
			timestamp: args.timestamp,
		});

		// Outbox entry in the same transaction
		await ctx.db.insert("audit_outbox", {
			eventId,
			idempotencyKey: `${args.entityId}:${args.eventType}:${args.timestamp}`,
			status: "pending",
			emitFailures: 0,
			createdAt: args.timestamp,
		});

		return eventId;
	},
});

// ── Queries (read-only) ──────────────────────────────────────────
export const queryByEntity = query({
	args: { entityId: v.string() },
	returns: v.array(
		v.object({
			_id: v.id("audit_events"),
			_creationTime: v.number(),
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
			emitFailures: v.optional(v.number()),
			timestamp: v.number(),
		})
	),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("audit_events")
			.withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
			.order("asc")
			.collect();
	},
});

export const verifyChain = query({
	args: { entityId: v.string() },
	handler: async (ctx, args) => {
		const events = await ctx.db
			.query("audit_events")
			.withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
			.order("asc")
			.collect();

		if (events.length === 0) {
			return { valid: true, eventCount: 0, firstEvent: null, lastEvent: null };
		}

		for (let i = 0; i < events.length; i++) {
			const event = events[i];
			const expectedPrevHash = i === 0 ? "" : events[i - 1].hash;

			if (event.prevHash !== expectedPrevHash) {
				return {
					valid: false,
					brokenAt: i,
					error: `prevHash mismatch at event ${i}`,
				};
			}

			const recomputed = await computeHash({
				prevHash: event.prevHash,
				eventType: event.eventType,
				entityId: event.entityId,
				actorId: event.actorId,
				timestamp: event.timestamp,
				afterState: event.afterState ?? "",
			});

			if (recomputed !== event.hash) {
				return {
					valid: false,
					brokenAt: i,
					error: `Hash mismatch at event ${i}: expected ${recomputed}, got ${event.hash}`,
				};
			}
		}

		const lastEvent = events.at(-1);
		return {
			valid: true,
			eventCount: events.length,
			firstEvent: events[0].timestamp,
			lastEvent: lastEvent ? lastEvent.timestamp : events[0].timestamp,
		};
	},
});

export const exportTrail = query({
	args: { entityId: v.string() },
	handler: async (ctx, args) => {
		const events = await ctx.db
			.query("audit_events")
			.withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
			.order("asc")
			.collect();

		return {
			entityId: args.entityId,
			exportedAt: Date.now(),
			eventCount: events.length,
			events: events.map((e) => ({
				eventType: e.eventType,
				actorId: e.actorId,
				timestamp: e.timestamp,
				beforeState: e.beforeState ? JSON.parse(e.beforeState) : null,
				afterState: e.afterState ? JSON.parse(e.afterState) : null,
				hash: e.hash,
				prevHash: e.prevHash,
				emitted: e.emitted,
				emittedAt: e.emittedAt ?? null,
			})),
		};
	},
});

export const getOutboxStatus = query({
	args: {},
	handler: async (ctx) => {
		const pending = await ctx.db
			.query("audit_outbox")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect();
		const emitted = await ctx.db
			.query("audit_outbox")
			.withIndex("by_status", (q) => q.eq("status", "emitted"))
			.collect();
		const failed = await ctx.db
			.query("audit_outbox")
			.withIndex("by_status", (q) => q.eq("status", "failed"))
			.collect();

		const now = Date.now();
		const STALE_THRESHOLD_MS = 5 * 60 * 1000;

		const recentEmitted = emitted.filter((e) => e.emittedAt);
		const avgLatencyMs =
			recentEmitted.length > 0
				? Math.round(
						recentEmitted.reduce(
							(sum, e) => sum + ((e.emittedAt ?? 0) - e.createdAt),
							0
						) / recentEmitted.length
					)
				: 0;

		const highFailureAlerts = [
			...pending.filter((e) => e.emitFailures > 3),
			...failed.filter((e) => e.emitFailures > 3),
		].length;
		const staleAlerts = pending.filter(
			(e) => now - e.createdAt > STALE_THRESHOLD_MS
		).length;

		return {
			pendingCount: pending.length,
			emittedCount: emitted.length,
			failedCount: failed.length,
			totalCount: pending.length + emitted.length + failed.length,
			avgLatencyMs,
			highFailureAlerts,
			staleAlerts,
		};
	},
});

// ── Manual emission (append-only status transition: pending → emitted) ──
export const emitPending = mutation({
	args: {},
	handler: async (ctx) => {
		const pending = await ctx.db
			.query("audit_outbox")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.take(100);

		let emittedCount = 0;
		for (const entry of pending) {
			await ctx.db.patch(entry._id, {
				status: "emitted" as const,
				emittedAt: Date.now(),
			});
			await ctx.db.patch(entry.eventId, {
				emitted: true,
				emittedAt: Date.now(),
			});
			emittedCount++;
		}
		return { emittedCount };
	},
});
