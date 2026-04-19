import { describe, expect, it } from "vitest";
import {
	listBorrowerAutocompleteOptions,
	resolveSelectedBorrowerOption,
} from "#/components/admin/origination/borrower-autocomplete-model";

const BORROWER_OPTIONS = [
	{
		borrowerId: "borrower_1",
		email: "ada@example.com",
		fullName: "Ada Lovelace",
	},
	{
		borrowerId: "borrower_2",
		email: "grace@example.com",
		fullName: "Grace Hopper",
	},
];

describe("borrower autocomplete model", () => {
	it("resolves the selected borrower from surfaced options or a fallback borrower", () => {
		expect(
			resolveSelectedBorrowerOption({
				borrowerOptions: BORROWER_OPTIONS,
				selectedBorrowerId: "borrower_2",
			})
		).toEqual(BORROWER_OPTIONS[1]);

		expect(
			resolveSelectedBorrowerOption({
				borrowerOptions: BORROWER_OPTIONS,
				fallbackBorrower: {
					borrowerId: "borrower_3",
					email: "new@example.com",
					fullName: "New Borrower",
				},
				selectedBorrowerId: "borrower_3",
			})
		).toEqual({
			borrowerId: "borrower_3",
			email: "new@example.com",
			fullName: "New Borrower",
		});
	});

	it("filters borrower options by name or email and keeps the selected borrower visible", () => {
		expect(
			listBorrowerAutocompleteOptions({
				borrowerOptions: BORROWER_OPTIONS,
				search: "grace",
				selectedBorrower: null,
			})
		).toEqual([BORROWER_OPTIONS[1]]);

		expect(
			listBorrowerAutocompleteOptions({
				borrowerOptions: [BORROWER_OPTIONS[0]],
				search: "",
				selectedBorrower: BORROWER_OPTIONS[1],
			})
		).toEqual([BORROWER_OPTIONS[1], BORROWER_OPTIONS[0]]);
	});
});
