import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";
import { convexModules } from "../../../test/moduleMaps";
import { getOrCreateCashAccount } from "../accounts";
import { postSettlementAllocation } from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import { getPostingGroupSummary } from "../postingGroups";
import { findNonZeroPostingGroups } from "../reconciliation";
import { buildIdempotencyKey } from "../types";
import {
	createHarness,
	createSettledObligation,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "./testUtils";

const modules = convexModules;

interface CreateDispersalEntriesHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			obligationId: Id<"obligations">;
			mortgageId: Id<"mortgages">;
			settledAmount: number;
			settledDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<{
		created: boolean;
		entries: Array<{
			id: Id<"dispersalEntries">;
			lenderId: Id<"lenders">;
			lenderAccountId: Id<"ledger_accounts">;
			amount: number;
			rawAmount: number;
			units: number;
		}>;
		servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
	}>;
}

const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;

const CASH_LEDGER_IDENTITY = {
	subject: "test-pgi-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["cash_ledger:view", "cash_ledger:correct"]),
	user_email: "pgi-test@fairlend.ca",
	user_first_name: "PGI",
	user_last_name: "Tester",
};

describe("posting group integration — dispersal E2E", () => {
	it("dispersal with correct amounts → all entries posted, posting group summary tracks allocation", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const result = await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "pgi-dispersal-complete",
				source: SYSTEM_SOURCE,
			});

			expect(result.created).toBe(true);
		});

		await t.run(async (ctx) => {
			const postingGroupId = `allocation:${obligationId}`;
			const summary = await getPostingGroupSummary(ctx, postingGroupId);

			// Current dispersal flow only debits CONTROL:ALLOCATION (no balancing
			// CASH_APPLIED credit in Phase 1). All entries are accounted for and
			// the total allocation equals the obligation amount.
			expect(summary.totalJournalEntryCount).toBeGreaterThanOrEqual(2);

			// Sum of all debit-side entries on CONTROL:ALLOCATION = settled amount
			const totalAllocated = summary.entries
				.filter((e) => e.side === "debit")
				.reduce((sum, e) => sum + e.amount, 0n);
			expect(totalAllocated).toBe(100_000n);
			expect(summary.controlAllocationBalance).toBe(100_000n);
		});
	});

	it("dispersal with mismatched amounts → ConvexError thrown, zero entries persisted", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		// Create a dispersal entry with a real ledger_accounts reference
		const fakeDispersalEntryId = await t.run(async (ctx) => {
			// Get an existing ledger_account for the lender
			const accounts = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "POSITION").eq("mortgageId", String(seeded.mortgageId))
				)
				.first();
			if (!accounts) {
				throw new Error("Expected at least one ledger account");
			}

			return ctx.db.insert("dispersalEntries", {
				obligationId,
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				lenderAccountId: accounts._id,
				amount: 60_000,
				dispersalDate: "2026-03-01",
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: "pgi-mismatch-entry",
				calculationDetails: {
					settledAmount: 100_000,
					servicingFee: 0,
					distributableAmount: 100_000,
					feeDue: 0,
					feeCashApplied: 0,
					feeReceivable: 0,
					ownershipUnits: 6000,
					totalUnits: 10_000,
					ownershipFraction: 0.6,
					rawAmount: 60_000,
					roundedAmount: 60_000,
					sourceObligationType: "regular_interest",
				},
				createdAt: Date.now(),
			});
		});

		// Attempt to post with amounts that don't sum to the obligation amount
		await t.run(async (ctx) => {
			try {
				await postSettlementAllocation(ctx, {
					obligationId,
					mortgageId: seeded.mortgageId,
					settledDate: "2026-03-01",
					servicingFee: 833,
					entries: [
						{
							dispersalEntryId: fakeDispersalEntryId,
							lenderId: seeded.lenderAId,
							amount: 60_000,
						},
					],
					// 60_000 + 833 = 60_833, not 100_000 — should fail
					source: SYSTEM_SOURCE,
				});
				throw new Error("Expected ConvexError");
			} catch (error) {
				expect(error).toBeInstanceOf(ConvexError);
				const convexErr = error as ConvexError<{ code: string }>;
				expect(convexErr.data.code).toBe("POSTING_GROUP_SUM_MISMATCH");
			}
		});

		// Verify no journal entries were created for this posting group
		await t.run(async (ctx) => {
			const postingGroupId = `allocation:${obligationId}`;
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", postingGroupId)
				)
				.collect();
			expect(entries).toHaveLength(0);
		});
	});

	it("getPostingGroupEntries returns all entries in sequence order", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "pgi-sequence-order",
				source: SYSTEM_SOURCE,
			});
		});

		// Call the actual getPostingGroupEntries query through the API
		// to exercise the middleware chain and compareSequence sort
		const auth = t.withIdentity(CASH_LEDGER_IDENTITY);
		const postingGroupId = `allocation:${obligationId}`;
		const entries = await auth.query(
			api.payments.cashLedger.queries.getPostingGroupEntries,
			{ postingGroupId }
		);

		expect(entries.length).toBeGreaterThanOrEqual(2);

		// Verify entries are sorted by ascending sequence order (compareSequence)
		for (let i = 1; i < entries.length; i++) {
			expect(entries[i].sequenceNumber).toBeGreaterThan(
				entries[i - 1].sequenceNumber
			);
		}
	});
});

