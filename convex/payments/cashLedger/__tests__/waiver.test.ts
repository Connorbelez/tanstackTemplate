import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ADMIN_SOURCE,
	createHarness,
	createSettledObligation,
	seedMinimalEntities,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import { registerAuditLogComponent } from "../../../../src/test/convex/registerAuditLogComponent";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import schema from "../../../schema";
import { convexModules } from "../../../test/moduleMaps";
import { getCashAccountBalance } from "../accounts";
import { postObligationWaiver } from "../integrations";
import { buildIdempotencyKey } from "../types";

const modules = convexModules;

/** Admin waiver API + GT transitions use auditLog — register the component for those tests. */
function createHarnessWithAudit() {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	return t;
}

const NO_RECEIVABLE_RE = /No BORROWER_RECEIVABLE/i;
const FAIR_LEND_ADMIN_PATTERN = /fair lend admin/i;
const OBLIGATION_WAIVED_IDEM_PREFIX = /^cash-ledger:obligation-waived:/;
const ALREADY_SETTLED_RE = /already settled/i;
const EXCEEDS_OUTSTANDING_BALANCE_RE = /exceeds outstanding balance/i;

const FAIRLEND_ADMIN_IDENTITY = {
	subject: "test-waiver-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "waiver-admin@fairlend.test",
	user_first_name: "Waiver",
	user_last_name: "Admin",
};

const NON_FAIRLEND_ADMIN_IDENTITY = {
	subject: "test-waiver-outsider",
	issuer: "https://api.workos.com",
	org_id: "org_some_other_org",
	organization_name: "Other Org",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "outsider@example.com",
	user_first_name: "Other",
	user_last_name: "User",
};

function asFairLendAdmin(t: ReturnType<typeof createHarnessWithAudit>) {
	return t.withIdentity(FAIRLEND_ADMIN_IDENTITY);
}

function asNonFairLendAdmin(t: ReturnType<typeof createHarnessWithAudit>) {
	return t.withIdentity(NON_FAIRLEND_ADMIN_IDENTITY);
}

// ── Helper: deterministic waiver idempotency key ─────────────────────

let waiverCounter = 0;
function waiverKey(obligationId: string, label: string) {
	return buildIdempotencyKey(
		"obligation-waived",
		obligationId,
		`test-${label}-${++waiverCounter}`
	);
}

// ── Helper: create an obligation with an outstanding receivable ──────

async function createObligationWithReceivable(
	t: ReturnType<typeof createHarness>,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		amountSettled?: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: args.amountSettled ?? 0,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			createdAt: Date.now(),
		});

		// Pre-create BORROWER_RECEIVABLE with outstanding balance
		// Debit-normal: balance = debits - credits
		await ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: args.mortgageId,
			obligationId,
			borrowerId: args.borrowerId,
			cumulativeDebits: BigInt(args.amount),
			cumulativeCredits: BigInt(args.amountSettled ?? 0),
			createdAt: Date.now(),
		});

		return obligationId;
	});
}

describe("postObligationWaiver (integration function)", () => {
	it("posts OBLIGATION_WAIVED with correct debit/credit families", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const result = await postObligationWaiver(ctx, {
				obligationId,
				amount: 50_000,
				reason: "Hardship waiver",
				idempotencyKey: waiverKey(obligationId, "families"),
				source: ADMIN_SOURCE,
				outstandingBefore: 100_000,
				outstandingAfter: 50_000,
				isFullWaiver: false,
			});

			expect(result.entry.entryType).toBe("OBLIGATION_WAIVED");
			expect(result.entry.amount).toBe(50_000n);

			// Verify the debit account is CONTROL:WAIVER
			const debitAccount = await ctx.db.get(result.entry.debitAccountId);
			const creditAccount = await ctx.db.get(result.entry.creditAccountId);
			expect(debitAccount).not.toBeNull();
			expect(creditAccount).not.toBeNull();
			if (!(debitAccount && creditAccount)) {
				throw new Error("expected debit and credit accounts");
			}
			expect(debitAccount.family).toBe("CONTROL");
			expect(debitAccount.subaccount).toBe("WAIVER");
			expect(creditAccount.family).toBe("BORROWER_RECEIVABLE");
		});
	});

	it("rejects waiver when no BORROWER_RECEIVABLE exists", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create an obligation without a receivable account
		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "due",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 50_000,
				amountSettled: 0,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			await expect(
				postObligationWaiver(ctx, {
					obligationId,
					amount: 25_000,
					reason: "Test waiver",
					idempotencyKey: waiverKey(obligationId, "no-receivable"),
					source: ADMIN_SOURCE,
					outstandingBefore: 0,
					outstandingAfter: 0,
					isFullWaiver: false,
				})
			).rejects.toThrow(NO_RECEIVABLE_RE);
		});
	});
});

