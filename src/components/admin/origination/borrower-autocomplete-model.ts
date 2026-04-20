import { buildBorrowerDisplayLabel } from "./collections-step-model";

export interface BorrowerAutocompleteOption {
	borrowerId: string;
	email: string | null;
	fullName: string | null;
}

export function resolveSelectedBorrowerOption(args: {
	borrowerOptions: BorrowerAutocompleteOption[];
	fallbackBorrower?: BorrowerAutocompleteOption | null;
	selectedBorrowerId?: string | null;
}) {
	if (!args.selectedBorrowerId) {
		return null;
	}

	return (
		args.borrowerOptions.find(
			(borrower) => borrower.borrowerId === args.selectedBorrowerId
		) ??
		args.fallbackBorrower ?? {
			borrowerId: args.selectedBorrowerId,
			email: null,
			fullName: null,
		}
	);
}

export function listBorrowerAutocompleteOptions(args: {
	borrowerOptions: BorrowerAutocompleteOption[];
	search: string;
	selectedBorrower: BorrowerAutocompleteOption | null;
}) {
	const searchableBorrowerOptions =
		args.selectedBorrower &&
		!args.borrowerOptions.some(
			(borrower) => borrower.borrowerId === args.selectedBorrower?.borrowerId
		)
			? [args.selectedBorrower, ...args.borrowerOptions]
			: args.borrowerOptions;
	const normalizedQuery = args.search.trim().toLowerCase();

	if (!normalizedQuery) {
		return searchableBorrowerOptions.slice(0, 8);
	}

	return searchableBorrowerOptions
		.filter((borrower) =>
			[
				borrower.email ?? "",
				borrower.fullName ?? "",
				buildBorrowerDisplayLabel(borrower),
			]
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery)
		)
		.slice(0, 8);
}
