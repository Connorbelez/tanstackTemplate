import { describe, expect, it } from "vitest";
import {
	buildPropertyDraftFromSelection,
	listPropertyAutocompleteOptions,
	resolveSelectedPropertyOption,
} from "#/components/admin/origination/property-autocomplete-model";

describe("property autocomplete model", () => {
	const propertyOptions = [
		{
			approximateLatitude: 43.6487,
			approximateLongitude: -79.3817,
			city: "Toronto",
			hasExistingMortgage: true,
			mortgageCount: 1,
			postalCode: "M5H 1J9",
			propertyId: "property_king",
			propertyType: "commercial" as const,
			province: "ON",
			streetAddress: "123 King St W",
			unit: "500",
		},
		{
			approximateLatitude: 43.6532,
			approximateLongitude: -79.3832,
			city: "Toronto",
			hasExistingMortgage: false,
			mortgageCount: 0,
			postalCode: "M5V 3A8",
			propertyId: "property_queen",
			propertyType: "residential" as const,
			province: "ON",
			streetAddress: "456 Queen St W",
			unit: null,
		},
	];

	it("hydrates staged property drafts from a selected property", () => {
		expect(buildPropertyDraftFromSelection(propertyOptions[0])).toEqual({
			create: {
				approximateLatitude: 43.6487,
				approximateLongitude: -79.3817,
				city: "Toronto",
				postalCode: "M5H 1J9",
				propertyType: "commercial",
				province: "ON",
				streetAddress: "123 King St W",
				unit: "500",
			},
			propertyId: "property_king",
		});
	});

	it("filters autocomplete options by address and preserves the selected property in the result set", () => {
		const selectedProperty = resolveSelectedPropertyOption({
			propertyOptions,
			selectedPropertyId: "property_king",
		});

		expect(selectedProperty).toEqual(propertyOptions[0]);
		expect(
			listPropertyAutocompleteOptions({
				propertyOptions,
				search: "queen",
				selectedProperty,
			})
		).toEqual([propertyOptions[1]]);
	});
});
