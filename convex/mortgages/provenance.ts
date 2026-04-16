import type { Id } from "../_generated/dataModel";

export const ORIGINATION_WORKFLOW_SOURCE_TYPE =
	"admin_origination_case" as const;
export const ADMIN_DIRECT_CREATION_SOURCE = "admin_direct" as const;
export const ADMIN_DIRECT_ORIGINATION_PATH = "admin_direct" as const;

export interface MortgageActivationSource {
	creationSource: typeof ADMIN_DIRECT_CREATION_SOURCE;
	originatedByUserId: string;
	originatingWorkflowId: string;
	originatingWorkflowType: typeof ORIGINATION_WORKFLOW_SOURCE_TYPE;
	originationPath: typeof ADMIN_DIRECT_ORIGINATION_PATH;
	workflowSourceId: string;
	workflowSourceKey: string;
	workflowSourceType: typeof ORIGINATION_WORKFLOW_SOURCE_TYPE;
}

export function buildAdminDirectMortgageActivationSource(args: {
	caseId: Id<"adminOriginationCases">;
	viewerUserId: Id<"users">;
}) {
	return {
		creationSource: ADMIN_DIRECT_CREATION_SOURCE,
		originationPath: ADMIN_DIRECT_ORIGINATION_PATH,
		originatedByUserId: String(args.viewerUserId),
		originatingWorkflowId: String(args.caseId),
		originatingWorkflowType: ORIGINATION_WORKFLOW_SOURCE_TYPE,
		workflowSourceId: String(args.caseId),
		workflowSourceKey: buildOriginationMortgageWorkflowSourceKey(args.caseId),
		workflowSourceType: ORIGINATION_WORKFLOW_SOURCE_TYPE,
	} satisfies MortgageActivationSource;
}

export function buildOriginationMortgageWorkflowSourceKey(
	caseId: Id<"adminOriginationCases">
) {
	return `${ORIGINATION_WORKFLOW_SOURCE_TYPE}:mortgage:${caseId}`;
}

export function buildOriginationBorrowerWorkflowSourceKey(args: {
	caseId: Id<"adminOriginationCases">;
	participantDraftId?: string;
	role: "co_borrower" | "guarantor" | "primary";
}) {
	return `${ORIGINATION_WORKFLOW_SOURCE_TYPE}:borrower:${args.caseId}:${
		args.participantDraftId ?? args.role
	}`;
}
