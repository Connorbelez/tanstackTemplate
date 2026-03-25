import { describe, expect, it } from "vitest";
import { getOrCreateCashAccount } from "../accounts";
import { postCashEntryInternal } from "../postEntry";
import {
	findSettledObligationsWithNonZeroBalance,
	getJournalSettledAmountForObligation,
} from "../reconciliation";
import { buildIdempotencyKey } from "../types";
import { createHarness, SYSTEM_SOURCE, seedMinimalEntities } from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

describe("ENG-172 reversal reconciliation detection", () => {
	it("T-014: finds reversed obligations with non-zero outstanding balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// 1. Create a settled obligation
		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 100_000,
				amountSettled: 100_000,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				settledAt: Date.parse("2026-03-01T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		// 2. Create TRUST_CASH and BORROWER_RECEIVABLE accounts
		const { trustCashId, borrowerReceivableId } = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const borrowerReceivable = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: seeded.mortgageId,
				obligationId,
				borrowerId: seeded.borrowerId,
			});
			return {
				trustCashId: trustCash._id,
				borrowerReceivableId: borrowerReceivable._id,
			};
		});

		// 3. Post CASH_RECEIVED entry (debit TRUST_CASH, credit BORROWER_RECEIVABLE)
		const cashReceivedResult = await t.run(async (ctx) => {
			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: 100_000,
				debitAccountId: trustCashId,
				creditAccountId: borrowerReceivableId,
				obligationId,
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				idempotencyKey: buildIdempotencyKey("cash-received", "t014-receipt"),
				source: SYSTEM_SOURCE,
			});
		});

		// 4. Post REVERSAL entry (debit BORROWER_RECEIVABLE, credit TRUST_CASH)
		await t.run(async (ctx) => {
			return postCashEntryInternal(ctx, {
				entryType: "REVERSAL",
				effectiveDate: "2026-03-02",
				amount: 100_000,
				debitAccountId: borrowerReceivableId,
				creditAccountId: trustCashId,
				obligationId,
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				causedBy: cashReceivedResult.entry._id,
				idempotencyKey: buildIdempotencyKey("reversal", "t014-reversal"),
				source: SYSTEM_SOURCE,
			});
		});

		// 5. Call findSettledObligationsWithNonZeroBalance
		const results = await t.run(async (ctx) => {
			return findSettledObligationsWithNonZeroBalance(ctx);
		});

		// 6. Assert: result includes this obligation
		const match = results.find((r) => r.obligationId === obligationId);
		expect(match).toBeDefined();
		expect(match?.outstandingBalance).toBe(BigInt(100_000));
	});

	it("T-015: non-reversed settled obligations are NOT flagged", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// 1. Create a settled obligation
		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 100_000,
				amountSettled: 100_000,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				settledAt: Date.parse("2026-03-01T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		// 2. Create accounts and post CASH_RECEIVED (no reversal)
		const { trustCashId, borrowerReceivableId } = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const borrowerReceivable = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: seeded.mortgageId,
				obligationId,
				borrowerId: seeded.borrowerId,
			});
			return {
				trustCashId: trustCash._id,
				borrowerReceivableId: borrowerReceivable._id,
			};
		});

		await t.run(async (ctx) => {
			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: 100_000,
				debitAccountId: trustCashId,
				creditAccountId: borrowerReceivableId,
				obligationId,
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				idempotencyKey: buildIdempotencyKey("cash-received", "t015-receipt"),
				source: SYSTEM_SOURCE,
			});
		});

		// 3. Call findSettledObligationsWithNonZeroBalance — should NOT include this obligation
		const results = await t.run(async (ctx) => {
			return findSettledObligationsWithNonZeroBalance(ctx);
		});

		const match = results.find((r) => r.obligationId === obligationId);
		expect(match).toBeUndefined();
	});

	it("T-016: getJournalSettledAmountForObligation returns correct balance before and after reversal", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// 1. Create obligation
		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 100_000,
				amountSettled: 100_000,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				settledAt: Date.parse("2026-03-01T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		// 2. Create accounts
		const { trustCashId, borrowerReceivableId } = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const borrowerReceivable = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: seeded.mortgageId,
				obligationId,
				borrowerId: seeded.borrowerId,
			});
			return {
				trustCashId: trustCash._id,
				borrowerReceivableId: borrowerReceivable._id,
			};
		});

		// 3. Post CASH_RECEIVED
		const cashReceivedResult = await t.run(async (ctx) => {
			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: 100_000,
				debitAccountId: trustCashId,
				creditAccountId: borrowerReceivableId,
				obligationId,
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				idempotencyKey: buildIdempotencyKey("cash-received", "t016-receipt"),
				source: SYSTEM_SOURCE,
			});
		});

		// 4. Check journal settled amount BEFORE reversal
		const amountBeforeReversal = await t.run(async (ctx) => {
			return getJournalSettledAmountForObligation(ctx, obligationId);
		});
		expect(amountBeforeReversal).toBe(BigInt(100_000));

		// 5. Post REVERSAL
		await t.run(async (ctx) => {
			return postCashEntryInternal(ctx, {
				entryType: "REVERSAL",
				effectiveDate: "2026-03-02",
				amount: 100_000,
				debitAccountId: borrowerReceivableId,
				creditAccountId: trustCashId,
				obligationId,
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				causedBy: cashReceivedResult.entry._id,
				idempotencyKey: buildIdempotencyKey("reversal", "t016-reversal"),
				source: SYSTEM_SOURCE,
			});
		});

		// 6. Check journal settled amount AFTER reversal
		const amountAfterReversal = await t.run(async (ctx) => {
			return getJournalSettledAmountForObligation(ctx, obligationId);
		});
		expect(amountAfterReversal).toBe(0n);
	});
});
