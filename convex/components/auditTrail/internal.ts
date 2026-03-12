import { internalMutation } from "./_generated/server";

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
				// Production: push to SIEM/S3/compliance store using entry.idempotencyKey
				// Demo: simulate successful emission
				await ctx.db.patch(entry._id, {
					status: "emitted" as const,
					emittedAt: Date.now(),
				});
				await ctx.db.patch(entry.eventId, {
					emitted: true,
					emittedAt: Date.now(),
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
		// Demo: 30 days. Production: 7 * 365.25 * 24 * 60 * 60 * 1000
		const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
		const cutoff = Date.now() - RETENTION_MS;

		const expired = await ctx.db
			.query("audit_events")
			.withIndex("by_entity")
			.filter((q) => q.lt(q.field("timestamp"), cutoff))
			.take(100);

		let deletedCount = 0;
		for (const event of expired) {
			const outboxEntry = await ctx.db
				.query("audit_outbox")
				.withIndex("by_event", (q) => q.eq("eventId", event._id))
				.first();
			if (outboxEntry) {
				await ctx.db.delete(outboxEntry._id);
			}
			await ctx.db.delete(event._id);
			deletedCount++;
		}
		return { deletedCount };
	},
});
