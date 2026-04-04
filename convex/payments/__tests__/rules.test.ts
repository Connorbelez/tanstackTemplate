import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { RuleEvalContext } from "../collectionPlan/engine";
import { lateFeeRuleHandler } from "../collectionPlan/rules/lateFeeRule";
import { retryRuleHandler } from "../collectionPlan/rules/retryRule";
import { scheduleRuleHandler } from "../collectionPlan/rules/scheduleRule";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function mockRule(
	overrides: Partial<Doc<"collectionRules">> = {}
): Doc<"collectionRules"> {
	return {
		_id: "rule_1" as Id<"collectionRules">,
		_creationTime: Date.now(),
		kind: "schedule",
		code: "schedule_rule",
		displayName: "Initial scheduling",
		description:
			"Creates initial collection plan entries for upcoming obligations.",
		name: "schedule_rule",
		status: "active",
		scope: { scopeType: "global" },
		trigger: "schedule",
		config: { kind: "schedule", delayDays: 5 },
		version: 1,
		action: "create_plan_entry",
		parameters: { delayDays: 5 },
		priority: 10,
		enabled: true,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	};
}

function mockObligation(
	overrides: Partial<Doc<"obligations">> = {}
): Doc<"obligations"> {
	return {
		_id: "obligation_1" as Id<"obligations">,
		_creationTime: Date.now(),
		status: "upcoming",
		mortgageId: "mortgage_1" as Id<"mortgages">,
		borrowerId: "borrower_1" as Id<"borrowers">,
		paymentNumber: 1,
		type: "regular_interest",
		amount: 100_000,
		amountSettled: 0,
		dueDate: Date.now() + 3 * MS_PER_DAY,
		gracePeriodEnd: Date.now() + 18 * MS_PER_DAY,
		createdAt: Date.now(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// ScheduleRule
// ---------------------------------------------------------------------------

describe("ScheduleRule", () => {
	let runMutation: ReturnType<typeof vi.fn>;
	let ctx: ActionCtx;
	let rule: Doc<"collectionRules">;

	beforeEach(() => {
		runMutation = vi.fn().mockResolvedValue("mock_entry_id");
		ctx = { runMutation } as unknown as ActionCtx;
		rule = mockRule();
	});

	it("delegates canonical initial scheduling to the shared scheduling mutation", async () => {
		await scheduleRuleHandler.evaluate(ctx, {
			rule,
			mortgageId: "mortgage_1" as Id<"mortgages">,
		});

		expect(runMutation).toHaveBeenCalledOnce();
		expect(runMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				mortgageId: "mortgage_1",
				delayDays: 5,
				ruleId: rule._id,
			})
		);
	});

	it("uses the rule delayDays parameter when delegating", async () => {
		await scheduleRuleHandler.evaluate(ctx, {
			rule: mockRule({
				config: { kind: "schedule", delayDays: 9 },
				parameters: { delayDays: 5 },
			}),
			mortgageId: "mortgage_1" as Id<"mortgages">,
		});

		expect(runMutation).toHaveBeenCalledOnce();
		expect(runMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				mortgageId: "mortgage_1",
				delayDays: 9,
			})
		);
	});
});

// ---------------------------------------------------------------------------
// RetryRule
// ---------------------------------------------------------------------------

