import { describe, expect, it } from "vitest";
import {
	calculatePayoutEligibleDate,
	DEFAULT_HOLD_PERIOD,
	getHoldPeriod,
} from "../holdPeriod";

describe("getHoldPeriod", () => {
	it("returns 0 days for manual", () => {
		expect(getHoldPeriod("manual")).toEqual({ holdBusinessDays: 0 });
	});

	it("returns 5 days for mock_pad", () => {
		expect(getHoldPeriod("mock_pad")).toEqual({ holdBusinessDays: 5 });
	});

	it("returns 5 days for rotessa_pad", () => {
		expect(getHoldPeriod("rotessa_pad")).toEqual({ holdBusinessDays: 5 });
	});

	it("returns 7 days for stripe_ach", () => {
		expect(getHoldPeriod("stripe_ach")).toEqual({ holdBusinessDays: 7 });
	});

	it("returns default 5 days for unknown method", () => {
		expect(getHoldPeriod("some_future_method")).toEqual(DEFAULT_HOLD_PERIOD);
		expect(getHoldPeriod("some_future_method").holdBusinessDays).toBe(5);
	});
});

describe("calculatePayoutEligibleDate", () => {
	it("manual: same day (0 hold)", () => {
		expect(calculatePayoutEligibleDate("2026-03-20", "manual")).toBe(
			"2026-03-20"
		);
	});

	it("manual: weekend dispersal normalizes to next business day", () => {
		// March 28 2026 is Saturday → Monday March 30
		expect(calculatePayoutEligibleDate("2026-03-28", "manual")).toBe(
			"2026-03-30"
		);
	});

	it("rotessa_pad: Friday + 5 bd = next Friday", () => {
		// March 20 2026 is a Friday
		expect(calculatePayoutEligibleDate("2026-03-20", "rotessa_pad")).toBe(
			"2026-03-27"
		);
	});

	it("stripe_ach: Friday + 7 bd = next Tuesday week after", () => {
		// March 20 (Fri) + 7 bd = Mon(1) Tue(2) Wed(3) Thu(4) Fri(5) [skip Sat Sun] Mon(6) Tue(7)
		// = March 31 (Tuesday)
		expect(calculatePayoutEligibleDate("2026-03-20", "stripe_ach")).toBe(
			"2026-03-31"
		);
	});

	it("unknown method uses default 5 days", () => {
		// Same as rotessa_pad behavior
		expect(calculatePayoutEligibleDate("2026-03-20", "unknown")).toBe(
			"2026-03-27"
		);
	});

	it("Wednesday + 5 bd = next Wednesday", () => {
		// March 25 (Wed) + 5 bd = Thu(1) Fri(2) [skip] Mon(3) Tue(4) Wed(5)
		// = April 1
		expect(calculatePayoutEligibleDate("2026-03-25", "rotessa_pad")).toBe(
			"2026-04-01"
		);
	});
});
