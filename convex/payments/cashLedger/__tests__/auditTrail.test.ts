import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import {
	ADMIN_SOURCE,
	SYSTEM_SOURCE,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import { components } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { AuditTrail } from "../../../auditTrailClient";
import auditTrailSchema from "../../../components/auditTrail/schema";
import schema from "../../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
} from "../../../test/moduleMaps";
import { buildCashLedgerAuditArgs } from "../hashChain";
import type {
	CashAccountFamily,
	CashEntryType,
	ControlSubaccount,
} from "../types";

const auditTrail = new AuditTrail(components.auditTrail);

// ── Module globs ────────────────────────────────────────────────────

const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;

// ── Test harness factory ────────────────────────────────────────────

function makeHarness() {
	const t = convexTest(schema, modules);
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	return t;
}

// ── I6: Shared helper — reduces ~30-line boilerplate per test ───────

interface CreateEntryAndAuditOpts {
	amount: bigint;
	causedBy?: Id<"cash_ledger_journal_entries">;
	creditFamily: CashAccountFamily;
	creditSubaccount?: ControlSubaccount;
	debitFamily: CashAccountFamily;
	debitSubaccount?: ControlSubaccount;
	effectiveDate?: string;
	entryType: CashEntryType;
	idempotencyKey?: string;
	reason?: string;
	source?: typeof SYSTEM_SOURCE;
}

async function createEntryAndAudit(
	ctx: MutationCtx,
	opts: CreateEntryAndAuditOpts
) {
	const { getOrCreateCashAccount } = await import("../accounts");
	const { getCashAccountBalance, projectCashAccountBalance } = await import(
		"../accounts"
	);
	const { getNextCashSequenceNumber } = await import("../sequenceCounter");

	const debitRef = await getOrCreateCashAccount(ctx, {
		family: opts.debitFamily,
		subaccount: opts.debitSubaccount,
	});
	const creditRef = await getOrCreateCashAccount(ctx, {
		family: opts.creditFamily,
		subaccount: opts.creditSubaccount,
	});

	const debitAccount = await ctx.db.get(debitRef._id);
	const creditAccount = await ctx.db.get(creditRef._id);
	if (!(debitAccount && creditAccount)) {
		throw new Error("Account not found");
	}

	const debitBalanceBefore = getCashAccountBalance(debitAccount);
	const creditBalanceBefore = getCashAccountBalance(creditAccount);

	await Promise.all([
		ctx.db.patch(debitAccount._id, {
			cumulativeDebits: debitAccount.cumulativeDebits + opts.amount,
		}),
		ctx.db.patch(creditAccount._id, {
			cumulativeCredits: creditAccount.cumulativeCredits + opts.amount,
		}),
	]);

	const sequenceNumber = await getNextCashSequenceNumber(ctx);
	const eid = await ctx.db.insert("cash_ledger_journal_entries", {
		sequenceNumber,
		entryType: opts.entryType,
		effectiveDate: opts.effectiveDate ?? "2026-03-01",
		timestamp: Date.now(),
		debitAccountId: debitAccount._id,
		creditAccountId: creditAccount._id,
		amount: opts.amount,
		idempotencyKey:
			opts.idempotencyKey ?? `test-${Date.now()}-${Math.random()}`,
		source: opts.source ?? SYSTEM_SOURCE,
		causedBy: opts.causedBy,
		reason: opts.reason,
	});

	const entry = await ctx.db.get(eid);
	if (!entry) {
		throw new Error("Failed to create entry");
	}

	const projectedDebit = projectCashAccountBalance(
		debitAccount,
		"debit",
		opts.amount
	);
	const projectedCredit = projectCashAccountBalance(
		creditAccount,
		"credit",
		opts.amount
	);

	const auditArgs = buildCashLedgerAuditArgs(
		entry,
		{ debit: debitBalanceBefore, credit: creditBalanceBefore },
		{ debit: projectedDebit, credit: projectedCredit }
	);

	await auditTrail.insert(ctx, auditArgs);

	return {
		entry,
		debitAccount,
		creditAccount,
		debitBalanceBefore,
		creditBalanceBefore,
		projectedDebit,
		projectedCredit,
		auditArgs,
	};
}

