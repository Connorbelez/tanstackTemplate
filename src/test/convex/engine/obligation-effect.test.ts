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
		amount: 1_500,
		principalPortion: 1_000,
		interestPortion: 500,
		dueDate: "2026-03-01",
		gracePeriodEndDate: "2026-03-10",
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
			settledAmount: 999,
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

	it("throws when no canonical paidAt value is available", () => {
		const args = createArgs({
			payload: {
				amount: 2_345,
			},
		});
		const obligation = createObligation({
			settledAt: undefined,
		});

		expect(() =>
			obligationEffectTestHelpers.buildPaymentConfirmedPayload(args, obligation)
		).toThrow("Missing canonical paidAt");
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

		await expect(
			obligationEffectTestHelpers.forwardObligationEventToMortgage(
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
			)
		).resolves.toBeUndefined();

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
