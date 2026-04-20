import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { canAccessOrgScopedRecord } from "./orgScope";

type OriginationCaseRecord = Pick<
	Doc<"adminOriginationCases">,
	"_id" | "orgId"
>;

export function assertOriginationCaseAccess(
	viewer: { isFairLendAdmin: boolean; orgId?: string | null },
	record: OriginationCaseRecord
) {
	if (canAccessOrgScopedRecord(viewer, record)) {
		return;
	}

	throw new ConvexError("Origination case not found or access denied");
}
