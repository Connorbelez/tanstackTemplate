import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InitiateParams } from "../methods/interface";
import { ManualPaymentMethod } from "../methods/manual";
import {
	DEFAULT_MOCK_PAD_CONFIG,
	MockPADMethod,
	type ScheduleSettlementFn,
} from "../methods/mockPAD";
import {
	createPaymentMethodRegistry,
	getPaymentMethod,
} from "../methods/registry";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MANUAL_REF_PATTERN = /^manual_entry_789_\d+$/;
const MOCK_PAD_REF_PATTERN = /^mock_pad_entry_789_\d+$/;
const UNKNOWN_METHOD_PATTERN = /Unknown payment method: "stripe_ach"/;

const sampleParams: InitiateParams = {
	amount: 100_000, // $1000 in cents
	mortgageId: "mortgage_123",
	borrowerId: "borrower_456",
	planEntryId: "entry_789",
	method: "manual",
};

// ---------------------------------------------------------------------------
// ManualPaymentMethod
// ---------------------------------------------------------------------------

describe("ManualPaymentMethod", () => {
	let method: ManualPaymentMethod;

	beforeEach(() => {
		method = new ManualPaymentMethod();
	});

	it("initiate returns confirmed status immediately", async () => {
		const result = await method.initiate(sampleParams);
		expect(result.status).toBe("confirmed");
	});

	it("providerRef contains planEntryId", async () => {
		const result = await method.initiate(sampleParams);
		expect(result.providerRef).toContain(sampleParams.planEntryId);
		expect(result.providerRef).toMatch(MANUAL_REF_PATTERN);
	});

	it("confirm returns settledAt timestamp", async () => {
		const before = Date.now();
		const result = await method.confirm("manual_entry_789_1000");
		expect(result.providerRef).toBe("manual_entry_789_1000");
		expect(result.settledAt).toBeGreaterThanOrEqual(before);
		expect(result.settledAt).toBeLessThanOrEqual(Date.now());
	});

	it("cancel returns cancelled: true", async () => {
		const result = await method.cancel("manual_entry_789_1000");
		expect(result).toEqual({ cancelled: true });
	});

	it("getStatus returns confirmed", async () => {
		const ref = "manual_entry_789_1000";
		const result = await method.getStatus(ref);
		expect(result.status).toBe("confirmed");
		expect(result.providerData).toEqual({
			providerRef: ref,
			method: "manual",
		});
	});
});

// ---------------------------------------------------------------------------
// MockPADMethod
// ---------------------------------------------------------------------------

