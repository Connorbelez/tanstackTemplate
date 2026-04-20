import type { Doc } from "../../convex/_generated/dataModel";
import type { UnifiedRecord } from "../../convex/crm/types";
import type { AdminRelationNavigationTarget } from "./admin-relation-navigation";

type ObjectDefRow = Pick<Doc<"objectDefs">, "_id" | "nativeTable">;

function findObjectDefIdForNativeTable(
	objectDefs: readonly ObjectDefRow[] | undefined,
	nativeTable: string
): string | undefined {
	const match = objectDefs?.find((row) => row.nativeTable === nativeTable);
	return match ? String(match._id) : undefined;
}

function nonEmptyId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

/**
 * Maps hydrated "computed" summary fields on native admin rows to a CRM peer
 * record the user can open (property, mortgage, borrower).
 */
export function resolveAdminComputedFieldNavigationTarget(args: {
	fieldName: string;
	objectDefs: readonly ObjectDefRow[] | undefined;
	record: Pick<UnifiedRecord, "_kind" | "nativeTable"> & {
		fields: Record<string, unknown>;
	};
}): AdminRelationNavigationTarget | null {
	if (args.record._kind !== "native" || !args.record.nativeTable) {
		return null;
	}

	const { fields, nativeTable } = args.record;
	const { fieldName } = args;

	let targetNativeTable: string | undefined;
	let foreignId: string | undefined;

	if (
		fieldName === "propertySummary" &&
		(nativeTable === "mortgages" || nativeTable === "listings")
	) {
		foreignId = nonEmptyId(fields.propertyId) ? fields.propertyId : undefined;
		targetNativeTable = "properties";
	} else if (fieldName === "mortgageSummary" && nativeTable === "listings") {
		foreignId = nonEmptyId(fields.mortgageId) ? fields.mortgageId : undefined;
		targetNativeTable = "mortgages";
	} else if (fieldName === "mortgageSummary" && nativeTable === "obligations") {
		foreignId = nonEmptyId(fields.mortgageId) ? fields.mortgageId : undefined;
		targetNativeTable = "mortgages";
	} else if (fieldName === "borrowerSummary" && nativeTable === "obligations") {
		foreignId = nonEmptyId(fields.borrowerId) ? fields.borrowerId : undefined;
		targetNativeTable = "borrowers";
	}

	if (!(targetNativeTable && foreignId)) {
		return null;
	}

	const objectDefId = findObjectDefIdForNativeTable(
		args.objectDefs,
		targetNativeTable
	);
	if (!objectDefId) {
		return null;
	}

	return {
		objectDefId,
		recordId: foreignId,
		recordKind: "native",
	};
}
