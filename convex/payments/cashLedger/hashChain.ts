import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { AuditTrail } from "../../auditTrailClient";
import type { BalancePair, SerializedBalancePair } from "./types";

const auditTrail = new AuditTrail(components.auditTrail);
const workflow = new WorkflowManager(components.workflow);

// ── T-001: Build audit args from cash ledger journal entry ──────────

export interface CashLedgerAuditArgs {
	actorId: string;
	afterState: string;
	beforeState: string;
	entityId: string;
	entityType: "cashLedgerEntry";
	eventType: string;
	metadata: string;
	timestamp: number;
}

export function buildCashLedgerAuditArgs(
	entry: Doc<"cash_ledger_journal_entries">,
	balanceBefore: BalancePair,
	balanceAfter: BalancePair
): CashLedgerAuditArgs {
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
			actorType: entry.source.actorType,
			mortgageId: entry.mortgageId,
			obligationId: entry.obligationId,
			entryMetadata: entry.metadata ?? null,
		}),
		timestamp: entry.timestamp,
	};
}

// ── T-002: Internal mutation step for hash chain processing ─────────
// Handler logic extracted for testability (DI pattern).

export async function processHashChainStepHandler(
	ctx: MutationCtx,
	args: {
		entryId: Id<"cash_ledger_journal_entries">;
		balanceBefore: SerializedBalancePair;
		balanceAfter: SerializedBalancePair;
	}
) {
	const entry = await ctx.db.get(args.entryId);
	if (!entry) {
		// C2: Missing entry = data integrity violation or transient read.
		// Throw so the durable workflow retries instead of silently creating a hash chain gap.
		throw new Error(
			`[CashLedger HashChain] Journal entry not found: ${args.entryId}. ` +
				"This indicates a data integrity violation (append-only entry missing) " +
				"or a transient read inconsistency. The workflow will retry."
		);
	}

	const balanceBefore: BalancePair = {
		debit: BigInt(args.balanceBefore.debit),
		credit: BigInt(args.balanceBefore.credit),
	};
	const balanceAfter: BalancePair = {
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
}

export const processCashLedgerHashChainStep = internalMutation({
	args: {
		entryId: v.id("cash_ledger_journal_entries"),
		balanceBefore: v.object({ debit: v.string(), credit: v.string() }),
		balanceAfter: v.object({ debit: v.string(), credit: v.string() }),
	},
	handler: processHashChainStepHandler,
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
		balanceBefore: SerializedBalancePair;
		balanceAfter: SerializedBalancePair;
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

export interface StartCashLedgerHashChainArgs {
	balanceAfter: BalancePair;
	balanceBefore: BalancePair;
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
		// I1: Log when kill switch is active — silent disabling of a compliance
		// feature is a regulatory risk.
		console.warn(
			"[CashLedger HashChain] KILL SWITCH ACTIVE: Hash chain audit trail disabled " +
				`for entry ${args.entryId}. No audit record will be created. ` +
				"Set DISABLE_CASH_LEDGER_HASHCHAIN=false to re-enable."
		);
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