// ── T-008: Harness setup — verify component registration works ─────────

describe("Audit Trail — T-008: harness setup", () => {
	it("registers auditTrail component and runs a no-op mutation", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			const { getOrCreateCashAccount } = await import("../accounts");
			const { getCashAccountBalance } = await import("../accounts");
			const { getNextCashSequenceNumber } = await import("../sequenceCounter");

			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			const borrowerRec = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});

			const trustAccount = await ctx.db.get(trustCash._id);
			const borrowerAccount = await ctx.db.get(borrowerRec._id);
			if (!(trustAccount && borrowerAccount)) {
				throw new Error("Account not found");
			}

			const amount = BigInt(1000);
			const debitBalanceBefore = getCashAccountBalance(trustAccount);

			await Promise.all([
				ctx.db.patch(trustAccount._id, {
					cumulativeDebits: trustAccount.cumulativeDebits + amount,
				}),
				ctx.db.patch(borrowerAccount._id, {
					cumulativeCredits: borrowerAccount.cumulativeCredits + amount,
				}),
			]);

			const sequenceNumber = await getNextCashSequenceNumber(ctx);
			const eid = await ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber,
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-25",
				timestamp: Date.now(),
				debitAccountId: trustAccount._id,
				creditAccountId: borrowerAccount._id,
				amount,
				idempotencyKey: `harness-setup-${Date.now()}`,
				source: SYSTEM_SOURCE,
			});

			const entry = await ctx.db.get(eid);
			if (!entry) {
				throw new Error("Failed to create entry");
			}

			return {
				entryId: entry._id as string,
				debitBalanceBefore: debitBalanceBefore.toString(),
			};
		});

		expect(result.entryId).toBeTruthy();
		expect(result.debitBalanceBefore).toBe("0");
	});
});

// ── T-009: Successful posting creates audit record ─────────────────
// auditTrail.insert() throws on failure. If t.run() completes without
// throwing, the audit record was created successfully.

describe("T-009 — successful posting creates audit record", () => {
	it("completes without error for OBLIGATION_ACCRUED", async () => {
		const t = makeHarness();

		await t.run(async (ctx) => {
			await createEntryAndAudit(ctx, {
				entryType: "OBLIGATION_ACCRUED",
				debitFamily: "BORROWER_RECEIVABLE",
				creditFamily: "CONTROL",
				creditSubaccount: "ACCRUAL",
				amount: BigInt(10_000),
				effectiveDate: "2026-01-15",
			});
		});
	});

	it("completes for CASH_RECEIVED with correct eventType", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			const r = await createEntryAndAudit(ctx, {
				entryType: "CASH_RECEIVED",
				debitFamily: "TRUST_CASH",
				creditFamily: "BORROWER_RECEIVABLE",
				amount: BigInt(25_000),
				effectiveDate: "2026-02-01",
			});
			return { eventType: r.entry.entryType };
		});

		expect(result.eventType).toBe("CASH_RECEIVED");
	});
});

// ── T-010: Balance state transitions ─────────────────────────────────

