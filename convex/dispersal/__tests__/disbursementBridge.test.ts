/**
 * Disbursement Bridge tests — validates helper functions, query logic,
 * mutation behaviour, idempotency, and the disbursement gate integration
 * for ENG-206 and ENG-219.
 *
 * The bridge converts pending dispersalEntries into outbound
 * transferRequests of type `lender_dispersal_payout`.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";
import { buildDisbursementIdempotencyKey } from "../disbursementBridge";

const modules = convexModules;

const DISBURSEMENT_PREFIX_RE = /^disbursement:/;

// ═══════════════════════════════════════════════════════════════════════
// Types & Helpers
// ═══════════════════════════════════════════════════════════════════════

type TestHarness = ReturnType<typeof convexTest>;

interface SeedResult {
	borrowerId: Id<"borrowers">;
	brokerId: Id<"brokers">;
	lenderAAccountId: Id<"ledger_accounts">;
	lenderAId: Id<"lenders">;
	lenderBId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
}

/**
 * Extracts the error code from a ConvexError thrown through t.mutation().
 * convex-test serializes ConvexError.data as a JSON string, so we need
 * to parse it to access structured fields like `code`.
 */
function getConvexErrorCode(e: unknown): string | undefined {
	if (!(e instanceof ConvexError)) {
		return undefined;
	}
	const raw = e.data;
	if (typeof raw === "object" && raw !== null && "code" in raw) {
		return (raw as { code: string }).code;
	}
	// convex-test serializes data as JSON string
	if (typeof raw === "string") {
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			if (typeof parsed === "object" && parsed !== null && "code" in parsed) {
				return parsed.code as string;
			}
		} catch {
			// not JSON
		}
	}
	return undefined;
}

// ═══════════════════════════════════════════════════════════════════════
// Harness & Seed Helpers
// ═══════════════════════════════════════════════════════════════════════

function createHarness() {
	// Disable hash-chain — tests don't register workflow components
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	// Enable mock providers so the bridge's mock_eft check passes
	process.env.ENABLE_MOCK_PROVIDERS = "true";
	return convexTest(schema, modules);
}

/**
 * Seeds all entities required by processSingleDisbursement:
 * broker, borrower, lender, property, mortgage, obligation,
 * ledger ownership account, and a pending dispersal entry with
 * a LENDER_PAYABLE cash ledger balance.
 */
