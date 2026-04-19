import type { Doc, Id } from "../_generated/dataModel";
import { resolveEntityViewAdapterContract } from "./entityAdapterRegistry";
import { materializeFieldDefinition } from "./metadataCompiler";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	UnifiedRecord,
	ViewLayout,
} from "./types";

type FieldDef = Doc<"fieldDefs">;
type ObjectDef = Doc<"objectDefs">;
const DISPLAY_LABEL_SPLIT_PATTERN = /[\s._-]+/;

function buildSchemaOrderHints(args: {
	adapterContract: EntityViewAdapterContract;
	viewIsDefault: boolean;
}): Map<string, number> {
	const orderHints = new Map<string, number>();

	if (!args.viewIsDefault) {
		return orderHints;
	}

	args.adapterContract.layoutDefaults.preferredVisibleFieldNames.forEach(
		(fieldName, index) => {
			orderHints.set(fieldName, index);
		}
	);

	return orderHints;
}

function buildFieldOverridesByName(
	adapterContract: EntityViewAdapterContract
): Map<string, EntityViewAdapterContract["fieldOverrides"][number]> {
	return new Map(
		adapterContract.fieldOverrides.map((override) => [
			override.fieldName,
			override,
		])
	);
}

function toSyntheticFieldDefId(fieldName: string): Id<"fieldDefs"> {
	return `computed:${fieldName}` as Id<"fieldDefs">;
}

function applyFieldOverridesToDefinition(args: {
	applyLayoutVisibility: boolean;
	currentLayout: ViewLayout;
	field: NormalizedFieldDefinition;
	override?: EntityViewAdapterContract["fieldOverrides"][number];
}): NormalizedFieldDefinition {
	const hiddenInCurrentLayout =
		args.applyLayoutVisibility &&
		(args.override?.hiddenInLayouts?.includes(args.currentLayout) ?? false);

	return {
		...args.field,
		displayOrder: args.field.displayOrder,
		isVisibleByDefault: hiddenInCurrentLayout
			? false
			: (args.override?.isVisibleByDefault ?? args.field.isVisibleByDefault),
		label: args.override?.label ?? args.field.label,
	};
}

function toComputedNormalizedFieldDefinition(args: {
	computedField: EntityViewAdapterContract["computedFields"][number];
	displayOrder: number;
	objectDefId: Id<"objectDefs">;
}): NormalizedFieldDefinition {
	return {
		aggregation: {
			enabled: false,
			reason: "Computed adapter fields do not support aggregation.",
			supportedFunctions: [],
		},
		computed: {
			expressionKey: args.computedField.expressionKey,
			sourceFieldNames: args.computedField.sourceFieldNames,
		},
		description: args.computedField.description,
		displayOrder: args.displayOrder,
		editability: {
			mode: "computed",
			reason: "Computed adapter fields are read-only projections.",
		},
		fieldDefId: toSyntheticFieldDefId(args.computedField.fieldName),
		fieldSource: "adapter_computed",
		fieldType: args.computedField.fieldType,
		isActive: true,
		isRequired: false,
		isUnique: false,
		isVisibleByDefault: args.computedField.isVisibleByDefault,
		label: args.computedField.label,
		layoutEligibility: {
			table: { enabled: true },
			kanban: {
				enabled: false,
				reason: "Computed adapter fields cannot drive kanban grouping.",
			},
			calendar: {
				enabled: false,
				reason: "Computed adapter fields cannot drive calendar layouts.",
			},
			groupBy: {
				enabled: false,
				reason: "Computed adapter fields cannot drive grouping.",
			},
		},
		name: args.computedField.fieldName,
		nativeReadOnly: true,
		normalizedFieldKind: "computed",
		objectDefId: args.objectDefId,
		options: undefined,
		relation: undefined,
		rendererHint: args.computedField.rendererHint,
	};
}

