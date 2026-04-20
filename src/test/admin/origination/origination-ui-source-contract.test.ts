import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
	return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("origination UI source contracts", () => {
	it("uses borrower autocomplete in participants instead of a raw borrower ID field", () => {
		const participantsSource = readWorkspaceFile(
			"src/components/admin/origination/ParticipantsStep.tsx"
		);
		const autocompleteSource = readWorkspaceFile(
			"src/components/admin/origination/BorrowerAutocompleteField.tsx"
		);

		expect(participantsSource).toContain("BorrowerAutocompleteField");
		expect(participantsSource).toContain("BrokerAutocompleteField");
		expect(participantsSource).toContain('label="Existing borrower"');
		expect(participantsSource).not.toContain("Existing borrower ID");
		expect(participantsSource).not.toContain("Broker of record ID");
		expect(participantsSource).not.toContain("Assigned broker ID");
		expect(autocompleteSource).toContain("Search by borrower name or email");
	});

	it("keeps collections constrained to the two supported strategies and borrower-first Rotessa flow", () => {
		const source = readWorkspaceFile(
			"src/components/admin/origination/CollectionsStep.tsx"
		);

		expect(source).toContain("1. Select borrower");
		expect(source).toContain("2. Select or create payment schedule");
		expect(source).toContain("Create new payment schedule");
		expect(source).toContain("Select or create a borrower in the first column");
		expect(source).toContain("Schedules already linked elsewhere stay visible but");
		expect(source).toContain("Uploaded signed PAD");
		expect(source).toContain("Admin override with reason");
		expect(source).not.toContain("No collection rail yet");
	});

	it("uses the compact workspace hero instead of the older tall metadata shell", () => {
		const pageSource = readWorkspaceFile(
			"src/components/admin/origination/OriginationWorkspacePage.tsx"
		);
		const heroSource = readWorkspaceFile(
			"src/components/admin/origination/OriginationWorkspaceHero.tsx"
		);
		const stepCardSource = readWorkspaceFile(
			"src/components/admin/origination/OriginationStepCard.tsx"
		);
		const bootstrapSource = readWorkspaceFile(
			"src/components/admin/origination/NewOriginationBootstrap.tsx"
		);
		const indexSource = readWorkspaceFile(
			"src/components/admin/origination/OriginationCasesIndexPage.tsx"
		);

		expect(pageSource).toContain("OriginationWorkspaceHero");
		expect(pageSource).not.toContain("summary=");
		expect(pageSource).not.toContain("details=");
		expect(pageSource).not.toContain("Draft contract");
		expect(heroSource).not.toContain("Workspace details");
		expect(stepCardSource).not.toContain("CardDescription");
		expect(bootstrapSource).not.toContain("Create a durable draft case");
		expect(indexSource).not.toContain("Draft mortgage-backed originations staged in backoffice");
	});

	it("uses address autocomplete instead of raw property IDs and manual hero image URLs", () => {
		const propertySource = readWorkspaceFile(
			"src/components/admin/origination/PropertyStep.tsx"
		);
		const listingSource = readWorkspaceFile(
			"src/components/admin/origination/ListingCurationStep.tsx"
		);

		expect(propertySource).toContain("searchGoogleAddressPredictions");
		expect(propertySource).toContain("Powered by Google");
		expect(propertySource).toContain("Google geocoding result");
		expect(propertySource).toContain("Manual entry is available");
		expect(propertySource).toContain("Staged property fields");
		expect(propertySource).toContain("PropertyAutocompleteField");
		expect(propertySource).not.toContain("Existing property ID");
		expect(propertySource).not.toContain("Related document asset ID");
		expect(listingSource).toContain("ListingHeroImagesField");
		expect(listingSource).not.toContain("One image URL or asset reference per line");
	});
});
