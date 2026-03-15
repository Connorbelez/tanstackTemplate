import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { getAccountLenderId } from "./accountOwnership";

const migrations = new Migrations<DataModel>(components.migrations);
const backfillLenderIdsReference = (
	internal as unknown as {
		ledger: { migrations: { backfillLenderIds: never } };
	}
).ledger.migrations.backfillLenderIds;

export const backfillLenderIds = migrations.define({
	table: "ledger_accounts",
	migrateOne: async (ctx, account) => {
		const lenderId = getAccountLenderId(account);
		if (!account.lenderId && lenderId) {
			await ctx.db.patch(account._id, {
				lenderId,
			});
		}
	},
});

export const runLenderIdBackfill = mutation({
	args: {},
	handler: async (ctx) => {
		await migrations.runOne(ctx, backfillLenderIdsReference);
	},
});

export const getLenderIdBackfillStatus = query({
	args: {},
	handler: async (ctx) => {
		const accounts = await ctx.db.query("ledger_accounts").collect();
		const positionAccounts = accounts.filter(
			(account) => account.type === "POSITION"
		);
		const missingLenderId = positionAccounts.filter(
			(account) => getAccountLenderId(account) == null
		);

		return {
			positionAccountCount: positionAccounts.length,
			missingLenderIdCount: missingLenderId.length,
			missingAccountIds: missingLenderId.map((account) => account._id),
		};
	},
});