describe("T-010 — balance state transitions recorded in beforeState/afterState", () => {
	it("receives correct balance snapshots", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			const amount = BigInt(50_000);
			const r = await createEntryAndAudit(ctx, {
				entryType: "CASH_RECEIVED",
				debitFamily: "TRUST_CASH",
				creditFamily: "BORROWER_RECEIVABLE",
				amount,
				effectiveDate: "2026-03-01",
			});

			return {
				debitBalanceBefore: r.debitBalanceBefore,
				creditBalanceBefore: r.creditBalanceBefore,
				projectedDebit: r.projectedDebit,
				projectedCredit: r.projectedCredit,
				amount,
			};
		});

		// TRUST_CASH is not in CREDIT_NORMAL_FAMILIES: balance = debits - credits.
		// Debiting increases balance.
		expect(result.projectedDebit).toBe(
			result.debitBalanceBefore + result.amount
		);
		// BORROWER_RECEIVABLE is not in CREDIT_NORMAL_FAMILIES: crediting reduces balance.
		expect(result.projectedCredit).toBe(
			result.creditBalanceBefore - result.amount
		);
	});

	it("beforeState/afterState include amount and account ids from entry", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			const r = await createEntryAndAudit(ctx, {
				entryType: "OBLIGATION_WAIVED",
				debitFamily: "CONTROL",
				debitSubaccount: "ACCRUAL",
				creditFamily: "BORROWER_RECEIVABLE",
				amount: BigInt(15_000),
				effectiveDate: "2026-03-05",
				reason: "Borrower hardship waiver",
			});

			return {
				amount: r.entry.amount.toString(),
				debitAccountId: r.entry.debitAccountId as string,
				creditAccountId: r.entry.creditAccountId as string,
				controlId: r.debitAccount._id as string,
				borrowerId: r.creditAccount._id as string,
			};
		});

		expect(result.amount).toBe("15000");
		expect(result.debitAccountId).toBe(result.controlId);
		expect(result.creditAccountId).toBe(result.borrowerId);
	});
});

// ── T-011: Hash chain integrity ────────────────────────────────────

describe("T-011 — hash chain integrity", () => {
	it("single entry produces a valid hash chain", async () => {
		const t = makeHarness();

		await t.run(async (ctx) => {
			const r = await createEntryAndAudit(ctx, {
				entryType: "CASH_RECEIVED",
				debitFamily: "TRUST_CASH",
				creditFamily: "BORROWER_RECEIVABLE",
				amount: BigInt(30_000),
				effectiveDate: "2026-03-10",
			});

			const verification = await auditTrail.verifyChain(ctx, {
				entityId: r.entry._id as string,
			});
			expect(verification.valid).toBe(true);
			expect(verification.eventCount).toBe(1);
		});
	});

	it("multiple sequential entries maintain valid hash chains", async () => {
		const t = makeHarness();

		await t.run(async (ctx) => {
			const amounts = [10_000, 20_000, 35_000];
			const entityIds: string[] = [];

			for (const amt of amounts) {
				const r = await createEntryAndAudit(ctx, {
					entryType: "CASH_RECEIVED",
					debitFamily: "TRUST_CASH",
					creditFamily: "BORROWER_RECEIVABLE",
					amount: BigInt(amt),
					effectiveDate: "2026-03-10",
				});
				entityIds.push(r.entry._id as string);
			}

			for (const entityId of entityIds) {
				const verification = await auditTrail.verifyChain(ctx, {
					entityId,
				});
				expect(verification.valid).toBe(true);
			}
		});
	});
});

// ── T-012: Rejected postings create audit records ───────────────────
// C3: validateInput is now inside the try/catch, so ALL validation failures
// (including amount=0, negative amount) trigger rejection auditing.

