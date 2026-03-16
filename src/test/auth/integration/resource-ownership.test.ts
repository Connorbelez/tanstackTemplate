/**
 * Resource ownership integration tests.
 *
 * These tests are blocked on ENG-6 which introduces the ownership-check
 * functions: canAccessMortgage, canAccessDocument, and
 * canAccessApplicationPackage. Once ENG-6 lands, replace the `it.todo()`
 * placeholders below with full integration tests using the shared fixtures
 * from `../identities` and `../helpers`.
 */

import { describe, it } from "vitest";

describe("canAccessMortgage", () => {
	it.todo(
		"grants access when the borrower owns the mortgage (borrowerId matches)"
	);
	it.todo(
		"grants access when the broker is assigned to the mortgage (brokerId matches)"
	);
	it.todo(
		"grants access when the lender holds a position on the mortgage (lenderId in positions)"
	);
	it.todo(
		"grants access when the lawyer is in closingTeamAssignments for the mortgage"
	);
	it.todo("grants access when the caller is a FairLend admin (admin bypass)");
	it.todo(
		"denies access for an unrelated member with no ownership relationship"
	);
	it.todo("denies access for a lender not holding a position on the mortgage");
});

describe("canAccessDocument", () => {
	it.todo(
		"grants access when the document's parent is an offer condition and the caller can access the parent offer's application"
	);
	it.todo(
		"grants access when the document's parent is a mortgage and the caller can access that mortgage"
	);
	it.todo("denies access when the caller cannot access the parent resource");
	it.todo("grants access for a FairLend admin regardless of parent chain");
});

describe("canAccessApplicationPackage", () => {
	it.todo(
		"sr_underwriter can see all application packages regardless of claim state"
	);
	it.todo(
		"unclaimed packages are visible to any underwriter (jr, regular, or sr)"
	);
	it.todo(
		"claimed packages are only visible to the underwriter who claimed them"
	);
	it.todo(
		"packages pending decision review are visible to the claimer and designated reviewers"
	);
	it.todo(
		"denies access to a non-underwriter role (e.g. broker) for any package"
	);
	it.todo("grants access for a FairLend admin regardless of claim state");
});
