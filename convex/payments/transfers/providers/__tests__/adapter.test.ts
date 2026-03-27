/**
 * PaymentMethodAdapter tests — verifies field mapping from
 * TransferProvider interface to the legacy PaymentMethod interface.
 */

import { describe, expect, it } from "vitest";
import type {
	CancelResult,
	ConfirmResult,
	InitiateParams,
	InitiateResult,
	PaymentMethod,
	StatusResult,
} from "../../../methods/interface";
import type { TransferRequestInput } from "../../interface";
import { PaymentMethodAdapter } from "../adapter";

// ── Error patterns ──────────────────────────────────────────────────
const INBOUND_ONLY_RE = /only supports inbound transfers/;
const BORROWER_ONLY_RE = /only supports borrower counterparties/;

// ── Mock PaymentMethod ──────────────────────────────────────────────

class MockPaymentMethod implements PaymentMethod {
	readonly calls: { method: string; args: unknown[] }[] = [];

	async initiate(params: InitiateParams): Promise<InitiateResult> {
		this.calls.push({ method: "initiate", args: [params] });
		return { providerRef: "mock-ref", status: "confirmed" };
	}

	async confirm(ref: string): Promise<ConfirmResult> {
		this.calls.push({ method: "confirm", args: [ref] });
		return { providerRef: ref, settledAt: Date.now() };
	}

	async cancel(ref: string): Promise<CancelResult> {
		this.calls.push({ method: "cancel", args: [ref] });
		return { cancelled: true };
	}

	async getStatus(ref: string): Promise<StatusResult> {
		this.calls.push({ method: "getStatus", args: [ref] });
		return { status: "confirmed" };
	}
}

// ── Factory ─────────────────────────────────────────────────────────

function makeInput(
	overrides: Partial<TransferRequestInput> = {}
): TransferRequestInput {
	return {
		amount: 10_000,
		counterpartyId: "borrower-123",
		counterpartyType: "borrower",
		currency: "CAD",
		direction: "inbound",
		idempotencyKey: "test-key",
		providerCode: "manual",
		references: {
			mortgageId:
				"mortgage-001" as TransferRequestInput["references"]["mortgageId"],
			planEntryId:
				"entry-001" as TransferRequestInput["references"]["planEntryId"],
		},
		source: { channel: "admin_dashboard", actorType: "system" },
		transferType: "borrower_interest_collection",
		...overrides,
	};
}

// ── Tests ───────────────────────────────────────────────────────────

describe("PaymentMethodAdapter", () => {
	describe("initiate()", () => {
		it("maps counterpartyId to borrowerId", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.initiate(makeInput({ counterpartyId: "bor-999" }));

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.borrowerId).toBe("bor-999");
		});

		it("maps references.mortgageId to mortgageId as string", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.initiate(makeInput());

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.mortgageId).toBe("mortgage-001");
		});

		it("maps references.planEntryId to planEntryId as string", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.initiate(makeInput());

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.planEntryId).toBe("entry-001");
		});

		it("passes amount directly", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.initiate(makeInput({ amount: 55_000 }));

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.amount).toBe(55_000);
		});

		it("maps providerCode to method", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.initiate(makeInput({ providerCode: "pad_rotessa" }));

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.method).toBe("pad_rotessa");
		});

		it("passes metadata through", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			const meta = { custom: "data" };
			await adapter.initiate(makeInput({ metadata: meta }));

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.metadata).toEqual(meta);
		});

		it("maps undefined mortgageId to empty string", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.initiate(makeInput({ references: {} }));

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.mortgageId).toBe("");
		});

		it("maps undefined planEntryId to empty string", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.initiate(makeInput({ references: {} }));

			const params = mock.calls[0].args[0] as InitiateParams;
			expect(params.planEntryId).toBe("");
		});

		it("returns the inner provider result", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			const result = await adapter.initiate(makeInput());
			expect(result.providerRef).toBe("mock-ref");
			expect(result.status).toBe("confirmed");
		});

		it("rejects outbound transfers", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await expect(
				adapter.initiate(makeInput({ direction: "outbound" }))
			).rejects.toThrow(INBOUND_ONLY_RE);
			expect(mock.calls).toHaveLength(0);
		});

		it("rejects non-borrower counterpartyType 'lender'", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await expect(
				adapter.initiate(makeInput({ counterpartyType: "lender" }))
			).rejects.toThrow(BORROWER_ONLY_RE);
			expect(mock.calls).toHaveLength(0);
		});

		it("rejects non-borrower counterpartyType 'investor'", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await expect(
				adapter.initiate(makeInput({ counterpartyType: "investor" }))
			).rejects.toThrow(BORROWER_ONLY_RE);
			expect(mock.calls).toHaveLength(0);
		});

		it("rejects non-borrower counterpartyType 'trust'", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await expect(
				adapter.initiate(makeInput({ counterpartyType: "trust" }))
			).rejects.toThrow(BORROWER_ONLY_RE);
			expect(mock.calls).toHaveLength(0);
		});

		it("accepts inbound + borrower combination", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			const result = await adapter.initiate(
				makeInput({ direction: "inbound", counterpartyType: "borrower" })
			);
			expect(result.providerRef).toBe("mock-ref");
			expect(mock.calls).toHaveLength(1);
		});
	});

	describe("confirm()", () => {
		it("passes ref to inner provider", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			await adapter.confirm("ref-abc");

			expect(mock.calls[0].method).toBe("confirm");
			expect(mock.calls[0].args[0]).toBe("ref-abc");
		});
	});

	describe("cancel()", () => {
		it("passes ref to inner provider", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			const result = await adapter.cancel("ref-xyz");

			expect(mock.calls[0].method).toBe("cancel");
			expect(result.cancelled).toBe(true);
		});
	});

	describe("getStatus()", () => {
		it("passes ref to inner provider", async () => {
			const mock = new MockPaymentMethod();
			const adapter = new PaymentMethodAdapter(mock);
			const result = await adapter.getStatus("ref-001");

			expect(mock.calls[0].method).toBe("getStatus");
			expect(result.status).toBe("confirmed");
		});
	});
});