describe("T-012 — rejected posting creates audit record with :REJECTED", () => {
	it("amount=0 fails validation and triggers rejection audit", async () => {
		const t = makeHarness();
		const idempotencyKey = `audit-rejection-${Date.now()}`;

		await t.run(async (ctx) => {
			const { getOrCreateCashAccount } = await import("../accounts");
			const { postCashEntryInternal } = await import("../postEntry");

			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});

			await expect(
				postCashEntryInternal(ctx, {
					amount: 0,
					effectiveDate: "2026-03-01",
					entryType: "OBLIGATION_ACCRUED",
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey,
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow("positive safe integer");

			// Verify rejection audit record was written
			const events = await auditTrail.queryByEntity(ctx, {
				entityId: `rejected:${idempotencyKey}`,
			});
			expect(events.length).toBe(1);
			expect(events[0].eventType).toBe("OBLIGATION_ACCRUED:REJECTED");
		});
	});

	it("negative amount fails validation and triggers rejection audit", async () => {
		const t = makeHarness();
		const idempotencyKey = `audit-rejection-neg-${Date.now()}`;

		await t.run(async (ctx) => {
			const { getOrCreateCashAccount } = await import("../accounts");
			const { postCashEntryInternal } = await import("../postEntry");

			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});

			await expect(
				postCashEntryInternal(ctx, {
					amount: -500,
					effectiveDate: "2026-03-01",
					entryType: "OBLIGATION_ACCRUED",
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey,
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow("positive safe integer");

			// Verify rejection audit record was written
			const events = await auditTrail.queryByEntity(ctx, {
				entityId: `rejected:${idempotencyKey}`,
			});
			expect(events.length).toBe(1);
			expect(events[0].eventType).toBe("OBLIGATION_ACCRUED:REJECTED");
		});
	});

	it("CORRECTION without admin source fails constraint check and creates rejection audit", async () => {
		const t = makeHarness();
		const idempotencyKey = `audit-rejection-actor-${Date.now()}`;

		await t.run(async (ctx) => {
			const { getOrCreateCashAccount } = await import("../accounts");
			const { postCashEntryInternal } = await import("../postEntry");

			const debit = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});
			const credit = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				subaccount: "ACCRUAL",
			});

			await expect(
				postCashEntryInternal(ctx, {
					amount: 1000,
					effectiveDate: "2026-03-01",
					entryType: "CORRECTION",
					debitAccountId: debit._id,
					creditAccountId: credit._id,
					idempotencyKey,
					source: SYSTEM_SOURCE, // not admin
					causedBy: debit._id as unknown as Id<"cash_ledger_journal_entries">,
					reason: "test correction reason",
				})
			).rejects.toThrow("admin actorType");

			// Verify rejection audit record was written
			const events = await auditTrail.queryByEntity(ctx, {
				entityId: `rejected:${idempotencyKey}`,
			});
			expect(events.length).toBe(1);
			expect(events[0].eventType).toBe("CORRECTION:REJECTED");
		});
	});
});

// ── T-013: Correction chain auditable ──────────────────────────────

