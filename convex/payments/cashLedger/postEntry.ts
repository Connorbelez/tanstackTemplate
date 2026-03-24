import { ConvexError } from "convex/values";
import { components } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { AuditTrail } from "../../auditTrailClient";
import type { CommandSource } from "../../engine/types";
import {
	assertNonNegativeBalance,
	getCashAccountBalance,
	projectCashAccountBalance,
} from "./accounts";
import { startCashLedgerHashChain } from "./hashChain";
import { getNextCashSequenceNumber } from "./sequenceCounter";
import {
	CASH_ENTRY_TYPE_FAMILY_MAP,
	type CashEntryType,
	IDEMPOTENCY_KEY_PREFIX,
	NEGATIVE_BALANCE_EXEMPT_FAMILIES,
} from "./types";
import { postCashEntryArgsValidator } from "./validators";

const auditTrail = new AuditTrail(components.auditTrail);

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PostCashEntryInput {
	amount: number;
	attemptId?: Id<"collectionAttempts">;
	borrowerId?: Id<"borrowers">;
	causedBy?: Id<"cash_ledger_journal_entries">;
	creditAccountId: Id<"cash_ledger_accounts">;
	dealId?: Id<"deals">;
	debitAccountId: Id<"cash_ledger_accounts">;
	dispersalEntryId?: Id<"dispersalEntries">;
	effectiveDate: string;
	entryType: CashEntryType;
	idempotencyKey: string;
	lenderId?: Id<"lenders">;
	metadata?: Record<string, unknown>;
	mortgageId?: Id<"mortgages">;
	obligationId?: Id<"obligations">;
	postingGroupId?: string;
	reason?: string;
	source: CommandSource;
	transferRequestId?: Id<"transferRequests">;
}

function validateInput(args: PostCashEntryInput) {
	if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
		throw new ConvexError("Cash ledger amount must be a positive safe integer");
	}
	if (args.debitAccountId === args.creditAccountId) {
		throw new ConvexError("Debit and credit accounts must be different");
	}
	if (!BUSINESS_DATE_PATTERN.test(args.effectiveDate)) {
		throw new ConvexError("effectiveDate must be YYYY-MM-DD");
	}
}

async function checkIdempotency(ctx: MutationCtx, idempotencyKey: string) {
	return ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
		.first();
}

async function resolveAccounts(
	ctx: MutationCtx,
	args: Pick<PostCashEntryInput, "debitAccountId" | "creditAccountId">
) {
	const [debitAccount, creditAccount] = await Promise.all([
		ctx.db.get(args.debitAccountId),
		ctx.db.get(args.creditAccountId),
	]);

	if (!debitAccount) {
		throw new ConvexError(`Debit account not found: ${args.debitAccountId}`);
	}
	if (!creditAccount) {
		throw new ConvexError(`Credit account not found: ${args.creditAccountId}`);
	}

	return { debitAccount, creditAccount };
}

function familyCheck(
	args: PostCashEntryInput,
	debitAccount: Doc<"cash_ledger_accounts">,
	creditAccount: Doc<"cash_ledger_accounts">
) {
	const constraint = CASH_ENTRY_TYPE_FAMILY_MAP[args.entryType];
	if (!constraint.debit.includes(debitAccount.family)) {
		throw new ConvexError(
			`${args.entryType} cannot debit family ${debitAccount.family}`
		);
	}
	if (!constraint.credit.includes(creditAccount.family)) {
		throw new ConvexError(
			`${args.entryType} cannot credit family ${creditAccount.family}`
		);
	}
}

function balanceCheck(
	args: PostCashEntryInput,
	debitAccount: Doc<"cash_ledger_accounts">,
	creditAccount: Doc<"cash_ledger_accounts">
) {
	if (
		args.entryType === "REVERSAL" ||
		args.entryType === "CORRECTION" ||
		args.entryType === "SUSPENSE_ESCALATED" ||
		args.entryType === "SUSPENSE_ROUTED"
	) {
		return;
	}

	const amount = BigInt(args.amount);

	if (!NEGATIVE_BALANCE_EXEMPT_FAMILIES.has(debitAccount.family)) {
		assertNonNegativeBalance(
			debitAccount,
			"debit",
			amount,
			`cash ledger ${args.entryType}`
		);
	}

	if (!NEGATIVE_BALANCE_EXEMPT_FAMILIES.has(creditAccount.family)) {
		assertNonNegativeBalance(
			creditAccount,
			"credit",
			amount,
			`cash ledger ${args.entryType}`
		);
	}
}

function constraintCheck(args: PostCashEntryInput) {
	if (args.entryType === "REVERSAL" && !args.causedBy) {
		throw new ConvexError("REVERSAL entries must reference causedBy");
	}
	if (args.entryType === "CORRECTION") {
		if (args.source.actorType !== "admin") {
			throw new ConvexError("CORRECTION entries require admin actorType");
		}
		if (!args.source.actorId) {
			throw new ConvexError("CORRECTION entries require source.actorId");
		}
		if (!args.causedBy) {
			throw new ConvexError(
				"CORRECTION entries must reference causedBy (REQ-242: append-only with back-references)"
			);
		}
		if (!args.reason) {
			throw new ConvexError("CORRECTION entries require a reason");
		}
	}
}

// Step 9: NUDGE — trigger Layer 2 hash-chain audit + notify cursor consumers.
async function nudge(
	ctx: MutationCtx,
	args: {
		entry: Doc<"cash_ledger_journal_entries">;
		debitBalanceBefore: bigint;
		creditBalanceBefore: bigint;
		projectedDebitBalance: bigint;
		projectedCreditBalance: bigint;
	}
): Promise<void> {
	await startCashLedgerHashChain(ctx, {
		entryId: args.entry._id,
		balanceBefore: {
			debit: args.debitBalanceBefore,
			credit: args.creditBalanceBefore,
		},
		balanceAfter: {
			debit: args.projectedDebitBalance,
			credit: args.projectedCreditBalance,
		},
	});
}

