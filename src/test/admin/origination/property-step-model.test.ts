import { describe, expect, it } from "vitest";
import {
	buildCoordinatesLabel,
	buildGoogleSelectionLabel,
	formatGoogleResultTypeLabel,
	hasGoogleGeocodeResult,
} from "#/components/admin/origination/property-step-model";

describe("property step model", () => {
	it("formats Google result types for operator-facing display", () => {
		expect(formatGoogleResultTypeLabel("street_address")).toBe("Street Address");
		expect(formatGoogleResultTypeLabel("premise")).toBe("Premise");
	});

	it("prefers the formatted Google address when building the lookup label", () => {
		expect(
			buildGoogleSelectionLabel({
				city: "Toronto",
				googlePlaceData: {
					formattedAddress:
						"250 Yonge St Unit 1801, Toronto, ON M5B 2L7, Canada",
					placeId: "place_250_yonge",
				},
				province: "ON",
				streetAddress: "250 Yonge Street",
			})
		).toBe("250 Yonge St Unit 1801, Toronto, ON M5B 2L7, Canada");
	});

	it("falls back to staged draft fields when no Google formatted address is present", () => {
		expect(
			buildGoogleSelectionLabel({
				city: "Toronto",
				province: "ON",
				streetAddress: "123 King St W",
			})
		).toBe("123 King St W, Toronto, ON");
	});

	it("detects when a staged property draft still has a Google geocode result attached", () => {
		expect(
			hasGoogleGeocodeResult({
				googlePlaceData: {
					placeId: "place_123",
				},
			})
		).toBe(true);
		expect(hasGoogleGeocodeResult({})).toBe(false);
	});

	it("formats coordinates for display and shows a pending state when incomplete", () => {
		expect(
			buildCoordinatesLabel({
				approximateLatitude: 43.6546,
				approximateLongitude: -79.3807,
			})
		).toBe("43.654600, -79.380700");
		expect(
			buildCoordinatesLabel({
				approximateLatitude: 43.6546,
			})
		).toBe("Coordinates pending");
	});
});
