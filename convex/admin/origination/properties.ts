import { ConvexError, v } from "convex/values";
import { api } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { viewerCanAccessOrgId } from "../../authz/orgScope";
import { assertOriginationCaseAccess } from "../../authz/origination";
import {
	authedAction,
	authedQuery,
	requirePermission,
	requirePermissionAction,
} from "../../fluent";

const originationQuery = authedQuery.use(
	requirePermission("mortgage:originate")
);
const originationAction = authedAction.use(
	requirePermissionAction("mortgage:originate")
);

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
	"https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_GEOCODE_PLACE_URL_PREFIX =
	"https://geocode.googleapis.com/v4/geocode/places/";

interface GoogleAutocompleteResponse {
	suggestions?: Array<{
		placePrediction?: {
			place?: string;
			placeId?: string;
			structuredFormat?: {
				mainText?: {
					text?: string;
				};
				secondaryText?: {
					text?: string;
				};
			};
			text?: {
				text?: string;
			};
		};
	}>;
}

interface GoogleGeocodeAddressComponent {
	longText?: string;
	shortText?: string;
	types?: string[];
}

interface GoogleGeocodeResponse {
	addressComponents?: GoogleGeocodeAddressComponent[];
	formattedAddress?: string;
	location?: {
		latitude?: number;
		longitude?: number;
	};
	placeId?: string;
	postalAddress?: {
		addressLines?: string[];
		administrativeArea?: string;
		languageCode?: string;
		locality?: string;
		postalCode?: string;
		regionCode?: string;
	};
	types?: string[];
}

interface GoogleAddressSuggestion {
	fullText: string;
	placeId: string;
	primaryText: string;
	secondaryText?: string;
}

function requireGoogleMapsApiKey() {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY;
	if (!apiKey) {
		throw new ConvexError(
			"Missing GOOGLE_MAPS_API_KEY. Configure Google Maps before creating new properties."
		);
	}
	return apiKey;
}

async function readGoogleErrorMessage(response: Response) {
	try {
		const payload = (await response.json()) as {
			error?: { message?: string };
		};
		return payload.error?.message ?? null;
	} catch {
		return null;
	}
}

function componentHasType(
	component: GoogleGeocodeAddressComponent | undefined,
	type: string
) {
	return Boolean(component?.types?.includes(type));
}

function findAddressComponent(
	components: GoogleGeocodeAddressComponent[] | undefined,
	type: string
) {
	return components?.find((component) => componentHasType(component, type));
}

function readComponentText(
	component: GoogleGeocodeAddressComponent | undefined,
	preferShort = false
) {
	if (!component) {
		return undefined;
	}

	if (preferShort) {
		return component.shortText ?? component.longText;
	}

	return component.longText ?? component.shortText;
}

export function mapGoogleAddressSuggestions(
	response: GoogleAutocompleteResponse
) {
	return (response.suggestions ?? [])
		.flatMap((suggestion) => {
			const prediction = suggestion.placePrediction;
			const placeId = prediction?.placeId;
			const fullText = prediction?.text?.text?.trim();
			if (!(placeId && fullText)) {
				return [];
			}

			return [
				{
					fullText,
					placeId,
					primaryText:
						prediction?.structuredFormat?.mainText?.text?.trim() || fullText,
					secondaryText:
						prediction?.structuredFormat?.secondaryText?.text?.trim() ||
						undefined,
				} satisfies GoogleAddressSuggestion,
			];
		})
		.slice(0, 5);
}

export function mapGoogleGeocodeToPropertyCreateDraft(
	response: GoogleGeocodeResponse
) {
	const addressComponents = response.addressComponents ?? [];
	const streetNumber = readComponentText(
		findAddressComponent(addressComponents, "street_number")
	);
	const route = readComponentText(
		findAddressComponent(addressComponents, "route")
	);
	const subpremise = readComponentText(
		findAddressComponent(addressComponents, "subpremise")
	);
	const streetAddress =
		[streetNumber, route].filter(Boolean).join(" ") ||
		response.postalAddress?.addressLines?.[0]?.trim() ||
		undefined;
	const city =
		readComponentText(findAddressComponent(addressComponents, "locality")) ||
		readComponentText(findAddressComponent(addressComponents, "postal_town")) ||
		readComponentText(
			findAddressComponent(addressComponents, "sublocality_level_1")
		) ||
		response.postalAddress?.locality;
	const province =
		readComponentText(
			findAddressComponent(addressComponents, "administrative_area_level_1"),
			true
		) || response.postalAddress?.administrativeArea;
	const postalCode =
		readComponentText(
			findAddressComponent(addressComponents, "postal_code"),
			true
		) || response.postalAddress?.postalCode;
	const approximateLatitude = response.location?.latitude;
	const approximateLongitude = response.location?.longitude;

	return {
		approximateLatitude,
		approximateLongitude,
		city,
		googlePlaceData: {
			addressComponents: response.addressComponents,
			formattedAddress: response.formattedAddress,
			location: response.location,
			placeId: response.placeId ?? "",
			postalAddress: response.postalAddress,
			types: response.types,
		},
		postalCode,
		province,
		streetAddress,
		unit: subpremise,
	};
}

function buildPropertySortLabel(property: {
	city: string;
	postalCode: string;
	province: string;
	streetAddress: string;
	unit?: string | null;
}) {
	return [
		property.unit
			? `${property.streetAddress}, Unit ${property.unit}`
			: property.streetAddress,
		property.city,
		property.province,
		property.postalCode,
	]
		.filter(Boolean)
		.join(" ");
}

