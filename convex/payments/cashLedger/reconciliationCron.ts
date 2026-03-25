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
		checkSummaries: Array<{
			count: number;
			isHealthy: boolean;
			name: string;
			sampleIds: string[];
			totalAmountCents: number;
		}>;
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
		checkSummaries: v.array(
			v.object({
				count: v.number(),
				isHealthy: v.boolean(),
				name: v.string(),
				sampleIds: v.array(v.string()),
				totalAmountCents: v.number(),
			})
		),
		totalGapCount: v.number(),
		unhealthyCheckNames: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const isHealthy = args.totalGapCount === 0;
		await auditLog.log(ctx, {
			action: isHealthy
				? "cash_ledger_reconciliation.healthy"
				: "cash_ledger_reconciliation.gaps_found",
			actorId: "system",
			resourceType: "reconciliation",
			resourceId: "cash-ledger-daily",
			severity: isHealthy ? "info" : "error",
			metadata: {
				checkedAt: args.checkedAt,
				checkSummaries: args.checkSummaries,
				totalGapCount: args.totalGapCount,
				unhealthyCheckNames: args.unhealthyCheckNames,
			},
		});
	},
});

// ── Internal Action: cron entry point ────────────────────────

export const cashLedgerReconciliation = internalAction({
	handler: async (ctx) => {
		let result: FullReconciliationResult;
		try {
			result = await ctx.runQuery(reconcileCashLedgerInternalRef, {});
		} catch (error) {
			console.error(
				"[CASH LEDGER RECONCILIATION FATAL] Suite query failed entirely:",
				error instanceof Error ? error.message : String(error)
			);
			return null;
		}

		if (result.isHealthy) {
			console.info("[CASH LEDGER RECONCILIATION] Daily check passed.");
			await ctx.runMutation(logCashLedgerReconciliationAlertsRef, {
				checkedAt: result.checkedAt,
				unhealthyCheckNames: [],
				totalGapCount: 0,
				checkSummaries: [],
			});
		} else {
			console.error(
				`[CASH LEDGER RECONCILIATION P0] ${result.totalGapCount} gaps in: ${result.unhealthyCheckNames.join(", ")}`
			);

			const allChecks = [
				...result.checkResults,
				...result.conservationResults,
				...result.transferResults,
			];
			const checkSummaries = allChecks.map((cr) => {
				// Extract up to 3 sample IDs from items for investigability
				const sampleIds = (cr.items as Record<string, unknown>[])
					.slice(0, 3)
					.map((item) => {
						const id =
							item.accountId ??
							item.obligationId ??
							item.attemptId ??
							item.postingGroupId ??
							item.transferRequestId ??
							item.journalEntryId ??
							item.dispersalEntryId ??
							item.mortgageId;
						return String(id ?? "unknown");
					});
				return {
					name: cr.checkName,
					count: cr.count,
					isHealthy: cr.isHealthy,
					totalAmountCents: cr.totalAmountCents,
					sampleIds,
				};
			});

			await ctx.runMutation(logCashLedgerReconciliationAlertsRef, {
				checkedAt: result.checkedAt,
				unhealthyCheckNames: result.unhealthyCheckNames,
				totalGapCount: result.totalGapCount,
				checkSummaries,
			});
		}

		return result;
	},
});
