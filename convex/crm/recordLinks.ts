import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmMutation } from "../fluent";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Loads a native entity by table name + ID using a compile-time switch.
 * Returns the document or null. Convex requires literal table names at each
 * `ctx.db.get()` call-site, so we enumerate every supported native table.
 */
async function getNativeEntity(
	ctx: MutationCtx,
	tableName: string,
	entityId: string
): Promise<{ orgId?: string } | null> {
	switch (tableName) {
		case "mortgages":
			return ctx.db.get(entityId as Id<"mortgages">);
		case "borrowers":
			return ctx.db.get(entityId as Id<"borrowers">);
		case "lenders":
			return ctx.db.get(entityId as Id<"lenders">);
		case "brokers":
			return ctx.db.get(entityId as Id<"brokers">);
		case "deals":
			return ctx.db.get(entityId as Id<"deals">);
		case "obligations":
			return ctx.db.get(entityId as Id<"obligations">);
		default:
			throw new ConvexError(`Unknown native table: ${tableName}`);
	}
}

/**
 * Validates that an entity exists, belongs to the given org, and (for records)
 * matches the expected objectDef. Throws ConvexError on any failure.
 *
 * @param kind - "record" or "native"
 * @param entityId - The entity's Convex ID as a string
 * @param orgId - The org that must own the entity
 * @param objectDef - The objectDef that defines the entity's type
 */
async function validateEntityExists(
	ctx: MutationCtx,
	kind: "record" | "native",
	entityId: string,
	orgId: string,
	objectDef: Doc<"objectDefs">
): Promise<void> {
	if (kind === "record") {
		const record = await ctx.db.get(entityId as Id<"records">);
		if (!record || record.isDeleted || record.orgId !== orgId) {
			throw new ConvexError("Record not found or access denied");
		}
		if (record.objectDefId !== objectDef._id) {
			throw new ConvexError("Record does not match expected object type");
		}
		return;
	}

	// kind === "native"
	const nativeTable = objectDef.nativeTable;
	if (!nativeTable) {
		throw new ConvexError(
			`ObjectDef "${objectDef.name}" has no nativeTable configured`
		);
	}

	const entity = await getNativeEntity(ctx, nativeTable, entityId);
	if (!entity || entity.orgId !== orgId) {
		throw new ConvexError("Entity not found or access denied");
	}
}

// ── Mutations ────────────────────────────────────────────────────────

