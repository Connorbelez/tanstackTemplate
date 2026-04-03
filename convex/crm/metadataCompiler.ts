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
			fieldType === "select" || fieldType === "multi_select"
				? enabledRule()
				: disabledRule(
						"Kanban layouts require a select or multi-select field."
					),
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
		default:
			return {
				enabled: false,
				reason:
					"Only numeric fields support aggregate functions in the current engine.",
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

export function deriveCapabilities(fieldType: FieldType): Capability[] {
	const caps: Capability[] = ["table"];
	const layoutEligibility = deriveLayoutEligibility(fieldType);
	const aggregationEligibility = deriveAggregationEligibility(fieldType);

	if (layoutEligibility.kanban.enabled) {
		caps.push("kanban");
	}
	if (layoutEligibility.groupBy.enabled) {
		caps.push("group_by");
	}
	if (layoutEligibility.calendar.enabled) {
		caps.push("calendar", "sort");
	}
	if (aggregationEligibility.enabled) {
		caps.push("aggregate", "sort");
	}

	return caps;
}