export const getPropertySearchContext = originationQuery
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			return null;
		}

		assertOriginationCaseAccess(ctx.viewer, caseRecord);

		const [properties, mortgages] = await Promise.all([
			ctx.db.query("properties").collect(),
			ctx.db.query("mortgages").collect(),
		]);

		const mortgagesByProperty = new Map<
			string,
			Pick<Doc<"mortgages">, "_id" | "orgId" | "propertyId">[]
		>();
		for (const mortgage of mortgages) {
			const propertyKey = String(mortgage.propertyId);
			const bucket = mortgagesByProperty.get(propertyKey) ?? [];
			bucket.push({
				_id: mortgage._id,
				orgId: mortgage.orgId,
				propertyId: mortgage.propertyId,
			});
			mortgagesByProperty.set(propertyKey, bucket);
		}

		const viewerOrgId = caseRecord.orgId ?? ctx.viewer.orgId;
		const searchResults = properties
			.flatMap((property) => {
				const propertyMortgages =
					mortgagesByProperty.get(String(property._id)) ?? [];

				if (
					propertyMortgages.some(
						(mortgage) =>
							mortgage.orgId &&
							!viewerCanAccessOrgId(ctx.viewer, mortgage.orgId ?? viewerOrgId)
					)
				) {
					return [];
				}

				const visibleMortgageCount = propertyMortgages.filter(
					(mortgage) =>
						!mortgage.orgId ||
						viewerCanAccessOrgId(ctx.viewer, mortgage.orgId ?? viewerOrgId)
				).length;

				return [
					{
						approximateLatitude: property.latitude ?? null,
						approximateLongitude: property.longitude ?? null,
						city: property.city,
						hasExistingMortgage: visibleMortgageCount > 0,
						mortgageCount: visibleMortgageCount,
						postalCode: property.postalCode,
						propertyId: property._id,
						propertyType: property.propertyType,
						province: property.province,
						streetAddress: property.streetAddress,
						unit: property.unit ?? null,
					},
				];
			})
			.sort((left, right) =>
				buildPropertySortLabel(left).localeCompare(
					buildPropertySortLabel(right),
					undefined,
					{ sensitivity: "base" }
				)
			);

		return { searchResults };
	})
	.public();

export const searchGoogleAddressPredictions = originationAction
	.input({
		caseId: v.id("adminOriginationCases"),
		input: v.string(),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.runQuery(api.admin.origination.cases.getCase, {
			caseId: args.caseId,
		});
		if (!caseRecord) {
			return { suggestions: [] };
		}

		assertOriginationCaseAccess(ctx.viewer, caseRecord);

		const input = args.input.trim();
		if (input.length < 3) {
			return { suggestions: [] };
		}

		const apiKey = requireGoogleMapsApiKey();
		const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
			body: JSON.stringify({
				includeQueryPredictions: false,
				includedRegionCodes: ["ca"],
				input,
				languageCode: "en",
				regionCode: "ca",
			}),
			headers: {
				"Content-Type": "application/json",
				"X-Goog-Api-Key": apiKey,
				"X-Goog-FieldMask":
					"suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
			},
			method: "POST",
		});

		if (!response.ok) {
			const errorMessage =
				(await readGoogleErrorMessage(response)) ??
				"Google Maps autocomplete request failed.";
			throw new ConvexError(errorMessage);
		}

		const payload = (await response.json()) as GoogleAutocompleteResponse;
		return {
			suggestions: mapGoogleAddressSuggestions(payload),
		};
	})
	.public();

export const resolveGoogleAddressPrediction = originationAction
	.input({
		caseId: v.id("adminOriginationCases"),
		placeId: v.string(),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.runQuery(api.admin.origination.cases.getCase, {
			caseId: args.caseId,
		});
		if (!caseRecord) {
			return null;
		}

		assertOriginationCaseAccess(ctx.viewer, caseRecord);

		const apiKey = requireGoogleMapsApiKey();
		const response = await fetch(
			`${GOOGLE_GEOCODE_PLACE_URL_PREFIX}${encodeURIComponent(args.placeId)}`,
			{
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": apiKey,
					"X-Goog-FieldMask":
						"placeId,formattedAddress,location,addressComponents,postalAddress,types",
				},
				method: "GET",
			}
		);

		if (!response.ok) {
			const errorMessage =
				(await readGoogleErrorMessage(response)) ??
				"Google Maps place geocoding request failed.";
			throw new ConvexError(errorMessage);
		}

		const payload = (await response.json()) as GoogleGeocodeResponse;
		const resolvedDraft = mapGoogleGeocodeToPropertyCreateDraft(payload);
		if (
			!(
				resolvedDraft.streetAddress &&
				resolvedDraft.city &&
				resolvedDraft.province &&
				resolvedDraft.postalCode &&
				typeof resolvedDraft.approximateLatitude === "number" &&
				typeof resolvedDraft.approximateLongitude === "number" &&
				resolvedDraft.googlePlaceData.placeId
			)
		) {
			throw new ConvexError(
				"Selected Google address is missing one or more required property fields."
			);
		}

		return {
			formattedAddress:
				payload.formattedAddress ?? resolvedDraft.streetAddress ?? null,
			resolvedDraft,
		};
	})
	.public();
