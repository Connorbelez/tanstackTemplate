/**
 * Bank account domain queries — read operations for bank accounts.
 *
 * All public queries are gated behind `paymentQuery` which enforces
 * `payment:view` permission via fluent middleware (ENG-205).
 */

import { v } from "convex/values";
import { paymentQuery } from "../../fluent";
import { counterpartyTypeValidator } from "../transfers/validators";

// ── listBankAccountsByOwner ─────────────────────────────────────────
/** Lists all bank accounts for a given owner (counterparty). */
export const listBankAccountsByOwner = paymentQuery
	.input({
		ownerType: counterpartyTypeValidator,
		ownerId: v.string(),
	})
	.handler(async (ctx, args) => {
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