describe("posting group reconciliation — findNonZeroPostingGroups", () => {
	it("returns alert for incomplete group", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		const postingGroupId = `allocation:${obligationId}`;

		// Post only one lender payable, no servicing fee — incomplete group
		await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});
			const payableAccount = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 60_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"test-partial-alert"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const result = await findNonZeroPostingGroups(ctx);
			expect(result.alerts.length).toBeGreaterThanOrEqual(1);

			const alert = result.alerts.find(
				(a) => a.postingGroupId === postingGroupId
			);
			expect(alert).toBeDefined();
			expect(alert?.controlAllocationBalance).not.toBe(0n);
			expect(alert?.obligationId).toBe(obligationId);
		});
	});

	it("does NOT return alert for complete group (net-zero CONTROL:ALLOCATION)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const postingGroupId = `allocation:${obligationId}`;

		// Create a complete posting group with net-zero CONTROL:ALLOCATION balance
		// by posting a CASH_APPLIED credit and matching LENDER_PAYABLE_CREATED debits.
		// UNAPPLIED_CASH needs a pre-seeded credit balance so the debit doesn't go negative.
		await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});
			const unappliedAccountRaw = await getOrCreateCashAccount(ctx, {
				family: "UNAPPLIED_CASH",
				mortgageId: seeded.mortgageId,
			});
			// Pre-seed UNAPPLIED_CASH (credit-normal) with sufficient balance
			await ctx.db.patch(unappliedAccountRaw._id, {
				cumulativeCredits: 50_000n,
			});
			const payableAccountA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			const payableAccountB = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderBId,
			});

			// Credit CONTROL:ALLOCATION via CASH_APPLIED (50_000 in)
			await postCashEntryInternal(ctx, {
				entryType: "CASH_APPLIED",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: unappliedAccountRaw._id,
				creditAccountId: controlAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"cash-applied",
					"test-no-alert-seed"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			// Debit CONTROL:ALLOCATION (30_000 out)
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 30_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountA._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"test-no-alert-a"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			// Debit CONTROL:ALLOCATION (20_000 out) — nets to zero
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 20_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountB._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"test-no-alert-b"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderBId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const result = await findNonZeroPostingGroups(ctx);
			const matchingAlert = result.alerts.find(
				(a) => a.postingGroupId === postingGroupId
			);
			expect(matchingAlert).toBeUndefined();
		});
	});

	it("surfaces orphaned CONTROL:ALLOCATION accounts (no obligationId) in result.orphaned", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create a CONTROL:ALLOCATION account WITHOUT an obligationId
		// but with a non-zero balance — this is an anomaly
		const orphanedAccountId = await t.run(async (ctx) => {
			return ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				subaccount: "ALLOCATION",
				cumulativeDebits: 75_000n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			const result = await findNonZeroPostingGroups(ctx);

			// Should appear in orphaned, not in alerts
			const orphaned = result.orphaned.find(
				(o) => o.accountId === orphanedAccountId
			);
			expect(orphaned).toBeDefined();
			expect(orphaned?.controlAllocationBalance).toBe(75_000n);

			// Should NOT appear in alerts (no obligationId → no postingGroupId)
			const alertWithOrphan = result.alerts.find((a) =>
				a.postingGroupId.includes(orphanedAccountId as unknown as string)
			);
			expect(alertWithOrphan).toBeUndefined();
		});
	});

	it("reports correct entryCount and oldestEntryTimestamp for alerts", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		const postingGroupId = `allocation:${obligationId}`;

		await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});
			const payableAccountA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			const payableAccountB = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderBId,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-02-22",
				amount: 60_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountA._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"test-timestamp-a"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-02-28",
				amount: 40_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountB._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"test-timestamp-b"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderBId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const result = await findNonZeroPostingGroups(ctx);
			const alert = result.alerts.find(
				(a) => a.postingGroupId === postingGroupId
			);
			expect(alert).toBeDefined();
			expect(alert?.entryCount).toBe(2);
			// oldestEntryTimestamp should be a number (not null, since entries exist)
			expect(typeof alert?.oldestEntryTimestamp).toBe("number");
			expect(alert?.oldestEntryTimestamp).toBeGreaterThan(0);
		});
	});
});