function compareSchemaOrderedEntries(args: {
	left: { displayOrder: number; name: string };
	right: { displayOrder: number; name: string };
	orderHints: ReadonlyMap<string, number>;
	overrideByName: ReadonlyMap<
		string,
		EntityViewAdapterContract["fieldOverrides"][number]
	>;
}): number {
	const leftHint = args.orderHints.get(args.left.name);
	const rightHint = args.orderHints.get(args.right.name);
	const leftOverride = args.overrideByName.get(args.left.name);
	const rightOverride = args.overrideByName.get(args.right.name);

	if (leftHint !== undefined || rightHint !== undefined) {
		if (leftHint === undefined) {
			return 1;
		}
		if (rightHint === undefined) {
			return -1;
		}
		if (leftHint !== rightHint) {
			return leftHint - rightHint;
		}
	}

	const leftOverrideOrder = leftOverride?.preferredDisplayOrder;
	const rightOverrideOrder = rightOverride?.preferredDisplayOrder;
	if (leftOverrideOrder !== undefined || rightOverrideOrder !== undefined) {
		if (leftOverrideOrder === undefined) {
			return 1;
		}
		if (rightOverrideOrder === undefined) {
			return -1;
		}
		if (leftOverrideOrder !== rightOverrideOrder) {
			return leftOverrideOrder - rightOverrideOrder;
		}
	}

	if (args.left.displayOrder !== args.right.displayOrder) {
		return args.left.displayOrder - args.right.displayOrder;
	}

	return args.left.name.localeCompare(args.right.name);
}

export function buildEntityViewAdapter(args: {
	currentLayout: ViewLayout;
	fieldDefs: readonly FieldDef[];
	objectDef: ObjectDef;
	objectDefId: Id<"objectDefs">;
}): EntityViewAdapterContract {
	return resolveEntityViewAdapterContract(args);
}

export function buildNormalizedFieldDefinitions(args: {
	adapterContract: EntityViewAdapterContract;
	applyLayoutVisibility?: boolean;
	currentLayout: ViewLayout;
	fieldDefs: readonly FieldDef[];
	objectDefId: Id<"objectDefs">;
	viewIsDefault: boolean;
}): NormalizedFieldDefinition[] {
	const fieldOverridesByName = buildFieldOverridesByName(args.adapterContract);
	const schemaOrderHints = buildSchemaOrderHints({
		adapterContract: args.adapterContract,
		viewIsDefault: args.viewIsDefault,
	});
	const persistedFields = args.fieldDefs.map((fieldDef) =>
		applyFieldOverridesToDefinition({
			applyLayoutVisibility: args.applyLayoutVisibility ?? true,
			field: materializeFieldDefinition(fieldDef),
			currentLayout: args.currentLayout,
			override: fieldOverridesByName.get(fieldDef.name),
		})
	);
	const computedFields = args.adapterContract.computedFields
		.filter(
			(computedField) =>
				!persistedFields.some((field) => field.name === computedField.fieldName)
		)
		.map((computedField, index) =>
			toComputedNormalizedFieldDefinition({
				computedField,
				displayOrder: persistedFields.length + index,
				objectDefId: args.objectDefId,
			})
		);

	return [...persistedFields, ...computedFields]
		.sort((left, right) =>
			compareSchemaOrderedEntries({
				left,
				right,
				orderHints: schemaOrderHints,
				overrideByName: fieldOverridesByName,
			})
		)
		.map((field, index) => ({
			...field,
			displayOrder: index,
		}));
}

function toDisplayLabel(value: string): string {
	return value
		.split(DISPLAY_LABEL_SPLIT_PATTERN)
		.filter((part) => part.length > 0)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function evaluateBorrowerVerificationSummary(
	fieldValues: Record<string, unknown>
): string | undefined {
	const status =
		typeof fieldValues.status === "string" && fieldValues.status.length > 0
			? `${toDisplayLabel(fieldValues.status)} borrower`
			: undefined;
	const idvStatus =
		typeof fieldValues.idvStatus === "string" &&
		fieldValues.idvStatus.length > 0
			? ({
					verified: "IDV verified",
					pending_review: "IDV pending review",
					manual_review_required: "Manual IDV review required",
				}[fieldValues.idvStatus] ??
				`IDV ${toDisplayLabel(fieldValues.idvStatus)}`)
			: undefined;

	if (status && idvStatus) {
		return `${status} • ${idvStatus}`;
	}

	return status ?? idvStatus;
}

function formatCurrencyAmount(value: number, divisor = 1): string {
	const normalizedValue = value / divisor;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: normalizedValue % 1 === 0 ? 0 : 2,
	}).format(normalizedValue);
}