async function seedFullScenario(
	t: TestHarness,
	options: {
		entryAmount?: number;
		payoutEligibleAfter?: string;
		dispersalDate?: string;
		entryStatus?: "pending" | "eligible" | "disbursed" | "failed";
	} = {}
): Promise<SeedResult & { dispersalEntryId: Id<"dispersalEntries"> }> {
	const entryAmount = options.entryAmount ?? 45_000;
	const dispersalDate = options.dispersalDate ?? "2026-03-01";
	const entryStatus = options.entryStatus ?? "pending";

	return t.run(async (ctx) => {
		const now = Date.now();

		// Broker
		const brokerUserId = await ctx.db.insert("users", {
			authId: `broker-${now}`,
			email: `broker-${now}@fairlend.test`,
			firstName: "Broker",
			lastName: "Tester",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		// Borrower
		const borrowerUserId = await ctx.db.insert("users", {
			authId: `borrower-${now}`,
			email: `borrower-${now}@fairlend.test`,
			firstName: "Borrower",
			lastName: "Tester",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		// Lender A
		const lenderAUserId = await ctx.db.insert("users", {
			authId: `lender-a-${now}`,
			email: `lender-a-${now}@fairlend.test`,
			firstName: "Lender",
			lastName: "A",
		});
		const lenderAId = await ctx.db.insert("lenders", {
			userId: lenderAUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-a",
			status: "active",
			createdAt: now,
		});

		// Lender B
		const lenderBUserId = await ctx.db.insert("users", {
			authId: `lender-b-${now}`,
			email: `lender-b-${now}@fairlend.test`,
			firstName: "Lender",
			lastName: "B",
		});
		const lenderBId = await ctx.db.insert("lenders", {
			userId: lenderBUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-b",
			status: "active",
			createdAt: now,
		});

		// Property
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "1 Bridge Test Street",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V1E1",
			propertyType: "residential",
			createdAt: now,
		});

		// Mortgage
		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			machineContext: { missedPayments: 0, lastPaymentAt: 0 },
			lastTransitionAt: now,
			propertyId,
			principal: 10_000_000,
			interestRate: 0.1,
			annualServicingRate: 0.01,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2026-12-31",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: now,
		});

		// Obligation (settled)
		const obligationId = await ctx.db.insert("obligations", {
			status: "settled",
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: 83_333,
			amountSettled: 83_333,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			settledAt: Date.parse("2026-03-01T00:00:00Z"),
			createdAt: now,
		});

		// Ownership ledger account for lender A
		const lenderAAccountId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: lenderAId as unknown as string,
			cumulativeDebits: 6000n,
			cumulativeCredits: 0n,
			pendingDebits: 0n,
			pendingCredits: 0n,
			createdAt: now,
		});

		// LENDER_PAYABLE cash account — balance gate needs this.
		// LENDER_PAYABLE is a credit-normal account: balance = credits - debits.
		await ctx.db.insert("cash_ledger_accounts", {
			family: "LENDER_PAYABLE",
			mortgageId,
			lenderId: lenderAId,
			cumulativeDebits: 0n,
			cumulativeCredits: BigInt(entryAmount),
			createdAt: now,
		});

		// Dispersal entry
		const dispersalEntryId = await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: lenderAId,
			lenderAccountId: lenderAAccountId,
			amount: entryAmount,
			dispersalDate,
			obligationId,
			servicingFeeDeducted: 8333,
			status: entryStatus,
			idempotencyKey: `test:disbursement:${now}`,
			calculationDetails: {
				settledAmount: 83_333,
				servicingFee: 8333,
				distributableAmount: 75_000,
				ownershipUnits: 6000,
				totalUnits: 10_000,
				ownershipFraction: 0.6,
				rawAmount: 45_000,
				roundedAmount: 45_000,
			},
			payoutEligibleAfter: options.payoutEligibleAfter,
			createdAt: now,
		});

		return {
			brokerId,
			borrowerId,
			lenderAId,
			lenderBId,
			mortgageId,
			obligationId,
			lenderAAccountId,
			dispersalEntryId,
		};
	});
}

// ═══════════════════════════════════════════════════════════════════════
// T-010: Unit tests for buildDisbursementIdempotencyKey
// ═══════════════════════════════════════════════════════════════════════

