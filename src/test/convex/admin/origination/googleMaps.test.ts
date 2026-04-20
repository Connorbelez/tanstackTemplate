import { describe, expect, it } from "vitest";
import {
	mapGoogleAddressSuggestions,
	mapGoogleGeocodeToPropertyCreateDraft,
} from "../../../../../convex/admin/origination/properties";

describe("admin origination google maps helpers", () => {
	it("maps Google autocomplete responses into compact address suggestions", () => {
		expect(
			mapGoogleAddressSuggestions({
				suggestions: [
					{
						placePrediction: {
							placeId: "place_1",
							structuredFormat: {
								mainText: {
									text: "123 King St W",
								},
								secondaryText: {
									text: "Toronto, ON, Canada",
								},
							},
							text: {
								text: "123 King St W, Toronto, ON, Canada",
							},
						},
					},
				],
			})
		).toEqual([
			{
				fullText: "123 King St W, Toronto, ON, Canada",
				placeId: "place_1",
				primaryText: "123 King St W",
				secondaryText: "Toronto, ON, Canada",
			},
		]);
	});

	it("extracts structured property fields and coordinates from Google geocoding", () => {
		expect(
			mapGoogleGeocodeToPropertyCreateDraft({
				addressComponents: [
					{
						longText: "250",
						shortText: "250",
						types: ["street_number"],
					},
					{
						longText: "Yonge Street",
						shortText: "Yonge St",
						types: ["route"],
					},
					{
						longText: "Unit 1801",
						shortText: "1801",
						types: ["subpremise"],
					},
					{
						longText: "Toronto",
						shortText: "Toronto",
						types: ["locality", "political"],
					},
					{
						longText: "Ontario",
						shortText: "ON",
						types: ["administrative_area_level_1", "political"],
					},
					{
						longText: "M5B 2L7",
						shortText: "M5B 2L7",
						types: ["postal_code"],
					},
				],
				formattedAddress: "250 Yonge St Unit 1801, Toronto, ON M5B 2L7, Canada",
				location: {
					latitude: 43.6546,
					longitude: -79.3807,
				},
				placeId: "place_250_yonge",
				postalAddress: {
					addressLines: ["250 Yonge St"],
					administrativeArea: "ON",
					languageCode: "en",
					locality: "Toronto",
					postalCode: "M5B 2L7",
					regionCode: "CA",
				},
				types: ["street_address"],
			})
		).toEqual({
			approximateLatitude: 43.6546,
			approximateLongitude: -79.3807,
			city: "Toronto",
			googlePlaceData: {
				addressComponents: [
					{
						longText: "250",
						shortText: "250",
						types: ["street_number"],
					},
					{
						longText: "Yonge Street",
						shortText: "Yonge St",
						types: ["route"],
					},
					{
						longText: "Unit 1801",
						shortText: "1801",
						types: ["subpremise"],
					},
					{
						longText: "Toronto",
						shortText: "Toronto",
						types: ["locality", "political"],
					},
					{
						longText: "Ontario",
						shortText: "ON",
						types: ["administrative_area_level_1", "political"],
					},
					{
						longText: "M5B 2L7",
						shortText: "M5B 2L7",
						types: ["postal_code"],
					},
				],
				formattedAddress:
					"250 Yonge St Unit 1801, Toronto, ON M5B 2L7, Canada",
				location: {
					latitude: 43.6546,
					longitude: -79.3807,
				},
				placeId: "place_250_yonge",
				postalAddress: {
					addressLines: ["250 Yonge St"],
					administrativeArea: "ON",
					languageCode: "en",
					locality: "Toronto",
					postalCode: "M5B 2L7",
					regionCode: "CA",
				},
				types: ["street_address"],
			},
			postalCode: "M5B 2L7",
			province: "ON",
			streetAddress: "250 Yonge Street",
			unit: "Unit 1801",
		});
	});
});
