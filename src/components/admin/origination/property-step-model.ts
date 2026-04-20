import type { OriginationPropertyCreateDraft } from "#/lib/admin-origination";

export function formatGoogleResultTypeLabel(type: string) {
	return type
		.replaceAll("_", " ")
		.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function buildGoogleSelectionLabel(
	createDraft: OriginationPropertyCreateDraft
) {
	return (
		createDraft.googlePlaceData?.formattedAddress ||
		[createDraft.streetAddress, createDraft.city, createDraft.province]
			.filter(Boolean)
			.join(", ") ||
		""
	);
}

export function buildCoordinatesLabel(args: {
	approximateLatitude?: number;
	approximateLongitude?: number;
}) {
	if (
		typeof args.approximateLatitude !== "number" ||
		typeof args.approximateLongitude !== "number"
	) {
		return "Coordinates pending";
	}

	return `${args.approximateLatitude.toFixed(6)}, ${args.approximateLongitude.toFixed(6)}`;
}

export function hasGoogleGeocodeResult(
	createDraft: OriginationPropertyCreateDraft
) {
	return Boolean(
		createDraft.googlePlaceData?.placeId ||
			createDraft.googlePlaceData?.formattedAddress
	);
}
