import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { adminMutation, adminQuery } from "../fluent";
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

export const runLenderIdBackfill = adminMutation
	.input({})
	.handler(async (ctx) => {
		await migrations.runOne(ctx, backfillLenderIdsReference);
	})
	.public();

export const getLenderIdBackfillStatus = adminQuery
	.input({})
	.handler(async (ctx) => {
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
	})
	.public();

const COUNTER_NAME = "ledger_sequence" as const;

/**
 * Bootstrap mutation: initializes the ledger sequence counter for production deployments.
 * Idempotent — safe to call multiple times. Uses .first() to avoid .unique() conflicts.
 */
export const bootstrapSequenceCounter = adminMutation
	.input({})
	.handler(async (ctx) => {
		const existing = await ctx.db
			.query("ledger_sequence_counters")
			.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
			.first();

		if (existing) {
			return { status: "already_initialized" as const, id: existing._id };
		}

		const id = await ctx.db.insert("ledger_sequence_counters", {
			name: COUNTER_NAME,
			value: 0n,
		});

		return { status: "initialized" as const, id };
	})
	.public();
