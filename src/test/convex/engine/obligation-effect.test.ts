import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { obligationEffectTestHelpers } from "../../../../convex/engine/effects/obligation";
import { executeTransition } from "../../../../convex/engine/transition";
import type { CommandSource } from "../../../../convex/engine/types";

vi.mock("../../../../convex/engine/transition", () => ({
	executeTransition: vi.fn(),
}));

const mockedExecuteTransition = vi.mocked(executeTransition);

function createObligation(
	overrides?: Partial<Doc<"obligations">>
): Doc<"obligations"> {
	return {
		_id: "obligation_1" as Id<"obligations">,
		_creationTime: Date.UTC(2026, 2, 16, 12, 0, 0),
		status: "settled",
		mortgageId: "mortgage_1" as Id<"mortgages">,
		borrowerId: "borrower_1" as Id<"borrowers">,
		paymentNumber: 1,
		type: "regular_interest" as const,
		amount: 1_500,
		amountSettled: 1_500,
		dueDate: Date.UTC(2026, 2, 1, 12, 0, 0),
		gracePeriodEnd: Date.UTC(2026, 2, 10, 12, 0, 0),
		createdAt: Date.UTC(2026, 2, 16, 12, 0, 0),
		...overrides,
	};
}

function createArgs(
	overrides?: Partial<{
		entityId: Id<"obligations">;
		payload: Record<string, unknown> | undefined;
		source: CommandSource;
	}>
) {
	return {
		effectName: "emitObligationSettled",
		entityId: overrides?.entityId ?? ("obligation_1" as Id<"obligations">),
		entityType: "obligation" as const,
		eventType: "PAYMENT_APPLIED",
		journalEntryId: "journal_1",
		payload: overrides?.payload,
		source: overrides?.source ?? { channel: "scheduler" as const },
	};
}

describe("obligation effect helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("prefers the original PAYMENT_APPLIED payload for canonical payment data", () => {
		const args = createArgs({
			payload: {
				amount: 2_345,
				paidAt: 1_710_000_000_000,
			},
		});
		const obligation = createObligation({
			amountSettled: 999,
			settledAt: 123,
		});

		expect(
			obligationEffectTestHelpers.buildPaymentConfirmedPayload(args, obligation)
		).toEqual({
			obligationId: args.entityId,
			amount: 2_345,
			paidAt: 1_710_000_000_000,
		});
	});

	it("falls back to Date.now() when no paidAt or settledAt is available", () => {
		const args = createArgs({
			payload: {
				amount: 2_345,
			},
		});
		const obligation = createObligation({
			settledAt: undefined,
		});

		const before = Date.now();
		const result =
			obligationEffectTestHelpers.buildPaymentConfirmedPayload(args, obligation);
		const after = Date.now();

		expect(result.obligationId).toBe(args.entityId);
		expect(result.amount).toBe(2_345);
		expect(result.paidAt).toBeGreaterThanOrEqual(before);
		expect(result.paidAt).toBeLessThanOrEqual(after);
	});

	it("passes the original source into executeTransition and logs no-op rejections", async () => {
		const source: CommandSource = {
			actorId: "user_admin_1",
			actorType: "admin",
			channel: "admin_dashboard",
			sessionId: "session_123",
		};
		const args = createArgs({ source });
		const obligation = createObligation();
		const ctx = {
			db: {
				get: vi.fn().mockResolvedValue(obligation),
			},
		};
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		mockedExecuteTransition.mockResolvedValueOnce({
			success: false,
			previousState: "defaulted",
			newState: "defaulted",
			reason: 'Event "OBLIGATION_OVERDUE" not valid in state "defaulted"',
		});

		const result = await obligationEffectTestHelpers.forwardObligationEventToMortgage(
			ctx as never,
			{
				...args,
				effectName: "emitObligationOverdue",
				eventType: "GRACE_PERIOD_EXPIRED",
			},
			{
				effectLabel: "emitObligationOverdue",
				eventType: "OBLIGATION_OVERDUE",
				buildPayload: ({ entityId }) => ({
					obligationId: entityId,
				}),
			}
		);

		// Returns the obligation even on no-op rejection
		expect(result).toEqual(obligation);

		expect(mockedExecuteTransition).toHaveBeenCalledWith(ctx, {
			entityType: "mortgage",
			entityId: obligation.mortgageId,
			eventType: "OBLIGATION_OVERDUE",
			payload: {
				obligationId: args.entityId,
			},
			source,
		});
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Skipping OBLIGATION_OVERDUE")
		);
	});
});
