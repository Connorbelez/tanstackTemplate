import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { canAccessOrgScopedRecord } from "./orgScope";

type OriginationCaseRecord = Pick<
	Doc<"adminOriginationCases">,
	"_id" | "orgId"
>;

export const ORIGINATION_CASE_ACCESS_REQUIRES_ORG_CONTEXT =
	"Forbidden: origination case access requires org context";

export function assertOriginationCaseAccessContext(viewer: {
	isFairLendAdmin: boolean;
	orgId?: string | null;
}) {
	if (!(viewer.isFairLendAdmin || viewer.orgId)) {
		throw new ConvexError(ORIGINATION_CASE_ACCESS_REQUIRES_ORG_CONTEXT);
	}
}

export function assertOriginationCaseAccess(
	viewer: { isFairLendAdmin: boolean; orgId?: string | null },
	record: OriginationCaseRecord
) {
	assertOriginationCaseAccessContext(viewer);

	if (canAccessOrgScopedRecord(viewer, record)) {
		return;
	}

	throw new ConvexError("Origination case not found or access denied");
}
