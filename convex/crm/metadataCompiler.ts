import type { Doc } from "../_generated/dataModel";

type FieldType = Doc<"fieldDefs">["fieldType"];
type Capability = Doc<"fieldCapabilities">["capability"];

export function deriveCapabilities(fieldType: FieldType): Capability[] {
	const caps: Capability[] = ["table"];

	switch (fieldType) {
		case "select":
			caps.push("kanban", "group_by");
			break;
		case "multi_select":
			caps.push("kanban");
			break;
		case "date":
		case "datetime":
			caps.push("calendar", "sort");
			break;
		case "number":
		case "currency":
		case "percentage":
			caps.push("aggregate", "sort");
			break;
		default:
			break;
	}

	return caps;
}