describe("buildDisbursementIdempotencyKey", () => {
	it("returns disbursement:{id} format", () => {
		const fakeId = "abc123" as Id<"dispersalEntries">;
		expect(buildDisbursementIdempotencyKey(fakeId)).toBe("disbursement:abc123");
	});

	it("is deterministic for the same ID", () => {
		const id = "entry_001" as Id<"dispersalEntries">;
		const k1 = buildDisbursementIdempotencyKey(id);
		const k2 = buildDisbursementIdempotencyKey(id);
		expect(k1).toBe(k2);
	});

	it("produces different keys for different IDs", () => {
		const id1 = "entry_001" as Id<"dispersalEntries">;
		const id2 = "entry_002" as Id<"dispersalEntries">;
		expect(buildDisbursementIdempotencyKey(id1)).not.toBe(
			buildDisbursementIdempotencyKey(id2)
		);
	});

	it("starts with disbursement: prefix", () => {
		const id = "xyz" as Id<"dispersalEntries">;
		expect(buildDisbursementIdempotencyKey(id)).toMatch(DISBURSEMENT_PREFIX_RE);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// T-011: Happy path — pending entry -> bridge creates transfer
// ═══════════════════════════════════════════════════════════════════════

describe("processSingleDisbursement — happy path", () => {
	it("creates an outbound transfer for a pending dispersal entry", async () => {
		const t = createHarness();
		const { dispersalEntryId, lenderAId, mortgageId, obligationId } =
			await seedFullScenario(t, {
				entryAmount: 45_000,
				payoutEligibleAfter: "2026-02-28",
			});

		const result = await t.mutation(
			internal.dispersal.disbursementBridge.processSingleDisbursement,
			{
				dispersalEntryId,
				providerCode: "mock_eft",
			}
		);

		expect(result.created).toBe(true);
		expect(result.transferId).toBeDefined();

		// Verify the transfer record shape
		const transfer = (await t.run(async (ctx) => {
			return ctx.db.get(result.transferId);
		})) as Doc<"transferRequests"> | null;

		if (!transfer) {
			throw new Error("Transfer not found — expected to be inserted by bridge");
		}
		expect(transfer.status).toBe("initiated");
		expect(transfer.direction).toBe("outbound");
		expect(transfer.transferType).toBe("lender_dispersal_payout");
		expect(transfer.amount).toBe(45_000);
		expect(transfer.currency).toBe("CAD");
		expect(transfer.counterpartyType).toBe("lender");
		expect(transfer.providerCode).toBe("mock_eft");
		expect(transfer.dispersalEntryId).toBe(dispersalEntryId);
		expect(transfer.lenderId).toBe(lenderAId);
		expect(transfer.mortgageId).toBe(mortgageId);
		expect(transfer.obligationId).toBe(obligationId);
		expect(transfer.idempotencyKey).toBe(
			buildDisbursementIdempotencyKey(dispersalEntryId)
		);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// T-012: Idempotency — running bridge twice for same entry
// ═══════════════════════════════════════════════════════════════════════

describe("processSingleDisbursement — idempotency", () => {
	it("returns existing transfer without creating a duplicate", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryAmount: 45_000,
			payoutEligibleAfter: "2026-02-28",
		});

		// First call — creates the transfer
		const first = await t.mutation(
			internal.dispersal.disbursementBridge.processSingleDisbursement,
			{
				dispersalEntryId,
				providerCode: "mock_eft",
			}
		);
		expect(first.created).toBe(true);

		// Second call — idempotent, returns the same transfer
		const second = await t.mutation(
			internal.dispersal.disbursementBridge.processSingleDisbursement,
			{
				dispersalEntryId,
				providerCode: "mock_eft",
			}
		);
		expect(second.created).toBe(false);
		expect(second.transferId).toBe(first.transferId);

		// Verify only one transfer exists
		const transfers = await t.run(async (ctx) => {
			return ctx.db
				.query("transferRequests")
				.withIndex("by_idempotency", (q) =>
					q.eq(
						"idempotencyKey",
						buildDisbursementIdempotencyKey(dispersalEntryId)
					)
				)
				.collect();
		});
		expect(transfers).toHaveLength(1);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// T-013: Disbursement gate — amount exceeding LENDER_PAYABLE rejected
// ═══════════════════════════════════════════════════════════════════════

describe("processSingleDisbursement — disbursement gate", () => {
	it("rejects entry whose amount exceeds LENDER_PAYABLE balance", async () => {
		const t = createHarness();

		// Seed with entry amount 70_000 (within distributableAmount of 75_000
		// so the AMOUNT_EXCEEDS_DISTRIBUTABLE assertion passes).
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryAmount: 70_000,
			payoutEligibleAfter: "2026-02-28",
		});

		// The seedFullScenario sets LENDER_PAYABLE credit to entryAmount (70k).
		// Reduce the credit balance to 50k so the gate rejects the 70k disbursement.
		await t.run(async (ctx) => {
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
				.collect();
			for (const acct of accounts) {
				// Credit-normal: balance = credits - debits = 50k - 0 = 50k
				await ctx.db.patch(acct._id, {
					cumulativeDebits: 0n,
					cumulativeCredits: 50_000n,
				});
			}
		});

		try {
			await t.mutation(
				internal.dispersal.disbursementBridge.processSingleDisbursement,
				{
					dispersalEntryId,
					providerCode: "mock_eft",
				}
			);
			// Should not reach here
			expect.unreachable("Expected DISBURSEMENT_EXCEEDS_PAYABLE error");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			expect(getConvexErrorCode(e)).toBe("DISBURSEMENT_EXCEEDS_PAYABLE");
		}
	});

	it("rejects entry with zero amount", async () => {
		const t = createHarness();

		// Seed a normal scenario then patch entry amount to 0
		const seed = await seedFullScenario(t, { entryAmount: 45_000 });

		await t.run(async (ctx) => {
			await ctx.db.patch(seed.dispersalEntryId, { amount: 0 });
		});

		try {
			await t.mutation(
				internal.dispersal.disbursementBridge.processSingleDisbursement,
				{
					dispersalEntryId: seed.dispersalEntryId,
					providerCode: "mock_eft",
				}
			);
			expect.unreachable("Expected INVALID_AMOUNT error");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			expect(getConvexErrorCode(e)).toBe("INVALID_AMOUNT");
		}
	});

	it("rejects entry with negative amount", async () => {
		const t = createHarness();

		const seed = await seedFullScenario(t, { entryAmount: 45_000 });

		await t.run(async (ctx) => {
			await ctx.db.patch(seed.dispersalEntryId, { amount: -100 });
		});

		try {
			await t.mutation(
				internal.dispersal.disbursementBridge.processSingleDisbursement,
				{
					dispersalEntryId: seed.dispersalEntryId,
					providerCode: "mock_eft",
				}
			);
			expect.unreachable("Expected INVALID_AMOUNT error");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			expect(getConvexErrorCode(e)).toBe("INVALID_AMOUNT");
		}
	});
});

// ═══════════════════════════════════════════════════════════════════════
// T-014: Failed entry — resetFailedEntry sets status back to pending
// ═══════════════════════════════════════════════════════════════════════

describe("resetFailedEntry", () => {
	it("resets a failed entry back to pending status", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "failed",
		});

		const result = await t.mutation(
			internal.dispersal.disbursementBridge.resetFailedEntry,
			{ dispersalEntryId }
		);

		expect(result.newStatus).toBe("pending");
		expect(result.dispersalEntryId).toBe(dispersalEntryId);

		// Verify persistence
		const entry = await t.run(async (ctx) => {
			return ctx.db.get(dispersalEntryId);
		});
		if (!entry) {
			throw new Error("Entry not found after reset");
		}
		expect(entry.status).toBe("pending");
	});

	it("clears payoutDate when resetting", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "failed",
		});

		// Set a payoutDate to verify it gets cleared
		await t.run(async (ctx) => {
			await ctx.db.patch(dispersalEntryId, { payoutDate: "2026-03-15" });
		});

		await t.mutation(internal.dispersal.disbursementBridge.resetFailedEntry, {
			dispersalEntryId,
		});

		const entry = await t.run(async (ctx) => {
			return ctx.db.get(dispersalEntryId);
		});
		if (!entry) {
			throw new Error("Entry not found after reset");
		}
		expect(entry.payoutDate).toBeUndefined();
	});

	it("throws ENTRY_NOT_FAILED for pending entry", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "pending",
		});

		try {
			await t.mutation(internal.dispersal.disbursementBridge.resetFailedEntry, {
				dispersalEntryId,
			});
			expect.unreachable("Expected ENTRY_NOT_FAILED error");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			expect(getConvexErrorCode(e)).toBe("ENTRY_NOT_FAILED");
		}
	});

	it("throws ENTRY_NOT_FOUND for nonexistent entry", async () => {
		const t = createHarness();
		// Seed scenario just to initialise the DB, then use a fake ID
		await seedFullScenario(t);

		// Get a valid-looking but nonexistent ID by using a real entry then deleting it
		const fakeId = await t.run(async (ctx) => {
			const mortgage = await ctx.db.query("mortgages").first();
			const lender = await ctx.db.query("lenders").first();
			const account = await ctx.db.query("ledger_accounts").first();
			const obligation = await ctx.db.query("obligations").first();
			if (!mortgage) {
				throw new Error("Mortgage not found");
			}
			if (!lender) {
				throw new Error("Lender not found");
			}
			if (!account) {
				throw new Error("Account not found");
			}
			if (!obligation) {
				throw new Error("Obligation not found");
			}
			const tempId = await ctx.db.insert("dispersalEntries", {
				mortgageId: mortgage._id,
				lenderId: lender._id,
				lenderAccountId: account._id,
				amount: 1,
				dispersalDate: "2026-01-01",
				obligationId: obligation._id,
				servicingFeeDeducted: 0,
				status: "failed",
				idempotencyKey: "temp-for-delete",
				calculationDetails: {
					settledAmount: 1,
					servicingFee: 0,
					distributableAmount: 1,
					ownershipUnits: 1,
					totalUnits: 1,
					ownershipFraction: 1,
					rawAmount: 1,
					roundedAmount: 1,
				},
				createdAt: Date.now(),
			});
			await ctx.db.delete(tempId);
			return tempId;
		});

		try {
			await t.mutation(internal.dispersal.disbursementBridge.resetFailedEntry, {
				dispersalEntryId: fakeId,
			});
			expect.unreachable("Expected ENTRY_NOT_FOUND error");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			expect(getConvexErrorCode(e)).toBe("ENTRY_NOT_FOUND");
		}
	});
});