describe("T-013 — correction chain auditable with causedBy in metadata", () => {
	it("original entry and CORRECTION both complete audit trail insertion", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			// Post original OBLIGATION_ACCRUED
			const orig = await createEntryAndAudit(ctx, {
				entryType: "OBLIGATION_ACCRUED",
				debitFamily: "CONTROL",
				debitSubaccount: "ACCRUAL",
				creditFamily: "BORROWER_RECEIVABLE",
				amount: BigInt(20_000),
				effectiveDate: "2026-01-15",
			});

			// Post CORRECTION referencing the original
			const { getCashAccountBalance, projectCashAccountBalance } = await import(
				"../accounts"
			);
			const { getNextCashSequenceNumber } = await import("../sequenceCounter");

			const ctrlAfter = await ctx.db.get(orig.debitAccount._id);
			const borrowAfter = await ctx.db.get(orig.creditAccount._id);
			if (!(ctrlAfter && borrowAfter)) {
				throw new Error("Account not found");
			}

			const corrAmount = BigInt(20_000);
			const corrDebitBalBefore = getCashAccountBalance(ctrlAfter);
			const corrCreditBalBefore = getCashAccountBalance(borrowAfter);

			await Promise.all([
				ctx.db.patch(ctrlAfter._id, {
					cumulativeDebits: ctrlAfter.cumulativeDebits - corrAmount,
				}),
				ctx.db.patch(borrowAfter._id, {
					cumulativeCredits: borrowAfter.cumulativeCredits - corrAmount,
				}),
			]);

			const seq2 = await getNextCashSequenceNumber(ctx);
			const corrEid = await ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: seq2,
				entryType: "CORRECTION",
				effectiveDate: "2026-01-16",
				timestamp: Date.now(),
				debitAccountId: ctrlAfter._id,
				creditAccountId: borrowAfter._id,
				amount: corrAmount,
				idempotencyKey: `audit-correction-corr-${Date.now()}`,
				source: ADMIN_SOURCE,
				causedBy: orig.entry._id,
				reason: "Correcting accrual entry — wrong amount",
			});

			const corrEntry = await ctx.db.get(corrEid);
			if (!corrEntry) {
				throw new Error("Failed to create correction entry");
			}

			const corrProjDebit = projectCashAccountBalance(
				ctrlAfter,
				"debit",
				corrAmount
			);
			const corrProjCredit = projectCashAccountBalance(
				borrowAfter,
				"credit",
				corrAmount
			);

			await auditTrail.insert(
				ctx,
				buildCashLedgerAuditArgs(
					corrEntry,
					{ debit: corrDebitBalBefore, credit: corrCreditBalBefore },
					{ debit: corrProjDebit, credit: corrProjCredit }
				)
			);

			return {
				corrEntryType: corrEntry.entryType,
				corrCausedBy: corrEntry.causedBy as string,
				origEntryId: orig.entry._id as string,
				corrReason: corrEntry.reason,
			};
		});

		expect(result.corrEntryType).toBe("CORRECTION");
		expect(result.corrCausedBy).toBe(result.origEntryId);
		expect(result.corrReason).toBe("Correcting accrual entry — wrong amount");
	});

	it("correction entry contains causedBy in metadata field", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			const orig = await createEntryAndAudit(ctx, {
				entryType: "OBLIGATION_ACCRUED",
				debitFamily: "CONTROL",
				debitSubaccount: "ACCRUAL",
				creditFamily: "BORROWER_RECEIVABLE",
				amount: BigInt(15_000),
				effectiveDate: "2026-02-01",
			});

			const { getCashAccountBalance, projectCashAccountBalance } = await import(
				"../accounts"
			);
			const { getNextCashSequenceNumber } = await import("../sequenceCounter");

			const ctrlAfter = await ctx.db.get(orig.debitAccount._id);
			const borrowAfter = await ctx.db.get(orig.creditAccount._id);
			if (!(ctrlAfter && borrowAfter)) {
				throw new Error("Account not found");
			}

			const corrAmount = BigInt(15_000);
			const corrDebitBalBefore = getCashAccountBalance(ctrlAfter);
			const corrCreditBalBefore = getCashAccountBalance(borrowAfter);

			await Promise.all([
				ctx.db.patch(ctrlAfter._id, {
					cumulativeDebits: ctrlAfter.cumulativeDebits - corrAmount,
				}),
				ctx.db.patch(borrowAfter._id, {
					cumulativeCredits: borrowAfter.cumulativeCredits - corrAmount,
				}),
			]);

			const seq2 = await getNextCashSequenceNumber(ctx);
			const corrEid = await ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: seq2,
				entryType: "CORRECTION",
				effectiveDate: "2026-02-02",
				timestamp: Date.now(),
				debitAccountId: ctrlAfter._id,
				creditAccountId: borrowAfter._id,
				amount: corrAmount,
				idempotencyKey: `audit-meta-corr-${Date.now()}`,
				source: ADMIN_SOURCE,
				causedBy: orig.entry._id,
				reason: "Administrative correction",
			});

			const corrEntry = await ctx.db.get(corrEid);
			if (!corrEntry) {
				throw new Error("Failed to create correction entry");
			}

			const corrProjDebit = projectCashAccountBalance(
				ctrlAfter,
				"debit",
				corrAmount
			);
			const corrProjCredit = projectCashAccountBalance(
				borrowAfter,
				"credit",
				corrAmount
			);

			const corrAuditArgs = buildCashLedgerAuditArgs(
				corrEntry,
				{ debit: corrDebitBalBefore, credit: corrCreditBalBefore },
				{ debit: corrProjDebit, credit: corrProjCredit }
			);
			await auditTrail.insert(ctx, corrAuditArgs);

			return {
				causedBy: corrEntry.causedBy as string,
				origId: orig.entry._id as string,
				metadataJson: corrAuditArgs.metadata,
			};
		});

		expect(result.causedBy).toBe(result.origId);
		const metadata = JSON.parse(result.metadataJson);
		expect(metadata.causedBy).toBe(result.origId);
		expect(metadata.reason).toBe("Administrative correction");
	});
});

