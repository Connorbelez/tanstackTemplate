import { v } from "convex/values";
import { query } from "../_generated/server";
import { UNITS_PER_MORTGAGE } from "./constants";
import { computeBalance } from "./internal";

export const validateSupplyInvariant = query({
	args: { mortgageId: v.string() },
	handler: async (ctx, args) => {
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
					investorId: string;
					balance: bigint;
				}>,
				total: 0n,
				error: "No TREASURY account found",
			};
		}

		const treasuryBalance = computeBalance(treasury);

		// Find all POSITION accounts for this mortgage
		const accounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		const positions = accounts
			.filter((a) => a.type === "POSITION")
			.map((a) => ({
				investorId: a.investorId ?? "",
				balance: computeBalance(a),
			}));

		const positionSum = positions.reduce((sum, p) => sum + p.balance, 0n);
		const total = treasuryBalance + positionSum;

		return {
			valid: total === UNITS_PER_MORTGAGE,
			treasuryBalance,
			positions,
			total,
		};
	},
});