// ═══════════════════════════════════════════════════════════════════════
// T-015: ENG-219 guard — bridge uses entry.amount as-is
// ═══════════════════════════════════════════════════════════════════════

describe("processSingleDisbursement — ENG-219 amount passthrough", () => {
	it("uses the entry amount as-is without recomputation", async () => {
		const t = createHarness();

		// Seed with a specific entry amount that differs from what
		// a fresh pro-rata calculation would produce. The bridge must
		// use entry.amount directly, not recompute from ownership.
		const customAmount = 12_345;
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryAmount: customAmount,
			payoutEligibleAfter: "2026-02-28",
		});

		const result = await t.mutation(
			internal.dispersal.disbursementBridge.processSingleDisbursement,
			{
				dispersalEntryId,
				providerCode: "mock_eft",
			}
		);

		expect(result.created).toBe(true);

		// Verify the transfer amount matches the entry amount exactly
		const transfer = (await t.run(async (ctx) => {
			return ctx.db.get(result.transferId);
		})) as Doc<"transferRequests"> | null;
		if (!transfer) {
			throw new Error("Transfer not found");
		}
		expect(transfer.amount).toBe(customAmount);
	});

	it("preserves amount even when calculationDetails.roundedAmount differs", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryAmount: 30_000,
			payoutEligibleAfter: "2026-02-28",
		});

		// Patch the entry's amount to differ from calculationDetails.roundedAmount
		// This simulates an edge case where the entry amount was overridden
		await t.run(async (ctx) => {
			await ctx.db.patch(dispersalEntryId, { amount: 29_999 });
			// Also patch the payable balance down to match (credit-normal)
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
				.collect();
			for (const acct of accounts) {
				await ctx.db.patch(acct._id, {
					cumulativeCredits: 29_999n,
					cumulativeDebits: 0n,
				});
			}
		});

		const result = await t.mutation(
			internal.dispersal.disbursementBridge.processSingleDisbursement,
			{
				dispersalEntryId,
				providerCode: "mock_eft",
			}
		);

		const transfer = (await t.run(async (ctx) => {
			return ctx.db.get(result.transferId);
		})) as Doc<"transferRequests"> | null;

		// The bridge MUST use entry.amount (29_999), not
		// calculationDetails.roundedAmount (30_000)
		if (!transfer) {
			throw new Error("Transfer not found");
		}
		expect(transfer.amount).toBe(29_999);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// findEligibleEntriesInternal
