import type {
	GenericDataModel,
	GenericMutationCtx,
	GenericQueryCtx,
} from "convex/server";

// biome-ignore lint/suspicious/noExplicitAny: Component API type is opaque from host
type AuditTrailComponentApi = any;
type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<
	GenericMutationCtx<GenericDataModel>,
	"runQuery" | "runMutation"
>;

/**
 * Client class for the auditTrail component.
 *
 * Provides an append-only API: insert, query, verify, export.
 * No update, delete, or patch — by design.
 */
export class AuditTrail {
	private readonly component: AuditTrailComponentApi;

	constructor(component: AuditTrailComponentApi) {
		this.component = component;
	}

	/** Insert an audit event + outbox entry atomically. */
	async insert(
		ctx: MutationCtx,
		event: {
			entityId: string;
			entityType: string;
			eventType: string;
			actorId: string;
			beforeState?: string;
			afterState?: string;
			metadata?: string;
			timestamp: number;
		}
	): Promise<string> {
		return await ctx.runMutation(this.component.lib.insert, event);
	}

	/** Query all audit events for an entity, ordered ascending. */
	async queryByEntity(ctx: QueryCtx, args: { entityId: string }) {
		return await ctx.runQuery(this.component.lib.queryByEntity, args);
	}

	/** Verify hash chain integrity for an entity. */
	async verifyChain(ctx: QueryCtx, args: { entityId: string }) {
		return await ctx.runQuery(this.component.lib.verifyChain, args);
	}

	/** Export the full audit trail for an entity as structured data. */
	async exportTrail(ctx: QueryCtx, args: { entityId: string }) {
		return await ctx.runQuery(this.component.lib.exportTrail, args);
	}

	/** Get outbox status (pending/emitted/failed counts + alerts). */
	async getOutboxStatus(ctx: QueryCtx) {
		return await ctx.runQuery(this.component.lib.getOutboxStatus, {});
	}

	/** Manually emit pending outbox entries. */
	async emitPending(ctx: MutationCtx) {
		return await ctx.runMutation(this.component.lib.emitPending, {});
	}
}
