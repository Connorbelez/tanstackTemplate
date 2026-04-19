import type {
	OriginationPropertyDraft,
	OriginationPropertyType,
} from "#/lib/admin-origination";

export interface PropertyAutocompleteOption {
	approximateLatitude: number | null;
	approximateLongitude: number | null;
	city: string;
	hasExistingMortgage: boolean;
	mortgageCount: number;
	postalCode: string;
	propertyId: string;
	propertyType: OriginationPropertyType;
	province: string;
	streetAddress: string;
	unit: string | null;
}

export function buildPropertyAddressLabel(
	property: Pick<PropertyAutocompleteOption, "streetAddress" | "unit">
) {
	return property.unit
		? `${property.streetAddress}, Unit ${property.unit}`
		: property.streetAddress;
}

export function buildPropertyLocationLabel(
	property: Pick<PropertyAutocompleteOption, "city" | "postalCode" | "province">
) {
	return [property.city, property.province, property.postalCode]
		.filter(Boolean)
		.join(" ");
}

export function resolveSelectedPropertyOption(args: {
	fallbackProperty?: PropertyAutocompleteOption | null;
	propertyOptions: PropertyAutocompleteOption[];
	selectedPropertyId?: string | null;
}) {
	if (!args.selectedPropertyId) {
		return null;
	}

	return (
		args.propertyOptions.find(
			(property) => property.propertyId === args.selectedPropertyId
		) ??
		args.fallbackProperty ??
		null
	);
}

export function listPropertyAutocompleteOptions(args: {
	propertyOptions: PropertyAutocompleteOption[];
	search: string;
	selectedProperty: PropertyAutocompleteOption | null;
}) {
	const searchablePropertyOptions =
		args.selectedProperty &&
		!args.propertyOptions.some(
			(property) => property.propertyId === args.selectedProperty?.propertyId
		)
			? [args.selectedProperty, ...args.propertyOptions]
			: args.propertyOptions;
	const normalizedQuery = args.search.trim().toLowerCase();

	if (!normalizedQuery) {
		return searchablePropertyOptions.slice(0, 8);
	}

	return searchablePropertyOptions
		.filter((property) =>
			[
				buildPropertyAddressLabel(property),
				buildPropertyLocationLabel(property),
				property.propertyType,
			]
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery)
		)
		.slice(0, 8);
}

export function buildPropertyDraftFromSelection(
	property: PropertyAutocompleteOption
): OriginationPropertyDraft {
	return {
		propertyId: property.propertyId,
		create: {
			approximateLatitude: property.approximateLatitude ?? undefined,
			approximateLongitude: property.approximateLongitude ?? undefined,
			city: property.city,
			postalCode: property.postalCode,
			propertyType: property.propertyType,
			province: property.province,
			streetAddress: property.streetAddress,
			unit: property.unit ?? undefined,
		},
	};
}

export function buildFallbackPropertyOption(args: {
	propertyDraft: OriginationPropertyDraft | undefined;
}) {
	const propertyId = args.propertyDraft?.propertyId;
	const createDraft = args.propertyDraft?.create;

	if (
		!(
			propertyId &&
			createDraft?.streetAddress &&
			createDraft.city &&
			createDraft.province &&
			createDraft.postalCode &&
			createDraft.propertyType
		)
	) {
		return null;
	}

	return {
		approximateLatitude: createDraft.approximateLatitude ?? null,
		approximateLongitude: createDraft.approximateLongitude ?? null,
		city: createDraft.city,
		hasExistingMortgage: false,
		mortgageCount: 0,
		postalCode: createDraft.postalCode,
		propertyId,
		propertyType: createDraft.propertyType,
		province: createDraft.province,
		streetAddress: createDraft.streetAddress,
		unit: createDraft.unit ?? null,
	} satisfies PropertyAutocompleteOption;
}
