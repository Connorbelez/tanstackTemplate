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
			return { sinkReference: existing.sinkReference };
		}

		const sinkReference = `component_table://${args.eventId}`;
		await ctx.db.insert("audit_evidence_objects", {
			eventId: args.eventId,
			idempotencyKey: args.idempotencyKey,
			sinkReference,
			contentType: args.contentType,
			payload: args.payload,
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

	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"AUDIT_EVIDENCE_SINK must be configured in production. Refusing to emit audit evidence without a durable sink."
		);
	}

	return "component_table";
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
