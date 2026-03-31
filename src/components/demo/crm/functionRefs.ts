import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { CrmDemoRecordKind, CrmDemoSeedSummary } from "./types";

export const demoCrmSeedLeadPipeline = makeFunctionReference<
	"action",
	Record<string, never>,
	CrmDemoSeedSummary
>("demo/crmSandbox:seedLeadPipeline");

export const demoCrmGetLeadPipelineSeedState = makeFunctionReference<
	"query",
	Record<string, never>,
	CrmDemoSeedSummary
>("demo/crmSandbox:getLeadPipelineSeedState");

export const demoCrmResetSandbox = makeFunctionReference<
	"mutation",
	Record<string, never>,
	{ deletedObjects: number; deletedRecords: number }
>("demo/crmSandbox:resetCrmDemo");

export const demoCrmCreateSandboxObject = makeFunctionReference<
	"action",
	{
		baseName: string;
		description?: string;
		fields: Array<{
			description?: string;
			fieldType: Doc<"fieldDefs">["fieldType"];
			isRequired?: boolean;
			isUnique?: boolean;
			label: string;
			name: string;
			options?: Array<{
				color: string;
				label: string;
				order: number;
				value: string;
			}>;
		}>;
		icon: string;
		pluralLabel: string;
		singularLabel: string;
	},
	{ demoViewId?: Id<"viewDefs">; objectDefId: Id<"objectDefs"> }
>("demo/crmSandbox:createSandboxObject");

export const crmListLinkTypes = makeFunctionReference<
	"query",
	Record<string, never>,
	Doc<"linkTypeDefs">[]
>("crm/linkTypes:listLinkTypes");

export const crmCreateLinkType = makeFunctionReference<
	"mutation",
	{
		cardinality: "one_to_one" | "one_to_many" | "many_to_many";
		name: string;
		sourceObjectDefId: Id<"objectDefs">;
		targetObjectDefId: Id<"objectDefs">;
	},
	Id<"linkTypeDefs">
>("crm/linkTypes:createLinkType");

export const crmCreateRecordLink = makeFunctionReference<
	"mutation",
	{
		linkTypeDefId: Id<"linkTypeDefs">;
		sourceId: string;
		sourceKind: CrmDemoRecordKind;
		targetId: string;
		targetKind: CrmDemoRecordKind;
	},
	Id<"recordLinks">
>("crm/recordLinks:createLink");

export const crmGetLinkedRecords = makeFunctionReference<
	"query",
	{
		direction?: "outbound" | "inbound" | "both";
		recordId: string;
		recordKind: CrmDemoRecordKind;
	},
	Array<{
		direction: "outbound" | "inbound";
		links: Array<{
			labelValue?: string;
			linkId: Id<"recordLinks">;
			linkTypeDefId: Id<"linkTypeDefs">;
			objectDefId: Id<"objectDefs">;
			recordId: string;
			recordKind: CrmDemoRecordKind;
		}>;
		linkTypeDefId: Id<"linkTypeDefs">;
		linkTypeName: string;
	}>
>("crm/linkQueries:getLinkedRecords");