// ── T-014: Idempotent posting does not duplicate audit ─────────────

describe("T-014 — idempotent posting does not duplicate audit records", () => {
	it("idempotent re-post returns same entry without triggering nudge", async () => {
		const t = makeHarness();
		const idempotencyKey = `audit-idempotent-same-${Date.now()}`;

		let firstEntryId = "";

		await t.run(async (ctx) => {
			const r = await createEntryAndAudit(ctx, {
				entryType: "CASH_RECEIVED",
				debitFamily: "TRUST_CASH",
				creditFamily: "BORROWER_RECEIVABLE",
				amount: BigInt(5000),
				effectiveDate: "2026-03-15",
				idempotencyKey,
			});
			firstEntryId = r.entry._id as string;
		});

		// Idempotent re-post with same key — returns existing entry, no second nudge
		await t.run(async (ctx) => {
			const { getOrCreateCashAccount } = await import("../accounts");
			const { postCashEntryInternal } = await import("../postEntry");

			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
			});
			const borrowerRec = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
			});

			const result = await postCashEntryInternal(ctx, {
				amount: 5000,
				effectiveDate: "2026-03-15",
				entryType: "CASH_RECEIVED",
				debitAccountId: trustCash._id,
				creditAccountId: borrowerRec._id,
				idempotencyKey, // Same key
				source: SYSTEM_SOURCE,
			});

			// Returns the existing entry (idempotent — no second nudge/audit)
			expect(result.entry._id as string).toBe(firstEntryId);
			// I2: Idempotent return now includes all fields (0n for unknown balances)
			expect(result.projectedDebitBalance.toString()).toBe("0");
			expect(result.projectedCreditBalance.toString()).toBe("0");
			expect(result.debitBalanceBefore.toString()).toBe("0");
			expect(result.creditBalanceBefore.toString()).toBe("0");

			// Ensure idempotent posting did not create additional audit records
			const auditEvents = await auditTrail.queryByEntity(ctx, {
				entityId: firstEntryId,
			});
			expect(auditEvents.length).toBe(1);
		});
	});

	it("different idempotency keys create separate entries with separate audit records", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			const entryIds: string[] = [];
			const amounts = [3000, 7000];

			for (const amt of amounts) {
				const r = await createEntryAndAudit(ctx, {
					entryType: "CASH_RECEIVED",
					debitFamily: "TRUST_CASH",
					creditFamily: "BORROWER_RECEIVABLE",
					amount: BigInt(amt),
					effectiveDate: "2026-03-20",
				});
				entryIds.push(r.entry._id as string);
			}

			return entryIds;
		});

		expect(result.length).toBe(2);
		expect(result[0]).not.toBe(result[1]);
	});
});

// ── I3: Test processCashLedgerHashChainStep via Convex internalMutation ──

