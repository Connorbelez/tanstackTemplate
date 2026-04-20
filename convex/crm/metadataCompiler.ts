import type { Doc } from "../_generated/dataModel";
import type {
	ComputedFieldMetadata,
	FieldLayoutEligibility,
	FieldRendererHint,
	NormalizedFieldDefinition,
	NormalizedFieldKind,
	RelationMetadata,
} from "./types";

type FieldType = Doc<"fieldDefs">["fieldType"];
type Capability = Doc<"fieldCapabilities">["capability"];
type DerivedFieldContractMetadata = Pick<
	NormalizedFieldDefinition,
	| "aggregation"
	| "computed"
	| "editability"
	| "isVisibleByDefault"
	| "layoutEligibility"
	| "normalizedFieldKind"
	| "relation"
	| "rendererHint"
>;

export type MaterializedFieldDef = Doc<"fieldDefs"> &
	DerivedFieldContractMetadata;

function enabledRule(): { enabled: true } {
	return { enabled: true };
}

function disabledRule(reason: string): { enabled: false; reason: string } {
	return { enabled: false, reason };
}

export function deriveNormalizedFieldKind(
	fieldType: FieldType,
	relation?: RelationMetadata,
	computed?: ComputedFieldMetadata
): NormalizedFieldKind {
	if (computed) {
		return "computed";
	}

	if (relation) {
		return "relation";
	}

	switch (fieldType) {
		case "select":
			return "single_select";
		case "multi_select":
			return "multi_select";
		case "user_ref":
			return "user";
		default:
			return "primitive";
	}
}

export function deriveRendererHint(args: {
	computed?: ComputedFieldMetadata;
	fieldType: FieldType;
	relation?: RelationMetadata;
}): FieldRendererHint {
	if (args.computed) {
		return "computed";
	}

	if (args.relation) {
		return "relation";
	}

	switch (args.fieldType) {
		case "text":
		case "email":
		case "phone":
		case "url":
			return "text";
		case "number":
			return "number";
		case "currency":
			return "currency";
		case "percentage":
			return "percentage";
		case "date":
			return "date";
		case "datetime":
			return "datetime";
		case "select":
			return "select";
		case "multi_select":
			return "multi_select";
		case "boolean":
			return "boolean";
		case "rich_text":
			return "rich_text";
		case "user_ref":
			return "user_ref";
		default: {
			const _exhaustive: never = args.fieldType;
			return _exhaustive;
		}
	}
}

export function deriveLayoutEligibility(
	fieldType: FieldType
): FieldLayoutEligibility {
	return {
		table: enabledRule(),
		kanban:
			fieldType === "select"
				? enabledRule()
				: disabledRule("Kanban layouts require a single-select field."),
		calendar:
			fieldType === "date" || fieldType === "datetime"
				? enabledRule()
				: disabledRule("Calendar layouts require a date or datetime field."),
		groupBy:
			fieldType === "select"
				? enabledRule()
				: disabledRule("Grouping currently requires a single select field."),
	};
}

export function deriveAggregationEligibility(
	fieldType: FieldType
): DerivedFieldContractMetadata["aggregation"] {
	switch (fieldType) {
		case "number":
		case "currency":
		case "percentage":
			return {
				enabled: true,
				supportedFunctions: ["count", "sum", "avg", "min", "max"],
			};
		case "date":
		case "datetime":
			return {
				enabled: true,
				supportedFunctions: ["count", "min", "max"],
			};
		case "select":
			return {
				enabled: true,
				supportedFunctions: ["count"],
			};
		default:
			return {
				enabled: false,
				reason:
					"This field type does not produce a meaningful table footer summary.",
				supportedFunctions: [],
			};
	}
}

export function deriveEditabilityMetadata(args: {
	computed?: ComputedFieldMetadata;
	nativeReadOnly: boolean;
}): DerivedFieldContractMetadata["editability"] {
	if (args.computed) {
		return {
			mode: "computed",
			reason: "Computed fields are derived and cannot be edited directly.",
		};
	}

	if (args.nativeReadOnly) {
		return {
			mode: "read_only",
			reason:
				"This field is sourced from a native system adapter and is read-only.",
		};
	}

	return { mode: "editable" };
}

export function deriveFieldContractMetadata(args: {
	computed?: ComputedFieldMetadata;
	fieldType: FieldType;
	isVisibleByDefault?: boolean;
	nativeReadOnly: boolean;
	relation?: RelationMetadata;
}): DerivedFieldContractMetadata {
	return {
		normalizedFieldKind: deriveNormalizedFieldKind(
			args.fieldType,
			args.relation,
			args.computed
		),
		rendererHint: deriveRendererHint({
			fieldType: args.fieldType,
			relation: args.relation,
			computed: args.computed,
		}),
		relation: args.relation,
		computed: args.computed,
		layoutEligibility: deriveLayoutEligibility(args.fieldType),
		aggregation: deriveAggregationEligibility(args.fieldType),
		editability: deriveEditabilityMetadata({
			nativeReadOnly: args.nativeReadOnly,
			computed: args.computed,
		}),
		isVisibleByDefault: args.isVisibleByDefault ?? true,
	};
}

