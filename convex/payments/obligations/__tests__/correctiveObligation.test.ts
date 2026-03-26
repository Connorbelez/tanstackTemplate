import { ConvexError } from "convex/values";
import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../../_generated/api";
import auditTrailSchema from "../../../components/auditTrail/schema";
import schema from "../../../schema";
import {
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "../../cashLedger/__tests__/testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
const auditTrailModules = import.meta.glob(
	"/convex/components/auditTrail/**/*.ts"
);

function createTestHarness() {
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	return t;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the error code from a ConvexError thrown in convex-test.
 * In convex-test, ConvexError.data may be serialized as a JSON string,
 * so we need to handle both object and string forms.
 */
function getConvexErrorCode(e: unknown): string {
	expect(e).toBeInstanceOf(ConvexError);
	if (!(e instanceof ConvexError)) {
		throw new Error("Expected ConvexError");
	}
	const data = e.data;
	if (typeof data === "string") {
		const parsed = JSON.parse(data) as { code?: string };
		return parsed.code ?? "";
	}
	if (typeof data === "object" && data !== null) {
		return (data as { code?: string }).code ?? "";
	}
	return "";
}

async function seedSettledObligation(
	t: ReturnType<typeof createTestHarness>,
	opts: {
		mortgageId: ReturnType<typeof seedMinimalEntities> extends Promise<infer R>
			? R extends { mortgageId: infer M }
				? M
				: never
			: never;
		borrowerId: ReturnType<typeof seedMinimalEntities> extends Promise<infer R>
			? R extends { borrowerId: infer B }
				? B
				: never
			: never;
		amount?: number;
		paymentNumber?: number;
		type?:
			| "regular_interest"
			| "arrears_cure"
			| "late_fee"
			| "principal_repayment";
	}
) {
	const amount = opts.amount ?? 100_000;
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("obligations", {
			status: "settled",
			mortgageId: opts.mortgageId,
			borrowerId: opts.borrowerId,
			paymentNumber: opts.paymentNumber ?? 1,
			type: opts.type ?? "regular_interest",
			amount,
			amountSettled: amount,
			dueDate: now - 86_400_000,
			gracePeriodEnd: now - 86_400_000,
			settledAt: now - 86_400_000,
			createdAt: now - 86_400_000,
		});
	});
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("correctiveObligation", () => {
	// T-020: Happy path — create corrective from settled obligation
	it("creates a corrective obligation with correct fields from a settled original", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const result = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-001",
				source: SYSTEM_SOURCE,
			}
		);

		expect(result.created).toBe(true);

		await t.run(async (ctx) => {
			const corrective = await ctx.db.get(result.obligationId);
			expect(corrective).not.toBeNull();
			expect(corrective?.status).toBe("upcoming");
			expect(corrective?.sourceObligationId).toBe(originalId);
			expect(corrective?.amount).toBe(100_000);
			expect(corrective?.type).toBe("regular_interest");
			expect(corrective?.mortgageId).toBe(mortgageId);
			expect(corrective?.borrowerId).toBe(borrowerId);
			expect(corrective?.paymentNumber).toBe(1);
			expect(corrective?.amountSettled).toBe(0);
		});
	});

	// T-021: Idempotency — second call returns existing, does not duplicate
	it("returns existing corrective without creating a duplicate on second call", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const first = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-002",
				source: SYSTEM_SOURCE,
			}
		);
		expect(first.created).toBe(true);

		const second = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal duplicate",
				postingGroupId: "pg-test-003",
				source: SYSTEM_SOURCE,
			}
		);

		expect(second.created).toBe(false);
		expect(second.obligationId).toBe(first.obligationId);

		// Verify only one corrective exists
		await t.run(async (ctx) => {
			const all = await ctx.db
				.query("obligations")
				.withIndex("by_source_obligation", (q) =>
					q.eq("sourceObligationId", originalId)
				)
				.collect();
			const correctives = all.filter((o) => o.type !== "late_fee");
			expect(correctives).toHaveLength(1);
		});
	});

	// T-022: Validation — non-settled status and invalid amounts
	it("throws INVALID_STATUS when original is not settled", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);

		const dueObligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "due",
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 100_000,
				amountSettled: 0,
				dueDate: Date.now(),
				gracePeriodEnd: Date.now() + 15 * 86_400_000,
				createdAt: Date.now(),
			});
		});

		try {
			await t.mutation(
				internal.payments.obligations.createCorrectiveObligation
					.createCorrectiveObligation,
				{
					originalObligationId: dueObligationId,
					reversedAmount: 100_000,
					reason: "should fail",
					postingGroupId: "pg-test-004",
					source: SYSTEM_SOURCE,
				}
			);
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("INVALID_STATUS");
		}
	});

	it("throws INVALID_AMOUNT when reversedAmount is zero or negative", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		// Zero amount
		try {
			await t.mutation(
				internal.payments.obligations.createCorrectiveObligation
					.createCorrectiveObligation,
				{
					originalObligationId: originalId,
					reversedAmount: 0,
					reason: "zero test",
					postingGroupId: "pg-test-006",
					source: SYSTEM_SOURCE,
				}
			);
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("INVALID_AMOUNT");
		}

		// Negative amount
		try {
			await t.mutation(
				internal.payments.obligations.createCorrectiveObligation
					.createCorrectiveObligation,
				{
					originalObligationId: originalId,
					reversedAmount: -500,
					reason: "negative test",
					postingGroupId: "pg-test-007",
					source: SYSTEM_SOURCE,
				}
			);
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("INVALID_AMOUNT");
		}
	});

	// T-023: Cash ledger integration — OBLIGATION_ACCRUED journal entry
	it("creates an OBLIGATION_ACCRUED journal entry for the corrective obligation", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const result = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-008",
				source: SYSTEM_SOURCE,
			}
		);

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", result.obligationId)
				)
				.collect();

			const accrualEntries = entries.filter(
				(e) => e.entryType === "OBLIGATION_ACCRUED"
			);
			expect(accrualEntries).toHaveLength(1);
			expect(Number(accrualEntries[0].amount)).toBe(100_000);
		});
	});

	// T-024: Queryable link — getCorrectiveObligations returns corrective, excludes late fees
	it("getCorrectiveObligations returns the corrective but not late_fee obligations", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const result = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-009",
				source: SYSTEM_SOURCE,
			}
		);

		// Seed a late_fee obligation with the same sourceObligationId
		await t.run(async (ctx) => {
			await ctx.db.insert("obligations", {
				status: "upcoming",
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "late_fee",
				amount: 5000,
				amountSettled: 0,
				dueDate: Date.now(),
				gracePeriodEnd: Date.now() + 15 * 86_400_000,
				sourceObligationId: originalId,
				feeCode: "late_fee",
				createdAt: Date.now(),
			});
		});

		const correctives = await t.query(
			internal.payments.obligations.queries.getCorrectiveObligations,
			{ sourceObligationId: originalId }
		);

		expect(correctives).toHaveLength(1);
		expect(correctives[0]._id).toBe(result.obligationId);
		expect(correctives[0].type).not.toBe("late_fee");
	});

	// T-026: Partial reversal — corrective amount matches the partial value
	it("creates corrective with partial reversal amount", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		const result = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 50_000, // partial reversal
				reason: "Partial NSF",
				postingGroupId: "pg-test-partial",
				source: SYSTEM_SOURCE,
			}
		);

		expect(result.created).toBe(true);
		await t.run(async (ctx) => {
			const corrective = await ctx.db.get(result.obligationId);
			expect(corrective?.amount).toBe(50_000);
		});
	});

	// T-027: getCorrectiveObligations returns empty array when no correctives exist
	it("getCorrectiveObligations returns empty array for obligation with no correctives", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const correctives = await t.query(
			internal.payments.obligations.queries.getCorrectiveObligations,
			{ sourceObligationId: originalId }
		);

		expect(correctives).toHaveLength(0);
	});

	// T-028: getObligationWithCorrectives — happy path
	it("getObligationWithCorrectives returns obligation and its correctives", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const result = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-with-correctives",
				source: SYSTEM_SOURCE,
			}
		);

		const data = await t.query(
			internal.payments.obligations.queries.getObligationWithCorrectives,
			{ obligationId: originalId }
		);

		expect(data).not.toBeNull();
		expect(data?.obligation._id).toBe(originalId);
		expect(data?.correctives).toHaveLength(1);
		expect(data?.correctives[0]._id).toBe(result.obligationId);
	});

	// T-029: getObligationWithCorrectives — non-existent obligation returns null
	it("getObligationWithCorrectives returns null for non-existent obligation", async () => {
		const t = createTestHarness();
		// Use a fake ID by seeding then deleting
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const tempId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("obligations", {
				status: "upcoming",
				mortgageId,
				borrowerId,
				paymentNumber: 999,
				type: "regular_interest",
				amount: 1,
				amountSettled: 0,
				dueDate: Date.now(),
				gracePeriodEnd: Date.now(),
				createdAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		const data = await t.query(
			internal.payments.obligations.queries.getObligationWithCorrectives,
			{ obligationId: tempId }
		);

		expect(data).toBeNull();
	});

	// T-030: Corrective includes GT fields (lastTransitionAt, machineContext)
	it("corrective obligation includes lastTransitionAt and machineContext fields", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const result = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-gt-fields",
				source: SYSTEM_SOURCE,
			}
		);

		await t.run(async (ctx) => {
			const corrective = await ctx.db.get(result.obligationId);
			expect(corrective?.lastTransitionAt).toBeTypeOf("number");
			expect(corrective?.lastTransitionAt).toBeGreaterThan(0);
			// machineContext is undefined (initial state)
			expect(corrective?.machineContext).toBeUndefined();
		});
	});

	// T-031: Audit journal entry created for corrective obligation
	it("creates an audit journal entry for the corrective obligation", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
		});

		const result = await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 100_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-audit",
				source: SYSTEM_SOURCE,
			}
		);

		await t.run(async (ctx) => {
			const journalEntries = await ctx.db
				.query("auditJournal")
				.filter((q) => q.eq(q.field("entityId"), result.obligationId as string))
				.collect();
			expect(journalEntries.length).toBeGreaterThanOrEqual(1);
			const created = journalEntries.find((e) => e.eventType === "CREATED");
			expect(created).toBeDefined();
			expect(created?.newState).toBe("upcoming");
			expect(created?.entityType).toBe("obligation");
		});
	});

	// T-025: Original unchanged — settled status, amount, amountSettled preserved
	it("does not modify the original obligation after corrective creation", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMinimalEntities(t);
		const originalId = await seedSettledObligation(t, {
			mortgageId,
			borrowerId,
			amount: 200_000,
		});

		// Capture original state before corrective creation
		const originalBefore = await t.run(async (ctx) => {
			return ctx.db.get(originalId);
		});

		await t.mutation(
			internal.payments.obligations.createCorrectiveObligation
				.createCorrectiveObligation,
			{
				originalObligationId: originalId,
				reversedAmount: 200_000,
				reason: "NSF reversal",
				postingGroupId: "pg-test-010",
				source: SYSTEM_SOURCE,
			}
		);

		await t.run(async (ctx) => {
			const originalAfter = await ctx.db.get(originalId);
			expect(originalAfter).not.toBeNull();
			expect(originalAfter?.status).toBe("settled");
			expect(originalAfter?.amount).toBe(200_000);
			expect(originalAfter?.amountSettled).toBe(200_000);
			// Timestamps should be unchanged
			expect(originalAfter?.settledAt).toBe(originalBefore?.settledAt);
			expect(originalAfter?.createdAt).toBe(originalBefore?.createdAt);
		});
	});
});
