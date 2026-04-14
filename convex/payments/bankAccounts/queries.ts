/**
 * Bank account domain queries — read operations for bank accounts.
 *
 * All public queries are gated behind `paymentQuery` which enforces
 * `payment:view` permission via fluent middleware (ENG-205).
 */

import { ConvexError, v } from "convex/values";
import { canAccessCounterpartyResource } from "../../auth/resourceChecks";
import { paymentQuery } from "../../fluent";
import { counterpartyTypeValidator } from "../transfers/validators";

async function assertCounterpartyAccess(
	ctx: Parameters<typeof canAccessCounterpartyResource>[0] & {
		viewer: Parameters<typeof canAccessCounterpartyResource>[1];
	},
	args: {
		ownerId: string;
		ownerType: Parameters<typeof canAccessCounterpartyResource>[2];
	}
) {
	const allowed = await canAccessCounterpartyResource(
		ctx,
		ctx.viewer,
		args.ownerType,
		args.ownerId
	);
	if (!allowed) {
		throw new ConvexError(
			`Forbidden: no ${args.ownerType} access for ${args.ownerId}`
		);
	}
}

// ── listBankAccountsByOwner ─────────────────────────────────────────
/** Lists all bank accounts for a given owner (counterparty). */
export const listBankAccountsByOwner = paymentQuery
	.input({
		ownerType: counterpartyTypeValidator,
		ownerId: v.string(),
	})
	.handler(async (ctx, args) => {
		await assertCounterpartyAccess(ctx, args);
		const accounts = await ctx.db
			.query("bankAccounts")
			.withIndex("by_owner", (q) =>
				q.eq("ownerType", args.ownerType).eq("ownerId", args.ownerId)
			)
			.collect();

		// Redact sensitive fields — never expose full accountNumber
		return accounts.map(
			({
				_id,
				_creationTime,
				ownerType,
				ownerId,
				accountLast4,
				institutionNumber,
				transitNumber,
				country,
				currency,
				status,
				mandateStatus,
				validationMethod,
				isDefaultInbound,
				isDefaultOutbound,
				createdAt,
				updatedAt,
			}) => ({
				_id,
				_creationTime,
				ownerType,
				ownerId,
				accountLast4,
				institutionNumber,
				transitNumber,
				country,
				currency,
				status,
				mandateStatus,
				validationMethod,
				isDefaultInbound,
				isDefaultOutbound,
				createdAt,
				updatedAt,
			})
		);
	})
	.public();