describe("postObligationWaiver — cash ledger behaviour (direct integration)", () => {
	// AC-1: BORROWER_RECEIVABLE reduced by waiver amount
	it("AC-1: BORROWER_RECEIVABLE reduced by waiver amount", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await postObligationWaiver(ctx, {
				obligationId,
				amount: 40_000,
				reason: "Partial hardship waiver",
				idempotencyKey: waiverKey(obligationId, "ac1"),
				source: ADMIN_SOURCE,
				outstandingBefore: 100_000,
				outstandingAfter: 60_000,
				isFullWaiver: false,
			});
		});

		// Assert BORROWER_RECEIVABLE balance reduced: 100,000 - 40,000 = 60,000
		await t.run(async (ctx) => {
			const receivableAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			expect(receivableAccounts).toHaveLength(1);
			expect(getCashAccountBalance(receivableAccounts[0])).toBe(60_000n);
		});
	});

	// AC-2: CONTROL:WAIVER balance increased
	it("AC-2: CONTROL:WAIVER balance increased", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await postObligationWaiver(ctx, {
				obligationId,
				amount: 30_000,
				reason: "Waiver test",
				idempotencyKey: waiverKey(obligationId, "ac2"),
				source: ADMIN_SOURCE,
				outstandingBefore: 100_000,
				outstandingAfter: 70_000,
				isFullWaiver: false,
			});
		});

		// CONTROL is debit-normal: balance = debits - credits
		// Waiver debits CONTROL:WAIVER, so balance grows
		await t.run(async (ctx) => {
			const controlAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_subaccount", (q) =>
					q.eq("family", "CONTROL").eq("subaccount", "WAIVER")
				)
				.collect();
			const obligationControl = controlAccounts.find(
				(a) => a.obligationId === obligationId
			);
			expect(obligationControl).toBeDefined();
			if (!obligationControl) {
				throw new Error("expected CONTROL:WAIVER for obligation");
			}
			expect(getCashAccountBalance(obligationControl)).toBe(30_000n);
		});
	});

	// AC-3: Full audit trail (who, when, how much, why)
	it("AC-3: journal entry has full audit trail", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 80_000,
		});

		await t.run(async (ctx) => {
			const result = await postObligationWaiver(ctx, {
				obligationId,
				amount: 80_000,
				reason: "Full forgiveness: borrower hardship case #42",
				idempotencyKey: waiverKey(obligationId, "ac3"),
				source: ADMIN_SOURCE,
				outstandingBefore: 80_000,
				outstandingAfter: 0,
				isFullWaiver: true,
			});

			const entry = result.entry;
			expect(entry.entryType).toBe("OBLIGATION_WAIVED");
			expect(entry.amount).toBe(80_000n);
			expect(entry.reason).toBe("Full forgiveness: borrower hardship case #42");
			expect(entry.obligationId).toBe(obligationId);
			expect(entry.mortgageId).toBe(seeded.mortgageId);
			expect(entry.borrowerId).toBe(seeded.borrowerId);
			expect(entry.source.actorType).toBe("admin");
			expect(entry.source.actorId).toBe(ADMIN_SOURCE.actorId);
			expect(entry.source.channel).toBe("admin_dashboard");
		});
	});

	// AC-4: Partial and full waivers both work
	it("AC-4: partial waiver followed by full waiver of remainder", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		// First partial waiver: 40,000
		await t.run(async (ctx) => {
			await postObligationWaiver(ctx, {
				obligationId,
				amount: 40_000,
				reason: "Partial waiver step 1",
				idempotencyKey: waiverKey(obligationId, "ac4-first"),
				source: ADMIN_SOURCE,
				outstandingBefore: 100_000,
				outstandingAfter: 60_000,
				isFullWaiver: false,
			});
		});

		// Second partial waiver: 60,000 (remainder)
		await t.run(async (ctx) => {
			await postObligationWaiver(ctx, {
				obligationId,
				amount: 60_000,
				reason: "Partial waiver step 2 — full forgiveness",
				idempotencyKey: waiverKey(obligationId, "ac4-second"),
				source: ADMIN_SOURCE,
				outstandingBefore: 60_000,
				outstandingAfter: 0,
				isFullWaiver: true,
			});
		});

		// BORROWER_RECEIVABLE should be 0
		await t.run(async (ctx) => {
			const receivableAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			expect(getCashAccountBalance(receivableAccounts[0])).toBe(0n);

			// CONTROL:WAIVER should be 100,000 total
			const controlAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_subaccount", (q) =>
					q.eq("family", "CONTROL").eq("subaccount", "WAIVER")
				)
				.collect();
			const obligationControl = controlAccounts.find(
				(a) => a.obligationId === obligationId
			);
			if (!obligationControl) {
				throw new Error("expected CONTROL:WAIVER for obligation");
			}
			expect(getCashAccountBalance(obligationControl)).toBe(100_000n);

			// Two journal entries should exist
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();
			const waiverEntries = entries.filter(
				(e) => e.entryType === "OBLIGATION_WAIVED"
			);
			expect(waiverEntries).toHaveLength(2);
		});
	});

	// Edge case: BORROWER_RECEIVABLE is balance-exempt in pipeline
	it("integration function allows over-waiver (admin mutation enforces limit)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			const result = await postObligationWaiver(ctx, {
				obligationId,
				amount: 75_000,
				reason: "Over-waiver (normally blocked by admin mutation)",
				idempotencyKey: waiverKey(obligationId, "over-waiver"),
				source: ADMIN_SOURCE,
				outstandingBefore: 50_000,
				outstandingAfter: -25_000,
				isFullWaiver: false,
			});
			expect(result.entry.amount).toBe(75_000n);
		});

		// Verify BORROWER_RECEIVABLE went negative (50k - 75k = -25k)
		await t.run(async (ctx) => {
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			expect(getCashAccountBalance(accounts[0])).toBe(-25_000n);
		});
	});

	// Edge case: waiver amount validation
	it.each([
		{ amount: 0, label: "zero" },
		{ amount: -1, label: "negative (-1)" },
		{ amount: 1.5, label: "fractional (1.5)" },
	])("pipeline rejects $label amount ($amount) via safe integer check", async ({
		amount,
	}) => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await expect(
				postObligationWaiver(ctx, {
					obligationId,
					amount,
					reason: "Invalid amount test",
					idempotencyKey: waiverKey(obligationId, `invalid-${amount}`),
					source: ADMIN_SOURCE,
					outstandingBefore: 100_000,
					outstandingAfter: 100_000 - amount,
					isFullWaiver: false,
				})
			).rejects.toThrow();
		});
	});

	// Verify CONTROL:WAIVER is auto-created
	it("auto-creates CONTROL:WAIVER account on first waiver", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		// Verify no CONTROL:WAIVER exists yet
		await t.run(async (ctx) => {
			const controlAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_subaccount", (q) =>
					q.eq("family", "CONTROL").eq("subaccount", "WAIVER")
				)
				.collect();
			const existing = controlAccounts.find(
				(a) => a.obligationId === obligationId
			);
			expect(existing).toBeUndefined();
		});

		// Post waiver — CONTROL:WAIVER should be auto-created
		await t.run(async (ctx) => {
			await postObligationWaiver(ctx, {
				obligationId,
				amount: 10_000,
				reason: "First waiver creates account",
				idempotencyKey: waiverKey(obligationId, "auto-create"),
				source: ADMIN_SOURCE,
				outstandingBefore: 50_000,
				outstandingAfter: 40_000,
				isFullWaiver: false,
			});
		});

		// Verify CONTROL:WAIVER now exists with correct balance
		await t.run(async (ctx) => {
			const controlAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_subaccount", (q) =>
					q.eq("family", "CONTROL").eq("subaccount", "WAIVER")
				)
				.collect();
			const waiverAccount = controlAccounts.find(
				(a) => a.obligationId === obligationId
			);
			expect(waiverAccount).toBeDefined();
			if (!waiverAccount) {
				throw new Error("expected CONTROL:WAIVER for obligation");
			}
			expect(getCashAccountBalance(waiverAccount)).toBe(10_000n);
		});
	});

	// Verify idempotency key prefix
	it("journal entry uses cash-ledger:obligation-waived idempotency prefix", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			const key = waiverKey(obligationId, "idem-prefix");
			const result = await postObligationWaiver(ctx, {
				obligationId,
				amount: 25_000,
				reason: "Idempotency key test",
				idempotencyKey: key,
				source: ADMIN_SOURCE,
				outstandingBefore: 50_000,
				outstandingAfter: 25_000,
				isFullWaiver: false,
			});

			expect(result.entry.idempotencyKey).toBe(key);
			expect(result.entry.idempotencyKey).toMatch(
				OBLIGATION_WAIVED_IDEM_PREFIX
			);
		});
	});

	// Verify metadata on journal entry
	it("journal entry includes waiver metadata", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 80_000,
			amountSettled: 20_000,
		});

		await t.run(async (ctx) => {
			const result = await postObligationWaiver(ctx, {
				obligationId,
				amount: 30_000,
				reason: "Metadata check",
				idempotencyKey: waiverKey(obligationId, "metadata"),
				source: ADMIN_SOURCE,
				outstandingBefore: 60_000,
				outstandingAfter: 30_000,
				isFullWaiver: false,
			});

			const metadata = result.entry.metadata as Record<string, unknown>;
			expect(metadata.waiverAmount).toBe(30_000);
			expect(metadata.obligationAmount).toBe(80_000);
			expect(metadata.amountSettled).toBe(20_000);
		});
	});
});

