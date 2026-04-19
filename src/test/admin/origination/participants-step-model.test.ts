import { describe, expect, it } from "vitest";
import {
	buildParticipantBorrowerDraft,
	clearParticipantBorrowerSelection,
	listParticipantBorrowerOptions,
	resolveSelectedParticipantBorrower,
} from "#/components/admin/origination/participants-step-model";

describe("participants step model", () => {
	const borrowerOptions = [
		{
			borrowerId: "borrower_ada",
			email: "ada@example.com",
			fullName: "Ada Lovelace",
		},
		{
			borrowerId: "borrower_grace",
			email: "grace@example.com",
			fullName: "Grace Hopper",
		},
	];

	it("resolves and filters borrower options for the autocomplete dropdown", () => {
		const selectedBorrower = resolveSelectedParticipantBorrower({
			borrowerOptions,
			draft: {
				email: "ada@example.com",
				existingBorrowerId: "borrower_ada",
				fullName: "Ada Lovelace",
			},
		});

		expect(selectedBorrower).toEqual({
			borrowerId: "borrower_ada",
			email: "ada@example.com",
			fullName: "Ada Lovelace",
		});

		expect(
			listParticipantBorrowerOptions({
				borrowerOptions,
				search: "grace",
				selectedBorrower,
			})
		).toEqual([
			{
				borrowerId: "borrower_grace",
				email: "grace@example.com",
				fullName: "Grace Hopper",
			},
		]);
	});

	it("hydrates and clears canonical borrower selection without losing staged identity data", () => {
		expect(
			buildParticipantBorrowerDraft(
				{
					phone: "416-555-0101",
				},
				{
					borrowerId: "borrower_ada",
					email: "ada@example.com",
					fullName: "Ada Lovelace",
				}
			)
		).toEqual({
			email: "ada@example.com",
			existingBorrowerId: "borrower_ada",
			fullName: "Ada Lovelace",
			phone: "416-555-0101",
		});

		expect(
			clearParticipantBorrowerSelection({
				email: "ada@example.com",
				existingBorrowerId: "borrower_ada",
				fullName: "Ada Lovelace",
			})
		).toEqual({
			email: "ada@example.com",
			existingBorrowerId: undefined,
			fullName: "Ada Lovelace",
		});
	});
});
