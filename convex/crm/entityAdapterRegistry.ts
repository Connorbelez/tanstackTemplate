import type { Doc, Id } from "../_generated/dataModel";
import { materializeFieldDef } from "./metadataCompiler";
import type {
	EntityViewAdapterContract,
	EntityViewComputedFieldContract,
	EntityViewFieldOverrideContract,
	EntityViewLayoutDefaultsContract,
	ViewLayout,
} from "./types";

type FieldDef = Doc<"fieldDefs">;
type MaterializedFieldDef = ReturnType<typeof materializeFieldDef>;
type ObjectDef = Doc<"objectDefs">;

interface EntityViewAdapterDefinition {
	aliases?: readonly string[];
	computedFields?: readonly EntityViewComputedFieldContract[];
	detail: EntityViewAdapterContract["detail"];
	entityType: string;
	fieldOverrides?: readonly EntityViewFieldOverrideContract[];
	layoutDefaults?: Partial<EntityViewLayoutDefaultsContract>;
	statusFieldCandidates?: readonly string[];
	titleFieldCandidates?: readonly string[];
}

const DEFAULT_STATUS_FIELD_CANDIDATES = ["status", "stage"] as const;
const DEFAULT_TITLE_FIELD_CANDIDATES = [
	"name",
	"title",
	"company_name",
	"address",
	"brokerageName",
] as const;

