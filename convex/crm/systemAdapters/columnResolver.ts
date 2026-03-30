import type { Doc } from "../../_generated/dataModel";

type FieldDef = Doc<"fieldDefs">;

/**
 * Resolves a native document field using the fieldDef's nativeColumnPath.
 *
 * Handles:
 * - Nested paths (e.g., "terms.interestRate") via dot-split traversal
 * - Type coercion: string dates (YYYY-MM-DD) → unix ms for date/datetime fields
 * - String ID pass-through (WorkOS auth IDs like deals.buyerId stay as-is)
 *
 * Returns undefined for missing or unresolvable paths — never throws.
 */
export function resolveColumnPath(
	nativeDoc: Record<string, unknown>,
	fieldDef: FieldDef
): unknown {
	const path = fieldDef.nativeColumnPath;
	if (!path) {
		return undefined;
	}

	// Navigate nested path (e.g., "terms.interestRate" → doc.terms.interestRate)
	const segments = path.split(".");
	let current: unknown = nativeDoc;
	for (const segment of segments) {
		if (current == null || typeof current !== "object") {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}

	if (current === undefined) {
		return undefined;
	}

	// Type coercion: string dates → unix ms for date/datetime fields
	// mortgages.maturityDate is v.string() (YYYY-MM-DD) but fieldType "date" expects unix ms
	if (
		(fieldDef.fieldType === "date" || fieldDef.fieldType === "datetime") &&
		typeof current === "string"
	) {
		const parsed = Date.parse(current);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	return current;
}
