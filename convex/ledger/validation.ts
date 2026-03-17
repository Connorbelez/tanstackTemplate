import { v } from "convex/values";
import { ledgerQuery } from "../fluent";
import { getAccountLenderId } from "./accountOwnership";
import { getPostedBalance } from "./accounts";
import { TOTAL_SUPPLY } from "./constants";

export const validateSupplyInvariant = ledgerQuery
	.input({ mortgageId: v.string() })
	.handler(async (ctx, args) => {
		// Find TREASURY
		const treasury = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_type_and_mortgage", (q) =>
				q.eq("type", "TREASURY").eq("mortgageId", args.mortgageId)
			)
			.first();

		if (!treasury) {
			return {
				valid: false as const,
				treasuryBalance: 0n,
				positions: [] as Array<{
					lenderId: string;
					balance: bigint;
				}>,
				total: 0n,
				error: "No TREASURY account found",
			};
		}

		const treasuryBalance = getPostedBalance(treasury);

		// Find all POSITION accounts for this mortgage
		const accounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		const positions = accounts
			.filter((a) => a.type === "POSITION")
			.map((a) => {
				const lenderId = getAccountLenderId(a);
				if (!lenderId) {
					throw new Error(
						`POSITION account ${a._id} is missing lenderId for mortgage ${args.mortgageId}`
					);
				}
				return {
					lenderId,
					balance: getPostedBalance(a),
				};
			});

		const positionSum = positions.reduce((sum, p) => sum + p.balance, 0n);
		const total = treasuryBalance + positionSum;
		const isBurned = treasuryBalance === 0n && positionSum === 0n;

		return {
			valid: total === TOTAL_SUPPLY || isBurned,
			treasuryBalance,
			positions,
			total,
		};
	})
	.public();
