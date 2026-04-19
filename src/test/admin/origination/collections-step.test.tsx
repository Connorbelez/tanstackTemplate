/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionsStep } from "#/components/admin/origination/CollectionsStep";

vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("collections step", () => {
	it("renders staged primary-borrower bank accounts for immediate Rotessa activation", () => {
		vi.mocked(useQuery).mockReturnValue({
			activationStatus: "pending",
			bankAccounts: [
				{
					accountLast4: "6789",
					bankAccountId: "bank_1",
					eligibilityErrors: [],
					hasRotessaCustomerReference: true,
					institutionNumber: "001",
					isDefaultInbound: true,
					mandateStatus: "active",
					status: "validated",
					transitNumber: "00011",
					validationMethod: "provider_verified",
				},
			],
			preflightErrors: [],
			primaryBorrower: {
				borrowerId: "borrower_1",
				email: "ada@example.com",
				fullName: "Ada Lovelace",
				message: "Primary borrower is eligible for immediate Rotessa setup.",
				state: "ready",
			},
			providerCode: "pad_rotessa",
			selectedBankAccount: null,
		});
		const onChange = vi.fn();

		render(
			<CollectionsStep
				caseId="case_1"
				draft={{
					mode: "provider_managed_now",
					providerCode: "pad_rotessa",
				}}
				onChange={onChange}
			/>
		);

		expect(
			screen.getByText(/^Immediate Rotessa activation$/i)
		).toBeTruthy();
		expect(
			screen.getByText(/Primary borrower is eligible for immediate Rotessa setup\./i)
		).toBeTruthy();
		expect(screen.getByText(/•••• 6789 • 001-00011/i)).toBeTruthy();
		expect(
			screen.getByText(/Eligible for immediate Rotessa activation\./i)
		).toBeTruthy();

		fireEvent.click(screen.getByLabelText(/•••• 6789 • 001-00011/i));
		expect(onChange).toHaveBeenCalledWith({
			activationStatus: "pending",
			mode: "provider_managed_now",
			providerCode: "pad_rotessa",
			selectedBankAccountId: "bank_1",
		});
	});
});