describe("waiveObligationBalance (FairLend admin API)", () => {
	let lastHarness: ReturnType<typeof createHarnessWithAudit> | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		if (lastHarness) {
			await lastHarness.finishAllScheduledFunctions(vi.runAllTimers);
			lastHarness = undefined;
		}
		vi.useRealTimers();
	});

	it("rejects non–FairLend-admin callers", async () => {
		const t = createHarnessWithAudit();
		lastHarness = t;
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 10_000,
		});

		await expect(
			asNonFairLendAdmin(t).mutation(
				api.payments.cashLedger.mutations.waiveObligationBalance,
				{
					obligationId,
					amount: 10_000,
					reason: "Should not run",
				}
			)
		).rejects.toThrow(FAIR_LEND_ADMIN_PATTERN);
	});

	it("rejects settled obligations before touching the ledger", async () => {
		const t = createHarnessWithAudit();
		lastHarness = t;
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await expect(
			asFairLendAdmin(t).mutation(
				api.payments.cashLedger.mutations.waiveObligationBalance,
				{
					obligationId,
					amount: 1,
					reason: "Invalid attempt",
				}
			)
		).rejects.toThrow(ALREADY_SETTLED_RE);
	});

	it("rejects waiver amount above outstanding receivable", async () => {
		const t = createHarnessWithAudit();
		lastHarness = t;
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 40_000,
		});

		await expect(
			asFairLendAdmin(t).mutation(
				api.payments.cashLedger.mutations.waiveObligationBalance,
				{
					obligationId,
					amount: 50_000,
					reason: "Too much",
				}
			)
		).rejects.toThrow(EXCEEDS_OUTSTANDING_BALANCE_RE);
	});

	it("partial waiver leaves obligation status unchanged (due)", async () => {
		const t = createHarnessWithAudit();
		lastHarness = t;
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		const result = await asFairLendAdmin(t).mutation(
			api.payments.cashLedger.mutations.waiveObligationBalance,
			{
				obligationId,
				amount: 35_000,
				reason: "Partial hardship",
			}
		);

		expect(result.isFullWaiver).toBe(false);

		await t.run(async (ctx) => {
			const ob = await ctx.db.get(obligationId);
			expect(ob?.status).toBe("due");
		});
	});

	it("full waiver transitions obligation GT state to waived", async () => {
		const t = createHarnessWithAudit();
		lastHarness = t;
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 90_000,
		});

		const result = await asFairLendAdmin(t).mutation(
			api.payments.cashLedger.mutations.waiveObligationBalance,
			{
				obligationId,
				amount: 90_000,
				reason: "Full waiver — ENG-166",
			}
		);

		expect(result.isFullWaiver).toBe(true);

		await t.run(async (ctx) => {
			const ob = await ctx.db.get(obligationId);
			expect(ob?.status).toBe("waived");
		});
	});

	it("idempotencyKey: replay returns same journal entry without error", async () => {
		const t = createHarnessWithAudit();
		lastHarness = t;
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 25_000,
		});

		const idempotencyKey = buildIdempotencyKey(
			"obligation-waived-admin-test",
			obligationId,
			"idem-1"
		);

		const first = await asFairLendAdmin(t).mutation(
			api.payments.cashLedger.mutations.waiveObligationBalance,
			{
				obligationId,
				amount: 25_000,
				reason: "Idempotent full waiver",
				idempotencyKey,
			}
		);

		const second = await asFairLendAdmin(t).mutation(
			api.payments.cashLedger.mutations.waiveObligationBalance,
			{
				obligationId,
				amount: 25_000,
				reason: "Idempotent full waiver",
				idempotencyKey,
			}
		);

		expect(second.journalEntryId).toBe(first.journalEntryId);
		expect(second.waiverAmount).toBe(25_000);

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", idempotencyKey)
				)
				.collect();
			expect(entries).toHaveLength(1);
		});
	});
});