const DEDICATED_ENTITY_VIEW_ADAPTERS = [
	{
		entityType: "mortgages",
		aliases: ["mortgage"],
		detail: { mode: "dedicated", surfaceKey: "mortgages" },
		computedFields: [
			{
				description:
					"Hydrated property summary for mortgage-backed admin views.",
				expressionKey: "mortgagePropertySummary",
				fieldName: "propertySummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Property",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["propertyId"],
			},
			{
				description: "Hydrated borrower rollup for the mortgage relationship.",
				expressionKey: "mortgageBorrowerSummary",
				fieldName: "borrowerSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Borrowers",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: [],
			},
			{
				description: "Hydrated listing summary when the mortgage is published.",
				expressionKey: "mortgageListingSummary",
				fieldName: "listingSummary",
				fieldType: "text",
				isVisibleByDefault: false,
				label: "Listing",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: [],
			},
			{
				description: "Formatted payment setup summary for servicing context.",
				expressionKey: "mortgagePaymentSummary",
				fieldName: "paymentSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Payment Setup",
				materializationMode: "sync",
				rendererHint: "computed",
				sourceFieldNames: ["paymentAmount", "paymentFrequency", "rateType"],
			},
		],
		fieldOverrides: [
			{
				fieldName: "interestRate",
				label: "Rate",
			},
			{
				fieldName: "loanType",
				label: "Loan",
			},
		],
		layoutDefaults: {
			calendarDateFieldName: "maturityDate",
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"propertySummary",
				"principal",
				"interestRate",
				"paymentSummary",
				"borrowerSummary",
				"loanType",
				"maturityDate",
				"status",
			],
		},
		titleFieldCandidates: ["propertySummary", "name", "title"],
	},
	{
		entityType: "obligations",
		aliases: ["obligation"],
		detail: { mode: "dedicated", surfaceKey: "obligations" },
		computedFields: [
			{
				description:
					"Hydrated mortgage summary for obligation context and navigation.",
				expressionKey: "obligationMortgageSummary",
				fieldName: "mortgageSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Mortgage",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["mortgageId"],
			},
			{
				description: "Hydrated borrower summary for the obligation owner.",
				expressionKey: "obligationBorrowerSummary",
				fieldName: "borrowerSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Borrower",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["borrowerId"],
			},
			{
				description: "Formatted settlement progress for the obligation.",
				expressionKey: "obligationPaymentProgressSummary",
				fieldName: "paymentProgressSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Settlement",
				materializationMode: "sync",
				rendererHint: "computed",
				sourceFieldNames: ["amount", "amountSettled", "status"],
			},
		],
		layoutDefaults: {
			calendarDateFieldName: "dueDate",
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"mortgageSummary",
				"borrowerSummary",
				"paymentNumber",
				"type",
				"amount",
				"paymentProgressSummary",
				"dueDate",
				"status",
			],
		},
		titleFieldCandidates: ["mortgageSummary"],
	},
	{
		entityType: "deals",
		aliases: ["deal"],
		detail: { mode: "dedicated", surfaceKey: "deals" },
		layoutDefaults: {
			calendarDateFieldName: "closingDate",
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"closingDate",
				"fractionalShare",
				"lockingFeeAmount",
				"status",
			],
		},
	},
	{
		entityType: "borrowers",
		aliases: ["borrower"],
		detail: { mode: "dedicated", surfaceKey: "borrowers" },
		computedFields: [
			{
				description: "Hydrated borrower display name from the linked user.",
				expressionKey: "borrowerDisplayName",
				fieldName: "borrowerName",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Borrower",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["userId"],
			},
			{
				description:
					"Derived borrower verification summary from lifecycle and IDV state.",
				expressionKey: "borrowerVerificationSummary",
				fieldName: "verificationSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Verification Summary",
				materializationMode: "sync",
				rendererHint: "computed",
				sourceFieldNames: ["status", "idvStatus"],
			},
		],
		fieldOverrides: [
			{
				fieldName: "status",
				label: "Borrower Status",
				preferredDisplayOrder: 0,
			},
			{
				fieldName: "idvStatus",
				label: "Identity Verification",
				preferredDisplayOrder: 1,
			},
		],
		layoutDefaults: {
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"borrowerName",
				"status",
				"idvStatus",
				"verificationSummary",
				"onboardedAt",
			],
		},
		titleFieldCandidates: ["borrowerName"],
	},
	{
		entityType: "lenders",
		aliases: ["lender"],
		detail: { mode: "dedicated", surfaceKey: "lenders" },
		computedFields: [
			{
				description:
					"Hydrated display name from the lender's linked user profile.",
				expressionKey: "lenderUserDisplayName",
				fieldName: "lenderName",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Name",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["userId"],
			},
			{
				description: "Email address from the lender's linked user profile.",
				expressionKey: "lenderContactEmail",
				fieldName: "contactEmail",
				fieldType: "email",
				isVisibleByDefault: true,
				label: "Email",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["userId"],
			},
			{
				description: "Phone number from the lender's linked user profile.",
				expressionKey: "lenderContactPhone",
				fieldName: "contactPhone",
				fieldType: "phone",
				isVisibleByDefault: false,
				label: "Phone",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["userId"],
			},
			{
				description:
					"Brokerage and licensing details from the sponsoring broker record.",
				expressionKey: "lenderBrokerRollup",
				fieldName: "brokerSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Broker",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["brokerId"],
			},
			{
				description:
					"Resolved organization name from the WorkOS-linked organization record.",
				expressionKey: "lenderOrganizationName",
				fieldName: "organizationName",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Organization",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["orgId"],
			},
		],
		layoutDefaults: {
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"lenderName",
				"contactEmail",
				"contactPhone",
				"brokerSummary",
				"organizationName",
				"status",
				"accreditationStatus",
				"idvStatus",
				"kycStatus",
				"payoutFrequency",
				"lastPayoutDate",
				"minimumPayoutCents",
				"activatedAt",
				"createdAt",
			],
		},
		titleFieldCandidates: ["lenderName", "contactEmail", "name", "title"],
	},
	{
		entityType: "brokers",
		aliases: ["broker"],
		detail: { mode: "dedicated", surfaceKey: "brokers" },
		computedFields: [
			{
				description:
					"Hydrated contact name from the broker's linked user profile.",
				expressionKey: "brokerUserDisplayName",
				fieldName: "brokerContactName",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Contact Name",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["userId"],
			},
			{
				description: "Email address from the broker's linked user profile.",
				expressionKey: "brokerContactEmail",
				fieldName: "contactEmail",
				fieldType: "email",
				isVisibleByDefault: true,
				label: "Email",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["userId"],
			},
			{
				description: "Phone number from the broker's linked user profile.",
				expressionKey: "brokerContactPhone",
				fieldName: "contactPhone",
				fieldType: "phone",
				isVisibleByDefault: false,
				label: "Phone",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["userId"],
			},
			{
				description:
					"Resolved organization name from the WorkOS-linked organization record.",
				expressionKey: "brokerOrganizationName",
				fieldName: "organizationName",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Organization",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["orgId"],
			},
		],
		layoutDefaults: {
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"brokerContactName",
				"contactEmail",
				"contactPhone",
				"brokerageName",
				"organizationName",
				"licenseId",
				"licenseProvince",
				"status",
				"onboardedAt",
				"createdAt",
			],
		},
		titleFieldCandidates: [
			"brokerContactName",
			"brokerageName",
			"name",
			"title",
		],
	},
	{
		entityType: "listings",
		aliases: ["listing"],
		detail: { mode: "dedicated", surfaceKey: "listings" },
		computedFields: [
			{
				description:
					"Hydrated property summary when the listing is linked to a property record.",
				expressionKey: "listingPropertySummary",
				fieldName: "propertySummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Property",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["propertyId"],
			},
			{
				description:
					"Payment amount paired with the actual cadence so mortgage-backed listings never imply a synthetic monthly-equivalent payment.",
				expressionKey: "listingPaymentSummary",
				fieldName: "paymentSummary",
				fieldType: "text",
				isVisibleByDefault: true,
				label: "Payment",
				rendererHint: "computed",
				sourceFieldNames: ["monthlyPayment", "paymentFrequency"],
			},
			{
				description:
					"Hydrated mortgage summary when the listing is linked to a mortgage record.",
				expressionKey: "listingMortgageSummary",
				fieldName: "mortgageSummary",
				fieldType: "text",
				isVisibleByDefault: false,
				label: "Mortgage",
				materializationMode: "hydrated",
				rendererHint: "computed",
				sourceFieldNames: ["mortgageId"],
			},
		],
		fieldOverrides: [
			{
				fieldName: "ltvRatio",
				label: "LTV",
			},
			{
				fieldName: "latestAppraisalValueAsIs",
				label: "Appraisal",
			},
		],
		layoutDefaults: {
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"title",
				"propertySummary",
				"status",
				"propertyType",
				"city",
				"province",
				"principal",
				"interestRate",
				"ltvRatio",
				"paymentSummary",
				"latestAppraisalValueAsIs",
				"maturityDate",
			],
		},
		titleFieldCandidates: ["title", "propertySummary", "city"],
	},
	{
		entityType: "properties",
		aliases: ["property"],
		detail: { mode: "dedicated", surfaceKey: "properties" },
	},
] as const satisfies readonly EntityViewAdapterDefinition[];

