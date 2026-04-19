import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
	hasRotessaCustomerReference,
	resolveRotessaCustomerReference,
} from "../../../../convex/payments/recurringSchedules/rotessaCustomerReference";

describe("rotessa customer reference helpers", () => {
	it("ignores empty, whitespace-only, and non-finite values", () => {
		expect(
			hasRotessaCustomerReference({
				rotessaCustomerCustomIdentifier: "   ",
			})
		).toBe(false);
		expect(
			hasRotessaCustomerReference({
				rotessaCustomIdentifier: "\n\t",
			})
		).toBe(false);
		expect(
			hasRotessaCustomerReference({
				rotessaCustomerId: Number.NaN,
			})
		).toBe(false);
		expect(
			hasRotessaCustomerReference({
				rotessaCustomerId: Number.POSITIVE_INFINITY,
			})
		).toBe(false);
		expect(() =>
			resolveRotessaCustomerReference({
				rotessaCustomerCustomIdentifier: " ",
			})
		).toThrow(ConvexError);
	});

	it("returns trimmed identifiers and finite ids", () => {
		expect(
			resolveRotessaCustomerReference({
				rotessaCustomerId: 481,
			})
		).toEqual({ customerId: 481 });
		expect(
			resolveRotessaCustomerReference({
				rotessaCustomerCustomIdentifier: "  borrower-123  ",
			})
		).toEqual({ customIdentifier: "borrower-123" });
		expect(
			resolveRotessaCustomerReference({
				rotessaCustomIdentifier: " legacy-ref ",
			})
		).toEqual({ customIdentifier: "legacy-ref" });
	});
});
