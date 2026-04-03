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
		layoutDefaults: {
			calendarDateFieldName: "maturityDate",
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"principal",
				"paymentAmount",
				"interestRate",
				"paymentFrequency",
				"loanType",
				"maturityDate",
				"status",
			],
		},
		titleFieldCandidates: ["name", "title"],
	},
	{
		entityType: "obligations",
		aliases: ["obligation"],
		detail: { mode: "dedicated", surfaceKey: "obligations" },
		layoutDefaults: {
			calendarDateFieldName: "dueDate",
			kanbanFieldName: "status",
			preferredVisibleFieldNames: ["amount", "dueDate", "type", "status"],
		},
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
				description:
					"Derived borrower verification summary from lifecycle and IDV state.",
				expressionKey: "borrowerVerificationSummary",
				fieldName: "verificationSummary",
				fieldType: "text",
				isVisibleByDefault: false,
				label: "Verification Summary",
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
			preferredVisibleFieldNames: ["status", "idvStatus"],
		},
	},
	{
		entityType: "lenders",
		aliases: ["lender"],
		detail: { mode: "dedicated", surfaceKey: "lenders" },
		layoutDefaults: {
			kanbanFieldName: "status",
			preferredVisibleFieldNames: [
				"status",
				"accreditationStatus",
				"payoutFrequency",
			],
		},
	},
	{
		entityType: "brokers",
		aliases: ["broker"],
		detail: { mode: "dedicated", surfaceKey: "brokers" },
		layoutDefaults: {
			kanbanFieldName: "status",
			preferredVisibleFieldNames: ["status", "brokerageName", "licenseId"],
		},
		titleFieldCandidates: ["brokerageName", "name", "title"],
	},
	{
		entityType: "listings",
		aliases: ["listing"],
		detail: { mode: "dedicated", surfaceKey: "listings" },
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

function resolveFieldCandidate(
	fieldDefs: readonly MaterializedFieldDef[],
	candidates: readonly string[]
): string | undefined {
	const availableFieldNames = new Set(
		fieldDefs.map((fieldDef) => fieldDef.name)
	);
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
	fieldDefs: readonly MaterializedFieldDef[]
): string | undefined {
	return (
		resolveFieldCandidate(fieldDefs, DEFAULT_STATUS_FIELD_CANDIDATES) ??
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
	const availableFieldNames = new Set(
		args.fieldDefs.map((fieldDef) => fieldDef.name)
	);
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
				: deriveKanbanFieldName(args.fieldDefs),
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
	fieldDefs: readonly MaterializedFieldDef[]
): EntityViewFieldOverrideContract[] {
	const availableFieldNames = new Set(
		fieldDefs.map((fieldDef) => fieldDef.name)
	);
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

	return {
		variant: definition ? "dedicated" : "fallback",
		entityType,
		objectDefId: args.objectDefId,
		detail: definition?.detail ?? {
			mode: "generated",
			surfaceKey: entityType,
		},
		detailSurfaceKey: definition?.detail.surfaceKey ?? entityType,
		titleFieldName: resolveFieldCandidate(materializedFieldDefs, [
			...(definition?.titleFieldCandidates ?? []),
			...DEFAULT_TITLE_FIELD_CANDIDATES,
		]),
		statusFieldName: resolveFieldCandidate(materializedFieldDefs, [
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
			materializedFieldDefs
		),
		computedFields: [...(definition?.computedFields ?? [])],
	};
}