describe("RetryRule", () => {
	let runQuery: ReturnType<typeof vi.fn>;
	let runMutation: ReturnType<typeof vi.fn>;
	let ctx: ActionCtx;

	beforeEach(() => {
		runQuery = vi.fn();
		runMutation = vi.fn().mockResolvedValue("mock_entry_id");
		ctx = { runQuery, runMutation } as unknown as ActionCtx;
	});

	function retryEvalCtx(
		overrides: Partial<RuleEvalContext> = {}
	): RuleEvalContext {
		return {
			rule: mockRule({
				kind: "retry",
				code: "retry_rule",
				displayName: "Retry collection",
				description:
					"Schedules retry collection plan entries after failed attempts.",
				name: "retry_rule",
				status: "active",
				scope: { scopeType: "global" },
				trigger: "event",
				config: { kind: "retry", maxRetries: 3, backoffBaseDays: 3 },
				version: 1,
				action: "create_retry_entry",
				parameters: { maxRetries: 3, backoffBaseDays: 3 },
				priority: 20,
			}),
			eventType: "COLLECTION_FAILED",
			eventPayload: {
				planEntryId: "entry_1" as Id<"collectionPlanEntries">,
				obligationIds: ["obligation_1" as Id<"obligations">],
				amount: 100_000,
				method: "manual",
				retryCount: 0,
			},
			...overrides,
		};
	}

	it("creates retry entry on COLLECTION_FAILED with correct backoff", async () => {
		const evalCtx = retryEvalCtx();
		const before = Date.now();

		await retryRuleHandler.evaluate(ctx, evalCtx);

		expect(runMutation).toHaveBeenCalledOnce();
		const args = runMutation.mock.calls[0][1] as Record<string, unknown>;
		expect(args.status).toBe("planned");
		expect(args.source).toBe("retry_rule");
		expect(args.rescheduledFromId).toBe("entry_1");
		// retryCount=0, backoffBaseDays=3 => delay = 3 * 2^0 * MS_PER_DAY = 3 days
		const expectedDelay = 3 * 2 ** 0 * MS_PER_DAY;
		expect(args.scheduledDate).toBeGreaterThanOrEqual(before + expectedDelay);
	});

	it("respects maxRetries: retryCount >= maxRetries creates no entry", async () => {
		const evalCtx = retryEvalCtx({
			eventPayload: {
				planEntryId: "entry_1" as Id<"collectionPlanEntries">,
				obligationIds: ["obligation_1" as Id<"obligations">],
				amount: 100_000,
				method: "manual",
				retryCount: 3, // equals maxRetries
			},
		});

		await retryRuleHandler.evaluate(ctx, evalCtx);

		expect(runMutation).not.toHaveBeenCalled();
	});

	it("exponential backoff calculation: verify delay pattern", async () => {
		const backoffBaseDays = 3;
		const rule = mockRule({
			kind: "retry",
			code: "retry_rule",
			displayName: "Retry collection",
			name: "retry_rule",
			status: "active",
			scope: { scopeType: "global" },
			trigger: "event",
			config: { kind: "retry", maxRetries: 5, backoffBaseDays },
			version: 1,
			action: "create_retry_entry",
			parameters: { maxRetries: 5, backoffBaseDays },
			priority: 20,
		});

		for (const retryCount of [0, 1, 2]) {
			runMutation.mockClear();
			const before = Date.now();

			await retryRuleHandler.evaluate(ctx, {
				rule,
				eventType: "COLLECTION_FAILED",
				eventPayload: {
					planEntryId: "entry_1" as Id<"collectionPlanEntries">,
					obligationIds: ["obligation_1" as Id<"obligations">],
					amount: 100_000,
					method: "manual",
					retryCount,
				},
			});

			const args = runMutation.mock.calls[0][1] as Record<string, unknown>;
			const expectedDelay = backoffBaseDays * 2 ** retryCount * MS_PER_DAY;
			expect(args.scheduledDate).toBeGreaterThanOrEqual(before + expectedDelay);
			// Allow 100ms tolerance for test execution time
			expect(args.scheduledDate).toBeLessThanOrEqual(
				before + expectedDelay + 100
			);
		}
	});

	it("is idempotent: evaluating same COLLECTION_FAILED payload twice creates only one retry entry", async () => {
		const evalCtx = retryEvalCtx();

		// First evaluation: no existing retry entry found -> creates one
		runQuery.mockResolvedValueOnce(null);
		await retryRuleHandler.evaluate(ctx, evalCtx);
		expect(runMutation).toHaveBeenCalledOnce();

		// Second evaluation: existing retry entry found -> skips creation
		runMutation.mockClear();
		runQuery.mockResolvedValueOnce({
			_id: "existing_retry_entry" as Id<"collectionPlanEntries">,
			rescheduledFromId: "entry_1",
			source: "retry_rule",
			status: "planned",
		});
		await retryRuleHandler.evaluate(ctx, evalCtx);
		expect(runMutation).not.toHaveBeenCalled();
	});

	it("ignores non-COLLECTION_FAILED events", async () => {
		const evalCtx = retryEvalCtx({ eventType: "SOME_OTHER_EVENT" });

		await retryRuleHandler.evaluate(ctx, evalCtx);

		expect(runMutation).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// LateFeeRule
// ---------------------------------------------------------------------------

describe("LateFeeRule", () => {
	let runQuery: ReturnType<typeof vi.fn>;
	let runMutation: ReturnType<typeof vi.fn>;
	let ctx: ActionCtx;

	beforeEach(() => {
		runQuery = vi.fn();
		runMutation = vi.fn().mockResolvedValue("mock_obligation_id");
		ctx = { runQuery, runMutation } as unknown as ActionCtx;
	});

	function lateFeeEvalCtx(
		overrides: Partial<RuleEvalContext> = {}
	): RuleEvalContext {
		return {
			rule: mockRule({
				kind: "late_fee",
				code: "late_fee_rule",
				displayName: "Late fee assessment",
				description: "Creates late-fee obligations after overdue events.",
				name: "late_fee_rule",
				status: "active",
				scope: { scopeType: "global" },
				trigger: "event",
				config: {
					kind: "late_fee",
					feeCode: "late_fee",
					feeSurface: "borrower_charge",
				},
				version: 1,
				action: "create_late_fee",
				parameters: {},
				priority: 30,
			}),
			eventType: "OBLIGATION_OVERDUE",
			eventPayload: {
				obligationId: "obligation_1" as Id<"obligations">,
				mortgageId: "mortgage_1" as Id<"mortgages">,
			},
			...overrides,
		};
	}

	it("creates late_fee obligation on OBLIGATION_OVERDUE", async () => {
		const sourceObligation = mockObligation();
		const mortgageFee = {
			_id: "mortgage_fee_1" as Id<"mortgageFees">,
			calculationType: "fixed_amount_cents" as const,
			parameters: { fixedAmountCents: 5000, dueDays: 30, graceDays: 45 },
		};

		// getLateFeeForObligation -> no existing late fee
		runQuery.mockResolvedValueOnce(null);
		// getById -> source obligation
		runQuery.mockResolvedValueOnce(sourceObligation);
		// getActiveMortgageFee -> configured late fee
		runQuery.mockResolvedValueOnce(mortgageFee);

		await lateFeeRuleHandler.evaluate(ctx, lateFeeEvalCtx());

		expect(runMutation).toHaveBeenCalledOnce();
		expect(runMutation).toHaveBeenCalledWith(
			expect.anything(), // internal.obligations.mutations.createObligation
			expect.objectContaining({
				type: "late_fee",
				amount: 5000,
				amountSettled: 0,
				paymentNumber: 0,
				status: "upcoming",
				borrowerId: sourceObligation.borrowerId,
				mortgageId: "mortgage_1",
				sourceObligationId: "obligation_1",
				feeCode: "late_fee",
				mortgageFeeId: mortgageFee._id,
			})
		);
	});

	it("skips when late fee already exists (idempotency)", async () => {
		// getLateFeeForObligation -> existing late fee found
		runQuery.mockResolvedValueOnce({
			_id: "existing_late_fee" as Id<"obligations">,
		});

		await lateFeeRuleHandler.evaluate(ctx, lateFeeEvalCtx());

		expect(runMutation).not.toHaveBeenCalled();
	});

	it("sets correct parameters: amount=5000, dueDate=+30d, gracePeriod=+45d", async () => {
		const sourceObligation = mockObligation();
		const mortgageFee = {
			_id: "mortgage_fee_1" as Id<"mortgageFees">,
			calculationType: "fixed_amount_cents" as const,
			parameters: { fixedAmountCents: 5000, dueDays: 30, graceDays: 45 },
		};

		runQuery.mockResolvedValueOnce(null);
		runQuery.mockResolvedValueOnce(sourceObligation);
		runQuery.mockResolvedValueOnce(mortgageFee);

		const before = Date.now();
		await lateFeeRuleHandler.evaluate(ctx, lateFeeEvalCtx());

		const args = runMutation.mock.calls[0][1] as Record<string, unknown>;
		expect(args.amount).toBe(5000);

		const dueDate = args.dueDate as number;
		const gracePeriodEnd = args.gracePeriodEnd as number;

		// dueDate should be approximately now + 30 days
		expect(dueDate).toBeGreaterThanOrEqual(before + 30 * MS_PER_DAY);
		expect(dueDate).toBeLessThanOrEqual(before + 30 * MS_PER_DAY + 100);

		// gracePeriodEnd should be approximately now + 45 days
		expect(gracePeriodEnd).toBeGreaterThanOrEqual(before + 45 * MS_PER_DAY);
		expect(gracePeriodEnd).toBeLessThanOrEqual(before + 45 * MS_PER_DAY + 100);
	});

	it("skips when no active late-fee config exists for the mortgage", async () => {
		const sourceObligation = mockObligation();

		runQuery.mockResolvedValueOnce(null);
		runQuery.mockResolvedValueOnce(sourceObligation);
		runQuery.mockResolvedValueOnce(null);

		await lateFeeRuleHandler.evaluate(ctx, lateFeeEvalCtx());

		expect(runMutation).not.toHaveBeenCalled();
	});

	it("ignores non-OBLIGATION_OVERDUE events", async () => {
		const evalCtx = lateFeeEvalCtx({ eventType: "SOME_OTHER_EVENT" });

		await lateFeeRuleHandler.evaluate(ctx, evalCtx);

		expect(runQuery).not.toHaveBeenCalled();
		expect(runMutation).not.toHaveBeenCalled();
	});
});
