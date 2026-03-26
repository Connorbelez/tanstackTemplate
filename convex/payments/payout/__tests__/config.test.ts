import { describe, expect, it } from "vitest";
import {
	DEFAULT_PAYOUT_FREQUENCY,
	isPayoutDue,
	MINIMUM_PAYOUT_CENTS,
} from "../config";

describe("payout config", () => {
	describe("constants", () => {
		it("DEFAULT_PAYOUT_FREQUENCY is monthly", () => {
			expect(DEFAULT_PAYOUT_FREQUENCY).toBe("monthly");
		});

		it("MINIMUM_PAYOUT_CENTS is 100", () => {
			expect(MINIMUM_PAYOUT_CENTS).toBe(100);
		});
	});

	describe("isPayoutDue", () => {
		// ── Monthly ──────────────────────────────────────────────

		it("monthly — due after 28+ days", () => {
			expect(isPayoutDue("monthly", "2026-02-01", "2026-03-01")).toBe(true);
		});

		it("monthly — not due before 28 days", () => {
			expect(isPayoutDue("monthly", "2026-03-10", "2026-03-25")).toBe(false);
		});

		it("monthly — due at exactly 28 days", () => {
			expect(isPayoutDue("monthly", "2026-02-26", "2026-03-26")).toBe(true);
		});

		// ── Weekly ───────────────────────────────────────────────

		it("weekly — due after 7+ days", () => {
			expect(isPayoutDue("weekly", "2026-03-01", "2026-03-08")).toBe(true);
		});

		it("weekly — not due before 7 days", () => {
			expect(isPayoutDue("weekly", "2026-03-01", "2026-03-05")).toBe(false);
		});

		it("weekly — due at exactly 7 days", () => {
			expect(isPayoutDue("weekly", "2026-03-19", "2026-03-26")).toBe(true);
		});

		// ── Bi-weekly ────────────────────────────────────────────

		it("bi-weekly — due after 14+ days", () => {
			expect(isPayoutDue("bi_weekly", "2026-03-01", "2026-03-15")).toBe(true);
		});

		it("bi-weekly — not due before 14 days", () => {
			expect(isPayoutDue("bi_weekly", "2026-03-01", "2026-03-10")).toBe(false);
		});

		// ── On-demand ────────────────────────────────────────────

		it("on-demand — never due via cron", () => {
			expect(isPayoutDue("on_demand", undefined, "2026-03-15")).toBe(false);
		});

		// ── No previous payout ───────────────────────────────────

		it("never paid out (monthly) — always due", () => {
			expect(isPayoutDue("monthly", undefined, "2026-03-15")).toBe(true);
		});

		it("never paid out (weekly) — always due", () => {
			expect(isPayoutDue("weekly", undefined, "2026-03-15")).toBe(true);
		});
	});
});