function formatTokenLabel(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	return toDisplayLabel(value);
}

function evaluateMortgagePaymentSummary(
	fieldValues: Record<string, unknown>
): string | undefined {
	const paymentAmount =
		typeof fieldValues.paymentAmount === "number"
			? formatCurrencyAmount(fieldValues.paymentAmount, 100)
			: undefined;
	const paymentFrequency =
		typeof fieldValues.paymentFrequency === "string"
			? formatTokenLabel(fieldValues.paymentFrequency)
			: undefined;
	const rateType =
		typeof fieldValues.rateType === "string"
			? formatTokenLabel(fieldValues.rateType)
			: undefined;

	return [paymentAmount, paymentFrequency, rateType]
		.filter(Boolean)
		.join(" • ");
}

function evaluateListingPaymentSummary(
	fieldValues: Record<string, unknown>
): string | undefined {
	const paymentAmount =
		typeof fieldValues.monthlyPayment === "number"
			? formatCurrencyAmount(fieldValues.monthlyPayment, 100)
			: undefined;
	const paymentFrequency =
		typeof fieldValues.paymentFrequency === "string"
			? formatTokenLabel(fieldValues.paymentFrequency)
			: undefined;

	if (!paymentAmount) {
		return paymentFrequency;
	}

	return paymentFrequency
		? `${paymentAmount} / ${paymentFrequency}`
		: paymentAmount;
}

function evaluateObligationPaymentProgressSummary(
	fieldValues: Record<string, unknown>
): string | undefined {
	const amount =
		typeof fieldValues.amount === "number" ? fieldValues.amount : undefined;
	const amountSettled =
		typeof fieldValues.amountSettled === "number"
			? fieldValues.amountSettled
			: undefined;
	const status =
		typeof fieldValues.status === "string"
			? formatTokenLabel(fieldValues.status)
			: undefined;

	if (amount === undefined) {
		return status;
	}

	const settledLabel =
		amountSettled !== undefined
			? `${formatCurrencyAmount(amountSettled, 100)} of ${formatCurrencyAmount(amount, 100)} settled`
			: undefined;

	return [settledLabel, status].filter(Boolean).join(" • ");
}

export function evaluateComputedFieldValue(args: {
	computedField: EntityViewAdapterContract["computedFields"][number];
	fieldValues: Record<string, unknown>;
}): unknown {
	if (args.computedField.materializationMode === "hydrated") {
		return undefined;
	}

	switch (args.computedField.expressionKey) {
		case "borrowerVerificationSummary":
			return evaluateBorrowerVerificationSummary(args.fieldValues);
		case "listingPaymentSummary":
			return evaluateListingPaymentSummary(args.fieldValues);
		case "mortgagePaymentSummary":
			return evaluateMortgagePaymentSummary(args.fieldValues);
		case "obligationPaymentProgressSummary":
			return evaluateObligationPaymentProgressSummary(args.fieldValues);
		default:
			return undefined;
	}
}

export function applyComputedFieldValues(args: {
	adapterContract: EntityViewAdapterContract;
	fieldValues: Record<string, unknown>;
}): Record<string, unknown> {
	const nextFieldValues = { ...args.fieldValues };

	for (const computedField of args.adapterContract.computedFields) {
		const value = evaluateComputedFieldValue({
			computedField,
			fieldValues: nextFieldValues,
		});
		if (value !== undefined) {
			nextFieldValues[computedField.fieldName] = value;
		}
	}

	return nextFieldValues;
}

export function materializeRecordComputedFields(
	record: UnifiedRecord,
	adapterContract: EntityViewAdapterContract
): UnifiedRecord {
	return {
		...record,
		fields: applyComputedFieldValues({
			adapterContract,
			fieldValues: record.fields,
		}),
	};
}
