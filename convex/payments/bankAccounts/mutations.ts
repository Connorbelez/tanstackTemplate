// convex/payments/bankAccounts/mutations.ts
import { ConvexError, v } from "convex/values";
import { adminMutation } from "../../fluent";
import { validateAccountFormat } from "./validation";

/**
 * Admin seed mutation — creates a bank account record for Phase 1 seeding.
 */
export const seedBankAccount = adminMutation
	.input({
		ownerType: v.union(
			v.literal("borrower"),
			v.literal("lender"),
			v.literal("investor"),
			v.literal("trust")
		),
		ownerId: v.string(),
		institutionNumber: v.optional(v.string()),
		transitNumber: v.optional(v.string()),
		accountNumber: v.optional(v.string()),
		accountLast4: v.optional(v.string()),
		status: v.union(
			v.literal("pending_validation"),
			v.literal("validated"),
			v.literal("revoked"),
			v.literal("rejected")
		),
		mandateStatus: v.union(
			v.literal("not_required"),
			v.literal("pending"),
			v.literal("active"),
			v.literal("revoked")
		),
		validationMethod: v.optional(
			v.union(
				v.literal("manual"),
				v.literal("micro_deposit"),
				v.literal("provider_verified")
			)
		),
		isDefaultInbound: v.optional(v.boolean()),
		isDefaultOutbound: v.optional(v.boolean()),
		metadata: v.optional(v.record(v.string(), v.any())),
	})
	.handler(async (ctx, args) => {
		// Validate format using shared logic (single source of truth)
		const formatResult = validateAccountFormat(
			args.institutionNumber,
			args.transitNumber
		);
		if (!formatResult.valid) {
			throw new ConvexError(formatResult.errorMessage);
		}

		const now = Date.now();
		return ctx.db.insert("bankAccounts", {
			ownerType: args.ownerType,
			ownerId: args.ownerId,
			institutionNumber: args.institutionNumber,
			transitNumber: args.transitNumber,
			accountNumber: args.accountNumber,
			accountLast4: args.accountLast4,
			country: "CA",
			currency: "CAD",
			status: args.status,
			mandateStatus: args.mandateStatus,
			validationMethod: args.validationMethod,
			isDefaultInbound: args.isDefaultInbound,
			isDefaultOutbound: args.isDefaultOutbound,
			createdAt: now,
			metadata: args.metadata,
		});
	});
