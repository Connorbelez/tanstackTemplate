import type { Id } from "../../../convex/_generated/dataModel";
import type { NormalizedFieldDefinition } from "../../../convex/crm/types";
import { FieldRenderer } from "#/components/admin/shell/FieldRenderer";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

function buildField(
	overrides: Partial<NormalizedFieldDefinition> = {}
): NormalizedFieldDefinition {
	return {
		aggregation: {
			enabled: false,
			reason: "Test fixture",
			supportedFunctions: [],
		},
		description: undefined,
		displayOrder: 0,
		editability: { mode: "editable" },
		fieldDefId: "field_test" as Id<"fieldDefs">,
		fieldSource: "persisted",
		fieldType: "text",
		isActive: true,
		isRequired: false,
		isUnique: false,
		isVisibleByDefault: true,
		label: "Field",
		layoutEligibility: {
			calendar: { enabled: false, reason: "Test fixture" },
			groupBy: { enabled: false, reason: "Test fixture" },
			kanban: { enabled: false, reason: "Test fixture" },
			table: { enabled: true },
		},
		name: "field",
		nativeColumnPath: undefined,
		nativeReadOnly: false,
		normalizedFieldKind: "primitive",
		objectDefId: "object_test" as Id<"objectDefs">,
		options: undefined,
		relation: undefined,
		rendererHint: "text",
		...overrides,
	};
}

describe("FieldRenderer", () => {
	it("treats currency fields as base units even when nativeReadOnly is true", () => {
		const markup = renderToStaticMarkup(
			<FieldRenderer
				field={buildField({
					fieldType: "currency",
					label: "Amount",
					nativeReadOnly: true,
					rendererHint: "currency",
				})}
				value={1250}
			/>
		);

		expect(markup).toContain("1,250.00");
		expect(markup).not.toContain("12.50");
	});

	it("renders only http and https links as clickable urls", () => {
		const safeMarkup = renderToStaticMarkup(
			<FieldRenderer fieldType="url" label="Website" value="https://fairlend.ca" />
		);
		const unsafeMarkup = renderToStaticMarkup(
			<FieldRenderer
				fieldType="url"
				label="Website"
				value="javascript:alert('xss')"
			/>
		);

		expect(safeMarkup).toContain('href="https://fairlend.ca/"');
		expect(unsafeMarkup).not.toContain("href=");
		expect(unsafeMarkup).toContain("javascript:alert(&#x27;xss&#x27;)");
	});
});
