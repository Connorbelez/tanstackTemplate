import { describe, expect, it } from "vitest";
import { effectRegistry } from "../registry";

describe("obligationAccrual effect registry", () => {
	it("accrueObligation is registered in the effect registry", () => {
		expect(effectRegistry.accrueObligation).toBeDefined();
	});

	it("accrueObligation reference is truthy (not null/undefined)", () => {
		expect(effectRegistry.accrueObligation).toBeTruthy();
	});
});