// ═══════════════════════════════════════════════════════════════════════

describe("findEligibleEntriesInternal", () => {
	it("finds pending entries with hold period passed", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-02-28",
		});

		const results: Doc<"dispersalEntries">[] = await t.query(
			internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
			{ asOfDate: "2026-03-01" }
		);

		expect(results.length).toBeGreaterThanOrEqual(1);
		const found = results.find((e) => e._id === dispersalEntryId);
		expect(found).toBeDefined();
	});

	it("excludes entries whose hold period has not passed", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-03-15",
		});

		const results: Doc<"dispersalEntries">[] = await t.query(
			internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
			{ asOfDate: "2026-03-01" }
		);

		const found = results.find((e) => e._id === dispersalEntryId);
		expect(found).toBeUndefined();
	});

	it("includes legacy entries without payoutEligibleAfter", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "pending",
			// No payoutEligibleAfter — legacy entry
		});

		const results: Doc<"dispersalEntries">[] = await t.query(
			internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
			{ asOfDate: "2026-03-01" }
		);

		const found = results.find((e) => e._id === dispersalEntryId);
		expect(found).toBeDefined();
	});

	it("excludes non-pending entries", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "failed",
			payoutEligibleAfter: "2026-02-28",
		});

		const results: Doc<"dispersalEntries">[] = await t.query(
			internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
			{ asOfDate: "2026-03-01" }
		);

		const found = results.find((e) => e._id === dispersalEntryId);
		expect(found).toBeUndefined();
	});

	it("respects limit parameter", async () => {
		const t = createHarness();

		// Seed 3 entries
		await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-02-20",
			dispersalDate: "2026-02-20",
		});
		await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-02-21",
			dispersalDate: "2026-02-21",
		});
		await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-02-22",
			dispersalDate: "2026-02-22",
		});

		const results: Doc<"dispersalEntries">[] = await t.query(
			internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
			{ asOfDate: "2026-03-01", limit: 2 }
		);

		expect(results).toHaveLength(2);
	});

	it("filters by lenderId when provided", async () => {
		const t = createHarness();

		const seedA = await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-02-28",
		});

		const seedB = await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-02-28",
		});

		// Filter to lender A only
		const results: Doc<"dispersalEntries">[] = await t.query(
			internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
			{ asOfDate: "2026-03-01", lenderId: seedA.lenderAId }
		);

		const hasA = results.some((e) => e.lenderId === seedA.lenderAId);
		const hasB = results.some((e) => e.lenderId === seedB.lenderAId);
		expect(hasA).toBe(true);
		expect(hasB).toBe(false);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// processSingleDisbursement — entry status guards
