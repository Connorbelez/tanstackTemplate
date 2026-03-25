import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { calculateProRataShares } from "../../accrual/interestMath";

const lenderA = "lender_a" as Id<"lenders">;
const lenderB = "lender_b" as Id<"lenders">;
const lenderC = "lender_c" as Id<"lenders">;
const accountA = "account_a" as Id<"ledger_accounts">;
const accountB = "account_b" as Id<"ledger_accounts">;
const accountC = "account_c" as Id<"ledger_accounts">;

describe("calculateProRataShares", () => {
	it("preserves exact proportional allocations when the split is clean", () => {
		const shares = calculateProRataShares(
			[
				{ lenderId: lenderA, lenderAccountId: accountA, units: 5000 },
				{ lenderId: lenderB, lenderAccountId: accountB, units: 3000 },
				{ lenderId: lenderC, lenderAccountId: accountC, units: 2000 },
			],
			10_000
		);

		expect(shares).toEqual([
			{
				lenderId: lenderA,
				lenderAccountId: accountA,
				units: 5000,
				rawAmount: 5000,
				amount: 5000,
			},
			{
				lenderId: lenderB,
				lenderAccountId: accountB,
				units: 3000,
				rawAmount: 3000,
				amount: 3000,
			},
			{
				lenderId: lenderC,
				lenderAccountId: accountC,
				units: 2000,
				rawAmount: 2000,
				amount: 2000,
			},
		]);
	});

	it("splits odd cents with stable largest-remainder ordering", () => {
		const shares = calculateProRataShares(
			[
				{ lenderId: lenderA, lenderAccountId: accountA, units: 1 },
				{ lenderId: lenderB, lenderAccountId: accountB, units: 1 },
				{ lenderId: lenderC, lenderAccountId: accountC, units: 1 },
			],
			100
		);

		expect(shares.map((share) => share.amount)).toEqual([34, 33, 33]);
		expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(100);
	});

	it("awards leftover cents to the largest remainders before smaller ones", () => {
		const shares = calculateProRataShares(
			[
				{ lenderId: lenderA, lenderAccountId: accountA, units: 5000 },
				{ lenderId: lenderB, lenderAccountId: accountB, units: 3000 },
				{ lenderId: lenderC, lenderAccountId: accountC, units: 2000 },
			],
			101
		);

		expect(shares.map((share) => share.amount)).toEqual([51, 30, 20]);
		expect(shares[0]?.rawAmount).toBeCloseTo(50.5, 8);
		expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(101);
	});
});
