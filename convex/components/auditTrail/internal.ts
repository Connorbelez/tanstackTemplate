import { internalMutation } from "./_generated/server";
import { emitAuditEvidence } from "./sink";

// ── Outbox Processor (cron-driven, at-least-once) ────────────────
export const processOutbox = internalMutation({
	args: {},
	handler: async (ctx) => {
		const pending = await ctx.db
			.query("audit_outbox")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.take(100);

		let emittedCount = 0;
		let failedCount = 0;

		for (const entry of pending) {
			try {
				const event = await ctx.db.get(entry.eventId);
				if (!event) {
					throw new Error(`Audit event not found for outbox entry ${entry._id}`);
				}

				const sinkResult = await emitAuditEvidence(ctx, {
					contentType: "application/json",
					eventId: entry.eventId,
					idempotencyKey: entry.idempotencyKey,
					payload: JSON.stringify({
						canonicalEnvelope: event.canonicalEnvelope
							? JSON.parse(event.canonicalEnvelope)
							: null,
						entityId: event.entityId,
						entityType: event.entityType,
						eventType: event.eventType,
						hash: event.hash,
						prevHash: event.prevHash,
						timestamp: event.timestamp,
					}),
				});

				const emittedAt = Date.now();
				await ctx.db.patch(entry.eventId, {
					emitted: true,
					emittedAt,
					sinkReference: sinkResult.sinkReference,
				});
				await ctx.db.patch(entry._id, {
					status: "emitted" as const,
					emittedAt,
					sinkReference: sinkResult.sinkReference,
				});
				emittedCount++;
			} catch (error) {
				const newFailures = entry.emitFailures + 1;
				await ctx.db.patch(entry._id, {
					emitFailures: newFailures,
					lastFailureAt: Date.now(),
					lastFailureReason:
						error instanceof Error ? error.message : String(error),
					status: newFailures >= 5 ? ("failed" as const) : ("pending" as const),
				});
				await ctx.db.patch(entry.eventId, {
					emitFailures: newFailures,
				});
				failedCount++;
			}
		}

		return { emittedCount, failedCount, processedCount: pending.length };
	},
});

// ── Retention Cleanup (cron-driven, daily) ───────────────────────
export const processRetention = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		const expired = await ctx.db
			.query("audit_events")
			.withIndex("by_retention", (q) => q.lte("retentionUntilAt", now))
			.take(100);

		let archivedCount = 0;
		for (const event of expired) {
			if (!event.archivedAt) {
				await ctx.db.patch(event._id, {
					archivedAt: now,
				});
				archivedCount++;
			}

			const outboxEntry = await ctx.db
				.query("audit_outbox")
				.withIndex("by_event", (q) => q.eq("eventId", event._id))
				.first();
			if (outboxEntry && !outboxEntry.archivedAt) {
				await ctx.db.patch(outboxEntry._id, {
					archivedAt: now,
				});
			}
		}
		return { archivedCount };
	},
});