// ═══════════════════════════════════════════════════════════════════════

describe("processSingleDisbursement — entry status guards", () => {
	it("throws ENTRY_NOT_PENDING for a failed entry", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "failed",
		});

		try {
			await t.mutation(
				internal.dispersal.disbursementBridge.processSingleDisbursement,
				{
					dispersalEntryId,
					providerCode: "mock_eft",
				}
			);
			expect.unreachable("Expected ENTRY_NOT_PENDING error");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			expect(getConvexErrorCode(e)).toBe("ENTRY_NOT_PENDING");
		}
	});

	it("throws ENTRY_NOT_PENDING for a disbursed entry", async () => {
		const t = createHarness();
		const { dispersalEntryId } = await seedFullScenario(t, {
			entryStatus: "disbursed",
		});

		try {
			await t.mutation(
				internal.dispersal.disbursementBridge.processSingleDisbursement,
				{
					dispersalEntryId,
					providerCode: "mock_eft",
				}
			);
			expect.unreachable("Expected ENTRY_NOT_PENDING error");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			expect(getConvexErrorCode(e)).toBe("ENTRY_NOT_PENDING");
		}
	});
});

// ═══════════════════════════════════════════════════════════════════════
// checkDisbursementsDue
// ═══════════════════════════════════════════════════════════════════════

