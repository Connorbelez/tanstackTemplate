import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmMutation } from "../fluent";
import { entityKindValidator } from "./validators";

// ── Helpers ──────────────────────────────────────────────────────────

/** Supported native tables that can participate in record links. */
type NativeTable =
	| "mortgages"
	| "borrowers"
	| "lenders"
	| "brokers"
	| "deals"
	| "obligations";

/**
 * Loads a native entity by table name + ID using a runtime switch over
 * supported tables. Returns the document or null. Throws ConvexError if
 * the table name is not in the supported set.
 */
async function getNativeEntity(
	ctx: MutationCtx,
	tableName: NativeTable,
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
		default: {
			const _exhaustive: never = tableName;
			throw new ConvexError(`Unknown native table: ${String(_exhaustive)}`);
		}
	}
}

/**
 * Validates that an entity exists, belongs to the given org, and (for records)
 * matches the expected objectDef. Throws ConvexError on any failure.
 *
 * @param ctx - The Convex mutation context
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
			console.error(
				`[validateEntityExists] Record ${entityId} not found, deleted, or org mismatch (org: ${orgId})`
			);
			throw new ConvexError("Record not found or access denied");
		}
		if (record.objectDefId !== objectDef._id) {
			console.error(
				`[validateEntityExists] Record ${entityId} objectDefId ${record.objectDefId} does not match expected ${objectDef._id}`
			);
			throw new ConvexError("Record does not match expected object type");
		}
		return;
	}

	// kind === "native"
	const nativeTable = objectDef.nativeTable;
	if (!nativeTable) {
		console.error(
			`[validateEntityExists] ObjectDef "${objectDef.name}" (${objectDef._id}) has no nativeTable`
		);
		throw new ConvexError(
			`ObjectDef "${objectDef.name}" has no nativeTable configured`
		);
	}

	const entity = await getNativeEntity(
		ctx,
		nativeTable as NativeTable,
		entityId
	);
	if (!entity || entity.orgId !== orgId) {
		console.error(
			`[validateEntityExists] Native entity ${entityId} in ${nativeTable} not found or org mismatch (org: ${orgId})`
		);
		throw new ConvexError("Entity not found or access denied");
	}
}

// ── createLink ──────────────────────────────────────────────────────
export const createLink = crmMutation
	.input({
		linkTypeDefId: v.id("linkTypeDefs"),
		sourceKind: entityKindValidator,
		sourceId: v.string(),
		targetKind: entityKindValidator,
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
			console.error(
				`[createLink] linkTypeDef ${args.linkTypeDefId} not found, inactive, or org mismatch (org: ${orgId})`
			);
			throw new ConvexError("Link type not found or access denied");
		}

		// 2. Load + verify source objectDef
		const sourceObjectDef = await ctx.db.get(linkTypeDef.sourceObjectDefId);
		if (!sourceObjectDef?.isActive || sourceObjectDef.orgId !== orgId) {
			console.error(
				`[createLink] Source objectDef ${linkTypeDef.sourceObjectDefId} not found, inactive, or org mismatch`
			);
			throw new ConvexError("Source object type not found or access denied");
		}

		// 3. Load + verify target objectDef
		const targetObjectDef = await ctx.db.get(linkTypeDef.targetObjectDefId);
		if (!targetObjectDef?.isActive || targetObjectDef.orgId !== orgId) {
			console.error(
				`[createLink] Target objectDef ${linkTypeDef.targetObjectDefId} not found, inactive, or org mismatch`
			);
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

		// 6. Load existing links for source and target (used for duplicate + cardinality checks)
		const existingSourceLinks = await ctx.db
			.query("recordLinks")
			.withIndex("by_org_source", (q) =>
				q
					.eq("orgId", orgId)
					.eq("sourceKind", args.sourceKind)
					.eq("sourceId", args.sourceId)
			)
			.collect();

		const existingTargetLinks = await ctx.db
			.query("recordLinks")
			.withIndex("by_org_target", (q) =>
				q
					.eq("orgId", orgId)
					.eq("targetKind", args.targetKind)
					.eq("targetId", args.targetId)
			)
			.collect();

		// 7. Duplicate detection: check both directions
		const forwardDuplicate = existingSourceLinks.find(
			(link) =>
				link.targetId === args.targetId &&
				link.linkTypeDefId === args.linkTypeDefId &&
				!link.isDeleted
		);
		if (forwardDuplicate) {
			throw new ConvexError(
				"A link of this type already exists between these entities"
			);
		}

		const reverseDuplicate = existingTargetLinks.find(
			(link) =>
				link.sourceId === args.sourceId &&
				link.linkTypeDefId === args.linkTypeDefId &&
				!link.isDeleted
		);
		if (reverseDuplicate) {
			throw new ConvexError(
				"A link of this type already exists between these entities"
			);
		}

		// 8. Cardinality enforcement
		// Convention: one_to_many means "one source -> many targets", so each
		// target can only have one inbound link of this type (target is the "one"
		// side from the inbound perspective).
		const { cardinality } = linkTypeDef;

		if (cardinality === "one_to_one") {
			// Source must not have any active outbound link of this type
			const sourceHasLink = existingSourceLinks.some(
				(link) => link.linkTypeDefId === args.linkTypeDefId && !link.isDeleted
			);
			if (sourceHasLink) {
				throw new ConvexError(
					"Cardinality violation: source already has a link of this type (one-to-one)"
				);
			}

			// Target must not have any active inbound link of this type
			const targetHasLink = existingTargetLinks.some(
				(link) => link.linkTypeDefId === args.linkTypeDefId && !link.isDeleted
			);
			if (targetHasLink) {
				throw new ConvexError(
					"Cardinality violation: target already has a link of this type (one-to-one)"
				);
			}
		} else if (cardinality === "one_to_many") {
			// Target (the "one" side) must not already have an inbound link of this type
			const targetHasLink = existingTargetLinks.some(
				(link) => link.linkTypeDefId === args.linkTypeDefId && !link.isDeleted
			);
			if (targetHasLink) {
				throw new ConvexError(
					"Cardinality violation: target already has an inbound link of this type (one-to-many)"
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
			console.error(
				`[deleteLink] Link ${args.linkId} not found or org mismatch (org: ${orgId})`
			);
			throw new ConvexError("Link not found or access denied");
		}
		if (link.isDeleted) {
			throw new ConvexError("Link is already deleted");
		}

		await ctx.db.patch(args.linkId, { isDeleted: true });

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