export function materializeFieldContractMetadata(args: {
	aggregation?: DerivedFieldContractMetadata["aggregation"];
	computed?: ComputedFieldMetadata;
	editability?: DerivedFieldContractMetadata["editability"];
	fieldType: FieldType;
	isVisibleByDefault?: boolean;
	layoutEligibility?: DerivedFieldContractMetadata["layoutEligibility"];
	nativeReadOnly: boolean;
	normalizedFieldKind?: DerivedFieldContractMetadata["normalizedFieldKind"];
	relation?: RelationMetadata;
	rendererHint?: DerivedFieldContractMetadata["rendererHint"];
}): DerivedFieldContractMetadata {
	const derived = deriveFieldContractMetadata(args);

	return {
		normalizedFieldKind:
			args.normalizedFieldKind ?? derived.normalizedFieldKind,
		rendererHint: args.rendererHint ?? derived.rendererHint,
		relation: args.relation ?? derived.relation,
		computed: args.computed ?? derived.computed,
		layoutEligibility: args.layoutEligibility ?? derived.layoutEligibility,
		aggregation: args.aggregation ?? derived.aggregation,
		editability: args.editability ?? derived.editability,
		isVisibleByDefault: args.isVisibleByDefault ?? derived.isVisibleByDefault,
	};
}

export function materializeFieldDef(
	fieldDef: Doc<"fieldDefs">
): MaterializedFieldDef {
	return {
		...fieldDef,
		...materializeFieldContractMetadata({
			fieldType: fieldDef.fieldType,
			nativeReadOnly: fieldDef.nativeReadOnly,
			relation: fieldDef.relation,
			computed: fieldDef.computed,
			normalizedFieldKind: fieldDef.normalizedFieldKind,
			rendererHint: fieldDef.rendererHint,
			layoutEligibility: fieldDef.layoutEligibility,
			aggregation: fieldDef.aggregation,
			editability: fieldDef.editability,
			isVisibleByDefault: fieldDef.isVisibleByDefault,
		}),
	};
}

export function materializeFieldDefinition(
	fieldDef: Doc<"fieldDefs">
): NormalizedFieldDefinition {
	const materializedFieldDef = materializeFieldDef(fieldDef);

	return {
		fieldDefId: materializedFieldDef._id,
		fieldSource: "persisted",
		objectDefId: materializedFieldDef.objectDefId,
		name: materializedFieldDef.name,
		label: materializedFieldDef.label,
		fieldType: materializedFieldDef.fieldType,
		normalizedFieldKind: materializedFieldDef.normalizedFieldKind,
		description: materializedFieldDef.description,
		isRequired: materializedFieldDef.isRequired,
		isUnique: materializedFieldDef.isUnique,
		isActive: materializedFieldDef.isActive,
		displayOrder: materializedFieldDef.displayOrder,
		defaultValue: materializedFieldDef.defaultValue,
		options: materializedFieldDef.options,
		rendererHint: materializedFieldDef.rendererHint,
		relation: materializedFieldDef.relation,
		computed: materializedFieldDef.computed,
		layoutEligibility: materializedFieldDef.layoutEligibility,
		aggregation: materializedFieldDef.aggregation,
		editability: materializedFieldDef.editability,
		nativeColumnPath: materializedFieldDef.nativeColumnPath,
		nativeReadOnly: materializedFieldDef.nativeReadOnly,
		isVisibleByDefault: materializedFieldDef.isVisibleByDefault,
	};
}

export function deriveCapabilities(fieldType: FieldType): Capability[] {
	const caps: Capability[] = ["table"];
	const layoutEligibility = deriveLayoutEligibility(fieldType);
	const supportsAggregateCapability =
		fieldType === "number" ||
		fieldType === "currency" ||
		fieldType === "percentage";
	const supportsSort =
		fieldType === "number" ||
		fieldType === "currency" ||
		fieldType === "percentage" ||
		fieldType === "date" ||
		fieldType === "datetime";

	if (layoutEligibility.kanban.enabled) {
		caps.push("kanban");
	}
	if (layoutEligibility.groupBy.enabled) {
		caps.push("group_by");
	}
	if (layoutEligibility.calendar.enabled) {
		caps.push("calendar");
	}
	if (supportsAggregateCapability) {
		caps.push("aggregate");
	}
	if (supportsSort) {
		caps.push("sort");
	}

	return caps;
}