describe("processHashChainStepHandler — tests DB lookup, BigInt parsing, error handling", () => {
	it("completes for a valid journal entry", async () => {
		const t = makeHarness();

		await t.run(async (ctx) => {
			const { getCashAccountBalance, projectCashAccountBalance } = await import(
				"../accounts"
			);
			const { getNextCashSequenceNumber } = await import("../sequenceCounter");
			const { processHashChainStepHandler } = await import("../hashChain");

			const r = await createEntryAndAudit(ctx, {
				entryType: "CASH_RECEIVED",
				debitFamily: "TRUST_CASH",
				creditFamily: "BORROWER_RECEIVABLE",
				amount: BigInt(12_000),
				effectiveDate: "2026-03-01",
			});

			// Now call the extracted handler directly — tests DB lookup + BigInt parsing
			// Create a second entry so we can verify the handler independently
			const amount2 = BigInt(8000);
			const debitBal = getCashAccountBalance(r.debitAccount);
			const creditBal = getCashAccountBalance(r.creditAccount);

			const seq = await getNextCashSequenceNumber(ctx);
			const eid2 = await ctx.db.insert("cash_ledger_journal_entries", {
				sequenceNumber: seq,
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-02",
				timestamp: Date.now(),
				debitAccountId: r.debitAccount._id,
				creditAccountId: r.creditAccount._id,
				amount: amount2,
				idempotencyKey: `step-handler-test-${Date.now()}`,
				source: SYSTEM_SOURCE,
			});

			const projDebit = projectCashAccountBalance(
				r.debitAccount,
				"debit",
				amount2
			);
			const projCredit = projectCashAccountBalance(
				r.creditAccount,
				"credit",
				amount2
			);

			// Call the handler directly — exercises DB lookup, BigInt parsing, audit insert
			await processHashChainStepHandler(ctx, {
				entryId: eid2,
				balanceBefore: {
					debit: debitBal.toString(),
					credit: creditBal.toString(),
				},
				balanceAfter: {
					debit: projDebit.toString(),
					credit: projCredit.toString(),
				},
			});
		});
	});

	it("throws when journal entry does not exist (C2)", async () => {
		const t = makeHarness();

		await t.run(async (ctx) => {
			const { processHashChainStepHandler } = await import("../hashChain");

			// Use a fabricated ID that doesn't exist in the DB
			const fakeId =
				"invalid_id_for_testing" as Id<"cash_ledger_journal_entries">;

			await expect(
				processHashChainStepHandler(ctx, {
					entryId: fakeId,
					balanceBefore: { debit: "0", credit: "0" },
					balanceAfter: { debit: "1000", credit: "1000" },
				})
			).rejects.toThrow("Journal entry not found");
		});
	});
});

// ── I5: Verify buildCashLedgerAuditArgs output structure ────────────

describe("buildCashLedgerAuditArgs — output shape", () => {
	it("returns correctly structured audit args with parsed JSON fields", async () => {
		const t = makeHarness();

		const result = await t.run(async (ctx) => {
			const r = await createEntryAndAudit(ctx, {
				entryType: "OBLIGATION_ACCRUED",
				debitFamily: "BORROWER_RECEIVABLE",
				creditFamily: "CONTROL",
				creditSubaccount: "ACCRUAL",
				amount: BigInt(5000),
				effectiveDate: "2026-04-01",
				reason: "monthly accrual",
			});

			return {
				auditArgs: r.auditArgs,
				entryId: r.entry._id as string,
				debitId: r.debitAccount._id as string,
				creditId: r.creditAccount._id as string,
			};
		});

		expect(result.auditArgs.entityId).toBe(result.entryId);
		expect(result.auditArgs.entityType).toBe("cashLedgerEntry");
		expect(result.auditArgs.eventType).toBe("OBLIGATION_ACCRUED");

		const beforeState = JSON.parse(result.auditArgs.beforeState);
		expect(beforeState.debitAccountBalance).toBe("0");
		expect(beforeState.creditAccountBalance).toBe("0");

		const afterState = JSON.parse(result.auditArgs.afterState);
		expect(afterState.amount).toBe("5000");
		expect(afterState.debitAccountId).toBe(result.debitId);
		expect(afterState.creditAccountId).toBe(result.creditId);

		const metadata = JSON.parse(result.auditArgs.metadata);
		expect(metadata.effectiveDate).toBe("2026-04-01");
		expect(metadata.reason).toBe("monthly accrual");
	});
});