const ENTITY_VIEW_ADAPTERS_BY_ALIAS = new Map<
	string,
	EntityViewAdapterDefinition
>(
	DEDICATED_ENTITY_VIEW_ADAPTERS.flatMap((definition) => [
		[definition.entityType, definition] as const,
		...(definition.aliases ?? []).map((alias) => [alias, definition] as const),
	])
);

function buildSupportedLayouts(args: {
	currentLayout: ViewLayout;
	fieldDefs: readonly MaterializedFieldDef[];
}): ViewLayout[] {
	const supportedLayouts = new Set<ViewLayout>(["table"]);

	if (
		args.fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.kanban.enabled)
	) {
		supportedLayouts.add("kanban");
	}

	if (
		args.fieldDefs.some(
			(fieldDef) => fieldDef.layoutEligibility.calendar.enabled
		)
	) {
		supportedLayouts.add("calendar");
	}

	supportedLayouts.add(args.currentLayout);
	return [...supportedLayouts];
}

function sanitizeFieldNames(
	fieldNames: readonly string[] | undefined,
	availableFieldNames: ReadonlySet<string>
): string[] {
	if (!fieldNames) {
		return [];
	}

	return fieldNames.filter((fieldName) => availableFieldNames.has(fieldName));
}

function buildAvailableFieldNameSet(args: {
	computedFields?: readonly EntityViewComputedFieldContract[];
	fieldDefs: readonly MaterializedFieldDef[];
}): Set<string> {
	return new Set([
		...args.fieldDefs.map((fieldDef) => fieldDef.name),
		...(args.computedFields ?? []).map((fieldDef) => fieldDef.fieldName),
	]);
}

function resolveFieldCandidate(
	availableFieldNames: ReadonlySet<string>,
	candidates: readonly string[]
): string | undefined {
	return candidates.find((candidate) => availableFieldNames.has(candidate));
}

function deriveFallbackVisibleFields(
	fieldDefs: readonly MaterializedFieldDef[]
): string[] {
	return [...fieldDefs]
		.filter((fieldDef) => fieldDef.isVisibleByDefault)
		.sort((left, right) => left.displayOrder - right.displayOrder)
		.map((fieldDef) => fieldDef.name);
}

function deriveCalendarFieldName(
	fieldDefs: readonly MaterializedFieldDef[]
): string | undefined {
	return fieldDefs.find(
		(fieldDef) => fieldDef.layoutEligibility.calendar.enabled
	)?.name;
}

function deriveKanbanFieldName(
	fieldDefs: readonly MaterializedFieldDef[],
	availableFieldNames: ReadonlySet<string>
): string | undefined {
	return (
		resolveFieldCandidate(
			availableFieldNames,
			DEFAULT_STATUS_FIELD_CANDIDATES
		) ??
		fieldDefs.find((fieldDef) => fieldDef.layoutEligibility.kanban.enabled)
			?.name
	);
}

