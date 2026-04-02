import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminMutation, requirePermission } from "../fluent";
import {
	type ListingCreateInput,
	listingCreateInputFields,
} from "./validators";

type ListingCreateStage = (
	ctx: Pick<MutationCtx, "db">,
	input: ListingCreateInput
) => Promise<void>;

const listingCreateStages = [
	async (_ctx, input) => {
		if (input.dataSource === "demo" && input.mortgageId !== undefined) {
			throw new ConvexError("Demo listings must not include a mortgageId");
		}

		if (
			input.dataSource === "mortgage_pipeline" &&
			input.mortgageId === undefined
		) {
			throw new ConvexError("Mortgage-backed listings require a mortgageId");
		}
	},
	async (ctx, input) => {
		if (!input.mortgageId) {
			return;
		}

		const existing = await ctx.db
			.query("listings")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", input.mortgageId))
			.unique();

		if (existing) {
			throw new ConvexError(
				`Listing already exists for mortgage ${String(input.mortgageId)}`
			);
		}
	},
] satisfies readonly ListingCreateStage[];

const createListing = adminMutation
	.use(requirePermission("listing:create"))
	.input(listingCreateInputFields)
	.handler(async (ctx, input): Promise<Id<"listings">> => {
		for (const stage of listingCreateStages) {
			await stage(ctx, input);
		}

		const now = Date.now();
		return await ctx.db.insert("listings", {
			...input,
			status: "draft",
			machineContext: undefined,
			lastTransitionAt: undefined,
			viewCount: 0,
			publishedAt: undefined,
			delistedAt: undefined,
			delistReason: undefined,
			createdAt: now,
			updatedAt: now,
		});
	});

export const create = createListing.public();
