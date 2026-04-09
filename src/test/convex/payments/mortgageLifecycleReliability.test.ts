import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	assertFinalLifecycleTotals,
	assertMonthlyLifecycleIntegrity,
	assertOwnershipIntegrity,
	assertScheduleIntegrity,
} from "./reliabilityAssertions";
import {
	createReliabilityHarness,
	ownershipExpectationForPayment,
	teardownReliabilityHarness,
} from "./reliabilityHarness";

describe("mortgage lifecycle reliability", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
		teardownReliabilityHarness();
	});

	it(
		"runs a 12-payment mortgage from schedule generation through month-12 maturity with a mid-term ownership transfer and cross-system invariants intact",
		async () => {
			const harness = createReliabilityHarness();
			const bootstrap = await harness.bootstrap();

			await assertScheduleIntegrity(harness, bootstrap);
			await assertOwnershipIntegrity(harness, bootstrap, {
				lenderAUnits: 6000,
				lenderBUnits: 4000,
			});

			for (let paymentNumber = 1; paymentNumber <= 6; paymentNumber += 1) {
				const record = await harness.runMonthlyCycle(
					bootstrap.fixture.mortgageId,
					paymentNumber
				);
				await assertMonthlyLifecycleIntegrity(
					harness,
					bootstrap,
					record,
					ownershipExpectationForPayment(paymentNumber)
				);
			}

			await harness.transferOwnershipMidTerm({
				mortgageId: bootstrap.fixture.mortgageId,
				sellerLenderAuthId: bootstrap.fixture.lenderAAuthId,
				buyerLenderAuthId: bootstrap.fixture.lenderBAuthId,
				quantity: 2000,
				effectiveDate: "2026-06-20",
				idempotencyKey: "reliability-midterm-transfer",
			});

			await assertOwnershipIntegrity(harness, bootstrap, {
				lenderAUnits: 4000,
				lenderBUnits: 6000,
			});

			for (let paymentNumber = 7; paymentNumber <= 12; paymentNumber += 1) {
				const record = await harness.runMonthlyCycle(
					bootstrap.fixture.mortgageId,
					paymentNumber
				);
				await assertMonthlyLifecycleIntegrity(
					harness,
					bootstrap,
					record,
					ownershipExpectationForPayment(paymentNumber)
				);
			}

			await harness.markMortgageMatured(bootstrap.fixture.mortgageId);
			await assertFinalLifecycleTotals(harness, bootstrap);

			const mortgage = await harness.t.run(async (ctx) =>
				ctx.db.get(bootstrap.fixture.mortgageId)
			);
			expect(mortgage?.status).toBe("matured");
		},
		10_000
	);
});
