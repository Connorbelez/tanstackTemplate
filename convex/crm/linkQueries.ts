import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { crmQuery } from "../fluent";
import type { LinkedRecord } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolves a batch of recordLink docs into LinkedRecord[], picking the
 * peer side based on direction.
 */
async function resolveLinkedRecords(
	ctx: QueryCtx,
	links: Doc<"recordLinks">[],
	direction: "outbound" | "inbound"
): Promise<LinkedRecord[]> {
	return Promise.all(
		links.map(async (link) => {
			const peerRecordId =
				direction === "outbound" ? link.targetId : link.sourceId;
			const peerKind =
				direction === "outbound" ? link.targetKind : link.sourceKind;
			const peerObjectDefId =
				direction === "outbound"
					? link.targetObjectDefId
					: link.sourceObjectDefId;

			let labelValue: string | undefined;
			if (peerKind === "record") {
				const peerRecord = await ctx.db.get(peerRecordId as Id<"records">);
				labelValue = peerRecord?.labelValue ?? undefined;
			}

			return {
				linkId: link._id as string,
				linkTypeDefId: link.linkTypeDefId,
				recordId: peerRecordId,
				recordKind: peerKind,
				objectDefId: peerObjectDefId,
				labelValue,
			};
		})
	);
}

// ── Grouped link result shape ────────────────────────────────────────

interface LinkGroup {
	direction: "outbound" | "inbound";
	links: LinkedRecord[];
	linkTypeDefId: Id<"linkTypeDefs">;
	linkTypeName: string;
}

// ── getLinkedRecords ─────────────────────────────────────────────────
// Returns linked records for a given entity, grouped by linkTypeDef.
export const getLinkedRecords = crmQuery
	.input({
		recordId: v.string(),
		recordKind: v.union(v.literal("record"), v.literal("native")),
		direction: v.optional(
			v.union(v.literal("outbound"), v.literal("inbound"), v.literal("both"))
		),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		const direction = args.direction ?? "both";
		const includeOutbound = direction === "outbound" || direction === "both";
		const includeInbound = direction === "inbound" || direction === "both";

		// Query outbound links (this entity is source)
		const outboundLinks = includeOutbound
			? await ctx.db
					.query("recordLinks")
					.withIndex("by_org_source", (q) =>
						q
							.eq("orgId", orgId)
							.eq("sourceKind", args.recordKind)
							.eq("sourceId", args.recordId)
					)
					.filter((q) => q.eq(q.field("isDeleted"), false))
					.collect()
			: [];

		// Query inbound links (this entity is target)
		const inboundLinks = includeInbound
			? await ctx.db
					.query("recordLinks")
					.withIndex("by_org_target", (q) =>
						q
							.eq("orgId", orgId)
							.eq("targetKind", args.recordKind)
							.eq("targetId", args.recordId)
					)
					.filter((q) => q.eq(q.field("isDeleted"), false))
					.collect()
			: [];

		// Group outbound links by linkTypeDefId
		const outboundByType = new Map<string, Doc<"recordLinks">[]>();
		for (const link of outboundLinks) {
			const key = link.linkTypeDefId as string;
			const group = outboundByType.get(key);
			if (group) {
				group.push(link);
			} else {
				outboundByType.set(key, [link]);
			}
		}

		// Group inbound links by linkTypeDefId
		const inboundByType = new Map<string, Doc<"recordLinks">[]>();
		for (const link of inboundLinks) {
			const key = link.linkTypeDefId as string;
			const group = inboundByType.get(key);
			if (group) {
				group.push(link);
			} else {
				inboundByType.set(key, [link]);
			}
		}

		// Collect all unique linkTypeDefIds we need to load
		const allTypeIds = new Set<string>([
			...outboundByType.keys(),
			...inboundByType.keys(),
		]);

		// Load linkTypeDefs in parallel
		const linkTypeDefsById = new Map<string, Doc<"linkTypeDefs">>();
		await Promise.all(
			[...allTypeIds].map(async (id) => {
				const def = await ctx.db.get(id as Id<"linkTypeDefs">);
				if (def) {
					linkTypeDefsById.set(id, def);
				}
			})
		);

		// Build result groups
		const groups: LinkGroup[] = [];

		// Outbound groups
		for (const [typeId, links] of outboundByType) {
			const def = linkTypeDefsById.get(typeId);
			if (!def) {
				continue;
			}
			const resolved = await resolveLinkedRecords(ctx, links, "outbound");
			groups.push({
				linkTypeName: def.name,
				linkTypeDefId: def._id,
				direction: "outbound",
				links: resolved,
			});
		}

		// Inbound groups
		for (const [typeId, links] of inboundByType) {
			const def = linkTypeDefsById.get(typeId);
			if (!def) {
				continue;
			}
			const resolved = await resolveLinkedRecords(ctx, links, "inbound");
			groups.push({
				linkTypeName: def.name,
				linkTypeDefId: def._id,
				direction: "inbound",
				links: resolved,
			});
		}

		return groups;
	})
	.public();

// ── getLinkTypesForObject ────────────────────────────────────────────
// Returns all active linkTypeDefs where the given objectDef participates
// as either source or target.
export const getLinkTypesForObject = crmQuery
	.input({ objectDefId: v.id("objectDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// Verify objectDef exists and belongs to caller's org
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Object not found or access denied");
		}

		// Query where this object is source
		const asSource = await ctx.db
			.query("linkTypeDefs")
			.withIndex("by_source_object", (q) =>
				q.eq("sourceObjectDefId", args.objectDefId)
			)
			.collect();

		// Query where this object is target
		const asTarget = await ctx.db
			.query("linkTypeDefs")
			.withIndex("by_target_object", (q) =>
				q.eq("targetObjectDefId", args.objectDefId)
			)
			.collect();

		// Combine, deduplicate by _id, filter active + org-scoped
		const seen = new Set<string>();
		const combined: Doc<"linkTypeDefs">[] = [];

		for (const def of [...asSource, ...asTarget]) {
			const id = def._id as string;
			if (seen.has(id)) {
				continue;
			}
			seen.add(id);
			if (def.isActive && def.orgId === orgId) {
				combined.push(def);
			}
		}

		return combined;
	})
	.public();