describe("MockPADMethod", () => {
	let scheduler: ScheduleSettlementFn;

	beforeEach(() => {
		scheduler = vi.fn<ScheduleSettlementFn>(async () => {
			/* no-op scheduler stub */
		});
	});

	it("initiate returns pending status", async () => {
		const method = new MockPADMethod(scheduler);
		const result = await method.initiate(sampleParams);
		expect(result.status).toBe("pending");
	});

	it("calls scheduleSettlement with correct delayMs", async () => {
		const method = new MockPADMethod(scheduler);
		vi.spyOn(Math, "random").mockReturnValue(0.5);

		await method.initiate(sampleParams);

		expect(scheduler).toHaveBeenCalledOnce();
		expect(scheduler).toHaveBeenCalledWith(
			DEFAULT_MOCK_PAD_CONFIG.delayMs,
			expect.objectContaining({
				planEntryId: sampleParams.planEntryId,
			})
		);

		vi.restoreAllMocks();
	});

	it("providerRef contains planEntryId", async () => {
		const method = new MockPADMethod(scheduler);
		const result = await method.initiate(sampleParams);
		expect(result.providerRef).toContain(sampleParams.planEntryId);
		expect(result.providerRef).toMatch(MOCK_PAD_REF_PATTERN);
	});

	it("uses default config when none provided", async () => {
		const method = new MockPADMethod(scheduler);
		await method.initiate(sampleParams);

		// Scheduler should have been called with the default delayMs
		expect(scheduler).toHaveBeenCalledWith(
			DEFAULT_MOCK_PAD_CONFIG.delayMs,
			expect.anything()
		);
		expect(DEFAULT_MOCK_PAD_CONFIG).toEqual({
			delayMs: 2000,
			failureRate: 0.1,
		});
	});

	it("respects custom delayMs", async () => {
		const customDelay = 5000;
		const method = new MockPADMethod(scheduler, { delayMs: customDelay });

		await method.initiate(sampleParams);

		expect(scheduler).toHaveBeenCalledWith(
			customDelay,
			expect.objectContaining({
				planEntryId: sampleParams.planEntryId,
			})
		);
	});

	it("respects custom failureRate of 0 (never fail)", async () => {
		const method = new MockPADMethod(scheduler, { failureRate: 0 });
		vi.spyOn(Math, "random").mockReturnValue(0.99);

		await method.initiate(sampleParams);

		expect(scheduler).toHaveBeenCalledWith(
			DEFAULT_MOCK_PAD_CONFIG.delayMs,
			expect.objectContaining({
				shouldFail: false,
			})
		);

		vi.restoreAllMocks();
	});

	it("respects custom failureRate of 1 (always fail)", async () => {
		const method = new MockPADMethod(scheduler, { failureRate: 1 });
		vi.spyOn(Math, "random").mockReturnValue(0.99);

		await method.initiate(sampleParams);

		expect(scheduler).toHaveBeenCalledWith(
			DEFAULT_MOCK_PAD_CONFIG.delayMs,
			expect.objectContaining({
				shouldFail: true,
			})
		);

		vi.restoreAllMocks();
	});

	it("confirm returns settledAt timestamp", async () => {
		const method = new MockPADMethod(scheduler);
		const ref = "mock_pad_entry_789_1000";
		const before = Date.now();
		const result = await method.confirm(ref);
		expect(result.providerRef).toBe(ref);
		expect(result.settledAt).toBeGreaterThanOrEqual(before);
		expect(result.settledAt).toBeLessThanOrEqual(Date.now());
	});

	it("cancel returns cancelled: true", async () => {
		const method = new MockPADMethod(scheduler);
		const result = await method.cancel("mock_pad_entry_789_1000");
		expect(result).toEqual({ cancelled: true });
	});
});

// ---------------------------------------------------------------------------
// Method Registry
// ---------------------------------------------------------------------------

describe("Method Registry", () => {
	it('getPaymentMethod("manual") returns ManualPaymentMethod', () => {
		const method = getPaymentMethod("manual");
		expect(method).toBeInstanceOf(ManualPaymentMethod);
	});

	it('getPaymentMethod("mock_pad") returns MockPADMethod', () => {
		const method = getPaymentMethod("mock_pad");
		expect(method).toBeInstanceOf(MockPADMethod);
	});

	it("throws ConvexError for unknown method", () => {
		expect(() => getPaymentMethod("unknown")).toThrow(ConvexError);
	});

	it("error message includes the unknown method name", () => {
		expect(() => getPaymentMethod("stripe_ach")).toThrow(
			UNKNOWN_METHOD_PATTERN
		);
	});

	it("createPaymentMethodRegistry injects scheduler correctly", async () => {
		const injectedScheduler = vi.fn<ScheduleSettlementFn>(async () => {
			/* no-op scheduler stub */
		});
		const registry = createPaymentMethodRegistry({
			scheduleSettlement: injectedScheduler,
		});

		const method = registry("mock_pad");
		expect(method).toBeInstanceOf(MockPADMethod);

		// Initiate should use the injected scheduler, not the noop one
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		await method.initiate(sampleParams);
		expect(injectedScheduler).toHaveBeenCalledOnce();

		vi.restoreAllMocks();
	});
});
