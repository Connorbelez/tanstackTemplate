import type { FunctionReference, FunctionType } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "../../_generated/server";
import { auditLog } from "../../auditLog";
import type { FullReconciliationResult } from "./reconciliationSuite";
import { runFullReconciliationSuite } from "./reconciliationSuite";

// ── Internal Function References ─────────────────────────────

function makeInternalRef<
	Type extends FunctionType,
	Args extends Record<string, unknown>,
	ReturnType,
>(name: string) {
	return makeFunctionReference<Type, Args, ReturnType>(
		name
	) as unknown as FunctionReference<Type, "internal", Args, ReturnType>;
}

const reconcileCashLedgerInternalRef = makeInternalRef<
	"query",
	Record<string, never>,
	FullReconciliationResult
>("payments/cashLedger/reconciliationCron:reconcileCashLedgerInternal");

const logCashLedgerReconciliationAlertsRef = makeInternalRef<
	"mutation",
	{
		checkedAt: number;
		totalGapCount: number;
		unhealthyCheckNames: string[];
	},
	null
>("payments/cashLedger/reconciliationCron:logCashLedgerReconciliationAlerts");

// ── Internal Query: run the full reconciliation suite ────────

export const reconcileCashLedgerInternal = internalQuery({
	handler: async (ctx) => {
		return runFullReconciliationSuite(ctx);
	},
});

// ── Internal Mutation: log unhealthy results via audit log ───

export const logCashLedgerReconciliationAlerts = internalMutation({
	args: {
		checkedAt: v.number(),
		totalGapCount: v.number(),
		unhealthyCheckNames: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		await auditLog.log(ctx, {
			action: "cash_ledger_reconciliation.gaps_found",
			actorId: "system",
			resourceType: "reconciliation",
			resourceId: "cash-ledger-daily",
			severity: "error",
			metadata: {
				checkedAt: args.checkedAt,
				totalGapCount: args.totalGapCount,
				unhealthyCheckNames: args.unhealthyCheckNames,
			},
		});
	},
});

// ── Internal Action: cron entry point ────────────────────────

export const cashLedgerReconciliation = internalAction({
	handler: async (ctx) => {
		const result = await ctx.runQuery(reconcileCashLedgerInternalRef, {});

		if (result.isHealthy) {
			console.info("[CASH LEDGER RECONCILIATION] Daily check passed.");
		} else {
			console.error(
				`[CASH LEDGER RECONCILIATION P0] ${result.totalGapCount} gaps in: ${result.unhealthyCheckNames.join(", ")}`
			);

			await ctx.runMutation(logCashLedgerReconciliationAlertsRef, {
				checkedAt: result.checkedAt,
				unhealthyCheckNames: result.unhealthyCheckNames,
				totalGapCount: result.totalGapCount,
			});
		}

		return result;
	},
});
