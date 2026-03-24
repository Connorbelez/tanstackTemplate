import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { AuditTrail } from "../../auditTrailClient";

const auditTrail = new AuditTrail(components.auditTrail);
const workflow = new WorkflowManager(components.workflow);

// ── T-001: Build audit args from cash ledger journal entry ──────────

export function buildCashLedgerAuditArgs(
	entry: Doc<"cash_ledger_journal_entries">,
	balanceBefore: { debit: bigint; credit: bigint },
	balanceAfter: { debit: bigint; credit: bigint }
) {
	return {
		entityId: entry._id as string,
		entityType: "cashLedgerEntry" as const,
		eventType: entry.entryType,
		actorId: entry.source.actorId ?? "system",
		beforeState: JSON.stringify({
			debitAccountBalance: balanceBefore.debit.toString(),
			creditAccountBalance: balanceBefore.credit.toString(),
		}),
		afterState: JSON.stringify({
			debitAccountBalance: balanceAfter.debit.toString(),
			creditAccountBalance: balanceAfter.credit.toString(),
			amount: entry.amount.toString(),
			debitAccountId: entry.debitAccountId,
			creditAccountId: entry.creditAccountId,
		}),
		metadata: JSON.stringify({
			effectiveDate: entry.effectiveDate,
			causedBy: entry.causedBy,
			postingGroupId: entry.postingGroupId,
			reason: entry.reason,
			channel: entry.source.channel,
			mortgageId: entry.mortgageId,
			obligationId: entry.obligationId,
		}),
		timestamp: entry.timestamp,
	};
}

// ── T-002: Internal mutation step for hash chain processing ─────────

export const processCashLedgerHashChainStep = internalMutation({
	args: {
		entryId: v.id("cash_ledger_journal_entries"),
		balanceBefore: v.object({ debit: v.string(), credit: v.string() }),
		balanceAfter: v.object({ debit: v.string(), credit: v.string() }),
	},
	handler: async (ctx, args) => {
		const entry = await ctx.db.get(args.entryId);
		if (!entry) {
			console.warn(
				`[CashLedger HashChain] Journal entry not found: ${args.entryId}`
			);
			return;
		}

		const balanceBefore = {
			debit: BigInt(args.balanceBefore.debit),
			credit: BigInt(args.balanceBefore.credit),
		};
		const balanceAfter = {
			debit: BigInt(args.balanceAfter.debit),
			credit: BigInt(args.balanceAfter.credit),
		};

		try {
			await auditTrail.insert(
				ctx,
				buildCashLedgerAuditArgs(entry, balanceBefore, balanceAfter)
			);
		} catch (error) {
			console.error(
				`[CashLedger HashChain] Failed to insert audit trail entry for journal ${args.entryId}:`,
				error
			);
			throw error;
		}
	},
});

// ── T-003: Durable workflow wrapping the mutation step ───────────────

export const cashLedgerHashChainWorkflow = workflow.define({
	args: {
		entryId: v.id("cash_ledger_journal_entries"),
		balanceBefore: v.object({ debit: v.string(), credit: v.string() }),
		balanceAfter: v.object({ debit: v.string(), credit: v.string() }),
	},
	handler: runCashLedgerHashChainStep,
});

export async function runCashLedgerHashChainStep(
	step: Pick<MutationCtx, "runMutation">,
	args: {
		entryId: Id<"cash_ledger_journal_entries">;
		balanceBefore: { debit: string; credit: string };
		balanceAfter: { debit: string; credit: string };
	}
) {
	await step.runMutation(
		internal.payments.cashLedger.hashChain.processCashLedgerHashChainStep,
		{
			entryId: args.entryId,
			balanceBefore: args.balanceBefore,
			balanceAfter: args.balanceAfter,
		}
	);
}

// ── T-004: Start hash chain with env var kill switch ─────────────────

interface StartCashLedgerHashChainArgs {
	balanceAfter: { debit: bigint; credit: bigint };
	balanceBefore: { debit: bigint; credit: bigint };
	entryId: Id<"cash_ledger_journal_entries">;
}

export async function startCashLedgerHashChain(
	ctx: Pick<MutationCtx, "runMutation" | "scheduler">,
	args: StartCashLedgerHashChainArgs
) {
	if (
		typeof process !== "undefined" &&
		process.env.DISABLE_CASH_LEDGER_HASHCHAIN === "true"
	) {
		return;
	}

	await workflow.start(
		ctx,
		internal.payments.cashLedger.hashChain.cashLedgerHashChainWorkflow,
		{
			entryId: args.entryId,
			balanceBefore: {
				debit: args.balanceBefore.debit.toString(),
				credit: args.balanceBefore.credit.toString(),
			},
			balanceAfter: {
				debit: args.balanceAfter.debit.toString(),
				credit: args.balanceAfter.credit.toString(),
			},
		},
		{
			startAsync: true,
		}
	);
}