// ── createLink ──────────────────────────────────────────────────────
export const createLink = crmMutation
	.input({
		linkTypeDefId: v.id("linkTypeDefs"),
		sourceKind: v.union(v.literal("record"), v.literal("native")),
		sourceId: v.string(),
		targetKind: v.union(v.literal("record"), v.literal("native")),
		targetId: v.string(),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// 1. Load + verify linkTypeDef
		const linkTypeDef = await ctx.db.get(args.linkTypeDefId);
		if (!linkTypeDef?.isActive || linkTypeDef.orgId !== orgId) {
			throw new ConvexError("Link type not found or access denied");
		}

		// 2. Load + verify source objectDef
		const sourceObjectDef = await ctx.db.get(linkTypeDef.sourceObjectDefId);
		if (!sourceObjectDef?.isActive || sourceObjectDef.orgId !== orgId) {
			throw new ConvexError("Source object type not found or access denied");
		}

		// 3. Load + verify target objectDef
		const targetObjectDef = await ctx.db.get(linkTypeDef.targetObjectDefId);
		if (!targetObjectDef?.isActive || targetObjectDef.orgId !== orgId) {
			throw new ConvexError("Target object type not found or access denied");
		}

		// 4. Validate source entity exists
		await validateEntityExists(
			ctx,
			args.sourceKind,
			args.sourceId,
			orgId,
			sourceObjectDef
		);

		// 5. Validate target entity exists
		await validateEntityExists(
			ctx,
			args.targetKind,
			args.targetId,
			orgId,
			targetObjectDef
		);

		// 6. Duplicate detection: same source + target + linkType + not deleted
		const existingSourceLinks = await ctx.db
			.query("recordLinks")
			.withIndex("by_org_source", (q) =>
				q
					.eq("orgId", orgId)
					.eq("sourceKind", args.sourceKind)
					.eq("sourceId", args.sourceId)
			)
			.collect();

		const duplicate = existingSourceLinks.find(
			(link) =>
				link.targetId === args.targetId &&
				link.linkTypeDefId === args.linkTypeDefId &&
				!link.isDeleted
		);
		if (duplicate) {
			throw new ConvexError(
				"A link of this type already exists between these entities"
			);
		}

		// 7. Cardinality enforcement
		const { cardinality } = linkTypeDef;

		if (cardinality === "one_to_one") {
			// Source must not have any active link of this type
			const sourceHasLink = existingSourceLinks.some(
				(link) => link.linkTypeDefId === args.linkTypeDefId && !link.isDeleted
			);
			if (sourceHasLink) {
				throw new ConvexError(
					"Cardinality violation: source already has a link of this type (one-to-one)"
				);
			}

			// Target must not have any active link of this type
			const existingTargetLinks = await ctx.db
				.query("recordLinks")
				.withIndex("by_org_target", (q) =>
					q
						.eq("orgId", orgId)
						.eq("targetKind", args.targetKind)
						.eq("targetId", args.targetId)
				)
				.collect();

			const targetHasLink = existingTargetLinks.some(
				(link) => link.linkTypeDefId === args.linkTypeDefId && !link.isDeleted
			);
			if (targetHasLink) {
				throw new ConvexError(
					"Cardinality violation: target already has a link of this type (one-to-one)"
				);
			}
		} else if (cardinality === "one_to_many") {
			// Source (the "one" side) must not have more than 1 active link of this type
			const sourceHasLink = existingSourceLinks.some(
				(link) => link.linkTypeDefId === args.linkTypeDefId && !link.isDeleted
			);
			if (sourceHasLink) {
				throw new ConvexError(
					"Cardinality violation: source already has a link of this type (one-to-many)"
				);
			}
		}
		// many_to_many: no cardinality check needed

		// Insert the link
		const now = Date.now();
		const linkId = await ctx.db.insert("recordLinks", {
			orgId,
			linkTypeDefId: args.linkTypeDefId,
			sourceObjectDefId: linkTypeDef.sourceObjectDefId,
			sourceKind: args.sourceKind,
			sourceId: args.sourceId,
			targetObjectDefId: linkTypeDef.targetObjectDefId,
			targetKind: args.targetKind,
			targetId: args.targetId,
			isDeleted: false,
			createdAt: now,
			createdBy: ctx.viewer.authId,
		});

		// Audit
		await auditLog.log(ctx, {
			action: "crm.link.created",
			actorId: ctx.viewer.authId,
			resourceType: "recordLinks",
			resourceId: linkId,
			severity: "info",
			metadata: {
				linkTypeDefId: args.linkTypeDefId,
				sourceKind: args.sourceKind,
				sourceId: args.sourceId,
				targetKind: args.targetKind,
				targetId: args.targetId,
				orgId,
			},
		});

		return linkId;
	})
	.public();

// ── deleteLink ──────────────────────────────────────────────────────
// Soft-delete: sets isDeleted=true.
export const deleteLink = crmMutation
	.input({ linkId: v.id("recordLinks") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		const link = await ctx.db.get(args.linkId);
		if (!link || link.orgId !== orgId) {
			throw new ConvexError("Link not found or access denied");
		}
		if (link.isDeleted) {
			throw new ConvexError("Link is already deleted");
		}

		// Soft-delete
		await ctx.db.patch(args.linkId, { isDeleted: true });

		// Audit
		await auditLog.log(ctx, {
			action: "crm.link.deleted",
			actorId: ctx.viewer.authId,
			resourceType: "recordLinks",
			resourceId: args.linkId,
			severity: "warning",
			metadata: {
				linkTypeDefId: link.linkTypeDefId,
				sourceKind: link.sourceKind,
				sourceId: link.sourceId,
				targetKind: link.targetKind,
				targetId: link.targetId,
				orgId,
			},
		});
	})
	.public();
