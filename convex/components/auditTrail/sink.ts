import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const AUDIT_RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1000;

export interface AuditEvidenceSink {
	emit(
		ctx: MutationCtx,
		args: {
			contentType: string;
			eventId: Id<"audit_events">;
			idempotencyKey: string;
			payload: string;
		}
	): Promise<{ sinkReference: string }>;
}

class ComponentTableAuditEvidenceSink implements AuditEvidenceSink {
	async emit(
		ctx: MutationCtx,
		args: {
			contentType: string;
			eventId: Id<"audit_events">;
			idempotencyKey: string;
			payload: string;
		}
	): Promise<{ sinkReference: string }> {
		const existing = await ctx.db
			.query("audit_evidence_objects")
			.withIndex("by_idempotency_key", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();

		if (existing) {
			if (
				existing.eventId !== args.eventId ||
				existing.contentType !== args.contentType ||
				existing.payload !== args.payload
			) {
				throw new Error(
					`Audit evidence idempotency collision for key ${args.idempotencyKey}`
				);
			}
			return { sinkReference: existing.sinkReference };
		}

		const event = await ctx.db.get(args.eventId);
		if (!event) {
			throw new Error(
				`Cannot emit audit evidence for missing event ${args.eventId}`
			);
		}

		const sinkReference = `component_table://${args.eventId}`;
		await ctx.db.insert("audit_evidence_objects", {
			eventId: args.eventId,
			idempotencyKey: args.idempotencyKey,
			sinkReference,
			contentType: args.contentType,
			payload: args.payload,
			retentionUntilAt: event.retentionUntilAt,
			createdAt: Date.now(),
		});
		return { sinkReference };
	}
}

function getConfiguredSinkName() {
	const configuredSink = process.env.AUDIT_EVIDENCE_SINK;
	if (configuredSink) {
		return configuredSink;
	}

	if (process.env.ALLOW_INMEMORY_AUDIT_EVIDENCE_SINK === "true") {
		return "component_table";
	}

	throw new Error(
		"AUDIT_EVIDENCE_SINK must be configured. Set ALLOW_INMEMORY_AUDIT_EVIDENCE_SINK=true only in local/test environments."
	);
}

function getConfiguredSink(): AuditEvidenceSink {
	switch (getConfiguredSinkName()) {
		case "component_table":
			return new ComponentTableAuditEvidenceSink();
		default:
			throw new Error(
				`Unsupported AUDIT_EVIDENCE_SINK value: ${getConfiguredSinkName()}`
			);
	}
}

export async function emitAuditEvidence(
	ctx: MutationCtx,
	args: {
		contentType: string;
		eventId: Id<"audit_events">;
		idempotencyKey: string;
		payload: string;
	}
) {
	const sink = getConfiguredSink();
	return sink.emit(ctx, args);
}