async function persistEntry(
	ctx: MutationCtx,
	args: PostCashEntryInput,
	debitAccount: Doc<"cash_ledger_accounts">,
	creditAccount: Doc<"cash_ledger_accounts">
) {
	const amount = BigInt(args.amount);
	const sequenceNumber = await getNextCashSequenceNumber(ctx);
	const timestamp = Date.now();

	// T-006: Capture balances BEFORE the update for audit trail
	const debitBalanceBefore = getCashAccountBalance(debitAccount);
	const creditBalanceBefore = getCashAccountBalance(creditAccount);

	await Promise.all([
		ctx.db.patch(debitAccount._id, {
			cumulativeDebits: debitAccount.cumulativeDebits + amount,
		}),
		ctx.db.patch(creditAccount._id, {
			cumulativeCredits: creditAccount.cumulativeCredits + amount,
		}),
	]);

	const entryId = await ctx.db.insert("cash_ledger_journal_entries", {
		sequenceNumber,
		entryType: args.entryType,
		mortgageId: args.mortgageId,
		obligationId: args.obligationId,
		dealId: args.dealId,
		attemptId: args.attemptId,
		dispersalEntryId: args.dispersalEntryId,
		transferRequestId: args.transferRequestId,
		lenderId: args.lenderId,
		borrowerId: args.borrowerId,
		effectiveDate: args.effectiveDate,
		timestamp,
		debitAccountId: args.debitAccountId,
		creditAccountId: args.creditAccountId,
		amount,
		idempotencyKey: args.idempotencyKey,
		postingGroupId: args.postingGroupId,
		causedBy: args.causedBy,
		source: args.source,
		reason: args.reason,
		metadata: args.metadata,
	});

	const entry = await ctx.db.get(entryId);
	if (!entry) {
		throw new Error("Failed to create cash ledger journal entry");
	}

	const projectedDebit = projectCashAccountBalance(
		debitAccount,
		"debit",
		amount
	);
	const projectedCredit = projectCashAccountBalance(
		creditAccount,
		"credit",
		amount
	);

	return {
		entry,
		debitBalanceBefore,
		creditBalanceBefore,
		projectedDebitBalance: projectedDebit,
		projectedCreditBalance: projectedCredit,
	};
}

export async function postCashEntryInternal(
	ctx: MutationCtx,
	args: PostCashEntryInput
) {
	// 1. VALIDATE_INPUT
	validateInput(args);
	// 1b. IDEMPOTENCY KEY PREFIX CHECK (warn-only, never reject)
	if (!args.idempotencyKey.startsWith(IDEMPOTENCY_KEY_PREFIX)) {
		console.warn(
			`[postCashEntryInternal] idempotencyKey "${args.idempotencyKey}" does not start with "${IDEMPOTENCY_KEY_PREFIX}". Consider using buildIdempotencyKey().`
		);
	}
	// 2. IDEMPOTENCY
	const existing = await checkIdempotency(ctx, args.idempotencyKey);
	if (existing) {
		return {
			entry: existing,
			projectedDebitBalance: 0n,
			projectedCreditBalance: 0n,
		};
	}

	// 3–8. RESOLVE, VALIDATE, PERSIST (wrapped for rejection auditing)
	try {
		// 3. RESOLVE_ACCOUNTS
		const { debitAccount, creditAccount } = await resolveAccounts(ctx, args);
		// 4. FAMILY_CHECK
		familyCheck(args, debitAccount, creditAccount);
		// 5. BALANCE_CHECK
		balanceCheck(args, debitAccount, creditAccount);
		// 6. CONSTRAINT_CHECK
		constraintCheck(args);
		// 7+8. SEQUENCE + PERSIST
		const result = await persistEntry(ctx, args, debitAccount, creditAccount);
		// 9. NUDGE — trigger Layer 2 hash-chain audit
		await nudge(ctx, {
			entry: result.entry,
			debitBalanceBefore: result.debitBalanceBefore,
			creditBalanceBefore: result.creditBalanceBefore,
			projectedDebitBalance: result.projectedDebitBalance,
			projectedCreditBalance: result.projectedCreditBalance,
		});

		return result;
	} catch (error) {
		// T-007: Rejection auditing — insert audit record for failed postings
		try {
			let rejectionReason = "Unknown error";
			if (error instanceof ConvexError) {
				rejectionReason = String(error.data);
			} else if (error instanceof Error) {
				rejectionReason = error.message;
			}

			await auditTrail.insert(ctx, {
				entityId: `rejected:${args.idempotencyKey}`,
				entityType: "cashLedgerEntry",
				eventType: `${args.entryType}:REJECTED`,
				actorId: args.source.actorId ?? "system",
				afterState: JSON.stringify({
					entryType: args.entryType,
					amount: args.amount,
					rejectionReason,
				}),
				metadata: JSON.stringify({
					effectiveDate: args.effectiveDate,
					channel: args.source.channel,
				}),
				timestamp: Date.now(),
			});
		} catch (auditError) {
			console.warn(
				"[CashLedger] Failed to insert rejection audit record:",
				auditError
			);
		}

		throw error;
	}
}

export const postCashEntry = internalMutation({
	args: postCashEntryArgsValidator,
	handler: async (ctx, args) => {
		return postCashEntryInternal(ctx, args);
	},
});