describe("checkDisbursementsDue", () => {
	it("runs without error when eligible entries exist", async () => {
		const t = createHarness();
		await seedFullScenario(t, {
			entryStatus: "pending",
			payoutEligibleAfter: "2026-02-28",
		});

		// Should not throw — it only logs
		await t.mutation(
			internal.dispersal.disbursementBridge.checkDisbursementsDue,
			{}
		);
	});

	it("runs without error when no entries exist", async () => {
		const t = createHarness();
		// Empty DB — should not throw
		await t.mutation(
			internal.dispersal.disbursementBridge.checkDisbursementsDue,
			{}
		);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// T-006 / T-007: ENG-219 — effective-date ownership snapshot
// ═══════════════════════════════════════════════════════════════════════

describe("ENG-219: effective-date ownership snapshot", () => {
	it("reroute after dispersal calculation but before disbursement does NOT change amount", async () => {
		const t = createHarness();
		const seed = await seedFullScenario(t, {
			entryAmount: 45_000,
			payoutEligibleAfter: "2026-02-28",
		});

		// Read original entry to record its amount
		const originalEntry = await t.run(async (ctx) => {
			return ctx.db.get(seed.dispersalEntryId);
		});
		if (!originalEntry) {
			throw new Error("Original entry not found");
		}
		expect(originalEntry.amount).toBe(45_000);

		// Insert a deal reroute AFTER the dispersal entry was created.
		// The bridge should still use entry.amount unchanged.
		await t.run(async (ctx) => {
			const dealId = await ctx.db.insert("deals", {
				status: "confirmed",
				mortgageId: seed.mortgageId,
				buyerId: "new-buyer-auth",
				sellerId: "seller-auth",
				fractionalShare: 3000,
				closingDate: Date.now(),
				lawyerId: "test-lawyer",
				lawyerType: "platform_lawyer",
				createdAt: Date.now(),
				createdBy: "test-admin",
			});
			await ctx.db.insert("dealReroutes", {
				dealId,
				mortgageId: seed.mortgageId,
				fromOwnerId: "seller-auth",
				toOwnerId: "new-buyer-auth",
				fractionalShare: 3000,
				effectiveAfterDate: "2026-03-01",
				createdAt: Date.now(),
			});
		});

		// Run the disbursement bridge
		const result = await t.mutation(
			internal.dispersal.disbursementBridge.processSingleDisbursement,
			{
				dispersalEntryId: seed.dispersalEntryId,
				providerCode: "mock_eft",
			}
		);

		expect(result.created).toBe(true);

		// Verify transfer.amount === 45_000 (original, not recomputed)
		const transfer = (await t.run(async (ctx) => {
			return ctx.db.get(result.transferId);
		})) as Doc<"transferRequests"> | null;
		if (!transfer) {
			throw new Error("Transfer not found");
		}
		expect(transfer.amount).toBe(45_000);
	});

	it("rejects entry with invalid calculationDetails", async () => {
		const t = createHarness();
		const seed = await seedFullScenario(t, {
			entryAmount: 45_000,
			payoutEligibleAfter: "2026-02-28",
		});

		// Patch the entry's calculationDetails to have settledAmount: 0
		await t.run(async (ctx) => {
			const entry = await ctx.db.get(seed.dispersalEntryId);
			if (!entry) {
				throw new Error("Entry not found");
			}
			await ctx.db.patch(seed.dispersalEntryId, {
				calculationDetails: {
					...entry.calculationDetails,
					settledAmount: 0,
				},
			});
		});

		try {
			await t.mutation(
				internal.dispersal.disbursementBridge.processSingleDisbursement,
				{
					dispersalEntryId: seed.dispersalEntryId,
					providerCode: "mock_eft",
				}
			);
			expect.unreachable("Expected MISSING_CALCULATION_DETAILS error");
		} catch (e) {
			if (!(e instanceof ConvexError)) {
				throw e;
			}
			expect(getConvexErrorCode(e)).toBe("MISSING_CALCULATION_DETAILS");
		}
	});

	it("rejects entry whose amount exceeds distributableAmount", async () => {
		const t = createHarness();
		const seed = await seedFullScenario(t, {
			entryAmount: 45_000,
			payoutEligibleAfter: "2026-02-28",
		});

		// Patch entry amount to exceed distributableAmount (75_000 from seed).
		// Also increase LENDER_PAYABLE so the balance gate is not a confounding factor.
		await t.run(async (ctx) => {
			await ctx.db.patch(seed.dispersalEntryId, { amount: 100_000 });
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
				.collect();
			for (const acct of accounts) {
				await ctx.db.patch(acct._id, { cumulativeCredits: 100_000n });
			}
		});

		try {
			await t.mutation(
				internal.dispersal.disbursementBridge.processSingleDisbursement,
				{
					dispersalEntryId: seed.dispersalEntryId,
					providerCode: "mock_eft",
				}
			);
			expect.unreachable("Expected AMOUNT_EXCEEDS_DISTRIBUTABLE error");
		} catch (e) {
			if (!(e instanceof ConvexError)) {
				throw e;
			}
			expect(getConvexErrorCode(e)).toBe("AMOUNT_EXCEEDS_DISTRIBUTABLE");
		}
	});
});
