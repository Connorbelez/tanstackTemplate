import type { OriginationParticipantDraft } from "#/lib/admin-origination";
import type { BorrowerAutocompleteOption } from "./borrower-autocomplete-model";
import {
	listBorrowerAutocompleteOptions,
	resolveSelectedBorrowerOption,
} from "./borrower-autocomplete-model";

export function buildParticipantBorrowerDraft(
	current: OriginationParticipantDraft | undefined,
	borrower: BorrowerAutocompleteOption
): OriginationParticipantDraft {
	return {
		...(current ?? {}),
		email: borrower.email ?? current?.email,
		existingBorrowerId: borrower.borrowerId,
		fullName: borrower.fullName ?? current?.fullName,
	};
}

export function clearParticipantBorrowerSelection(
	current: OriginationParticipantDraft | undefined
): OriginationParticipantDraft {
	return {
		...(current ?? {}),
		existingBorrowerId: undefined,
	};
}

export function resolveSelectedParticipantBorrower(args: {
	borrowerOptions: BorrowerAutocompleteOption[];
	draft: OriginationParticipantDraft | undefined;
}) {
	return resolveSelectedBorrowerOption({
		borrowerOptions: args.borrowerOptions,
		fallbackBorrower: args.draft?.existingBorrowerId
			? {
					borrowerId: args.draft.existingBorrowerId,
					email: args.draft.email ?? null,
					fullName: args.draft.fullName ?? null,
				}
			: null,
		selectedBorrowerId: args.draft?.existingBorrowerId,
	});
}

export function listParticipantBorrowerOptions(args: {
	borrowerOptions: BorrowerAutocompleteOption[];
	search: string;
	selectedBorrower: BorrowerAutocompleteOption | null;
}) {
	return listBorrowerAutocompleteOptions(args);
}