function resolveEntityViewDefinition(
	objectDef: ObjectDef
): EntityViewAdapterDefinition | undefined {
	const candidates = [
		objectDef.nativeTable,
		objectDef.name,
		objectDef.pluralLabel?.toLowerCase(),
		objectDef.singularLabel?.toLowerCase(),
	].flatMap((value) =>
		typeof value === "string" && value.trim().length > 0
			? [value.trim().toLowerCase()]
			: []
	);

	for (const candidate of candidates) {
		const definition = ENTITY_VIEW_ADAPTERS_BY_ALIAS.get(candidate);
		if (definition) {
			return definition;
		}
	}

	return undefined;
}

function resolveFallbackEntityType(objectDef: ObjectDef): string {
	if (
		typeof objectDef.nativeTable === "string" &&
		objectDef.nativeTable.length > 0
	) {
		return objectDef.nativeTable;
	}

	if (typeof objectDef.name === "string" && objectDef.name.length > 0) {
		return objectDef.name;
	}

	return objectDef.singularLabel.toLowerCase();
}

function buildLayoutDefaults(args: {
	definition: EntityViewAdapterDefinition | undefined;
	fieldDefs: readonly MaterializedFieldDef[];
}): EntityViewLayoutDefaultsContract {
	const availableFieldNames = buildAvailableFieldNameSet({
		computedFields: args.definition?.computedFields,
		fieldDefs: args.fieldDefs,
	});
	const preferredVisibleFieldNames = sanitizeFieldNames(
		args.definition?.layoutDefaults?.preferredVisibleFieldNames,
		availableFieldNames
	);

	return {
		preferredVisibleFieldNames:
			preferredVisibleFieldNames.length > 0
				? preferredVisibleFieldNames
				: deriveFallbackVisibleFields(args.fieldDefs),
		kanbanFieldName:
			args.definition?.layoutDefaults?.kanbanFieldName &&
			availableFieldNames.has(args.definition.layoutDefaults.kanbanFieldName)
				? args.definition.layoutDefaults.kanbanFieldName
				: deriveKanbanFieldName(args.fieldDefs, availableFieldNames),
		calendarDateFieldName:
			args.definition?.layoutDefaults?.calendarDateFieldName &&
			availableFieldNames.has(
				args.definition.layoutDefaults.calendarDateFieldName
			)
				? args.definition.layoutDefaults.calendarDateFieldName
				: deriveCalendarFieldName(args.fieldDefs),
	};
}

function normalizeOverrides(
	overrides: readonly EntityViewFieldOverrideContract[] | undefined,
	fieldDefs: readonly MaterializedFieldDef[],
	computedFields?: readonly EntityViewComputedFieldContract[]
): EntityViewFieldOverrideContract[] {
	const availableFieldNames = buildAvailableFieldNameSet({
		computedFields,
		fieldDefs,
	});
	return (overrides ?? []).filter((override) =>
		availableFieldNames.has(override.fieldName)
	);
}

export function resolveEntityViewAdapterContract(args: {
	currentLayout: ViewLayout;
	fieldDefs: readonly FieldDef[];
	objectDef: ObjectDef;
	objectDefId: Id<"objectDefs">;
}): EntityViewAdapterContract {
	const definition = resolveEntityViewDefinition(args.objectDef);
	const entityType =
		definition?.entityType ?? resolveFallbackEntityType(args.objectDef);
	const materializedFieldDefs = args.fieldDefs.map(materializeFieldDef);
	const availableFieldNames = buildAvailableFieldNameSet({
		computedFields: definition?.computedFields,
		fieldDefs: materializedFieldDefs,
	});

	return {
		variant: definition ? "dedicated" : "fallback",
		entityType,
		objectDefId: args.objectDefId,
		detail: definition?.detail ?? {
			mode: "generated",
			surfaceKey: entityType,
		},
		detailSurfaceKey: definition?.detail.surfaceKey ?? entityType,
		titleFieldName: resolveFieldCandidate(availableFieldNames, [
			...(definition?.titleFieldCandidates ?? []),
			...DEFAULT_TITLE_FIELD_CANDIDATES,
		]),
		statusFieldName: resolveFieldCandidate(availableFieldNames, [
			...(definition?.statusFieldCandidates ?? []),
			...DEFAULT_STATUS_FIELD_CANDIDATES,
		]),
		supportedLayouts: buildSupportedLayouts({
			currentLayout: args.currentLayout,
			fieldDefs: materializedFieldDefs,
		}),
		layoutDefaults: buildLayoutDefaults({
			definition,
			fieldDefs: materializedFieldDefs,
		}),
		fieldOverrides: normalizeOverrides(
			definition?.fieldOverrides,
			materializedFieldDefs,
			definition?.computedFields
		),
		computedFields: [...(definition?.computedFields ?? [])],
	};
}
