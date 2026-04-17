"use client";

import type { ReactNode } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import {
	ListingsDedicatedDetails,
	MortgagesDedicatedDetails,
	ObligationsDedicatedDetails,
} from "./dedicated-detail-panels";
import {
	type DetailSectionDefinition,
	SectionedRecordDetails,
} from "./detail-sections";
import {
	type getAdminEntityByType,
	getAdminEntityForObjectDef,
} from "./entity-registry";
import type { SidebarRecordRef } from "./RecordSidebarProvider";

type ObjectDef = Doc<"objectDefs">;
type RecordDetailRecord = UnifiedRecord;
type DetailField = NormalizedFieldDefinition;
type AdminEntity = ReturnType<typeof getAdminEntityByType>;

export interface RecordTabRenderArgs {
	readonly adapterContract: EntityViewAdapterContract | undefined;
	readonly entity: AdminEntity | undefined;
	readonly fields: readonly DetailField[];
	readonly objectDef: ObjectDef | undefined;
	readonly record: RecordDetailRecord | undefined;
	readonly reference: SidebarRecordRef;
}

export interface RecordDetailsRenderArgs {
	readonly adapterContract: EntityViewAdapterContract | undefined;
	readonly entity: AdminEntity | undefined;
	readonly fields: readonly DetailField[];
	readonly objectDef: ObjectDef | undefined;
	readonly record: RecordDetailRecord;
	readonly recordId: string;
}

export interface RecordSidebarEntityAdapter {
	readonly getRecordStatus?: (args: {
		adapterContract: EntityViewAdapterContract | undefined;
		entity: AdminEntity | undefined;
		objectDef: ObjectDef | undefined;
		record: RecordDetailRecord | undefined;
	}) => string | undefined;
	readonly getRecordTitle?: (args: {
		adapterContract: EntityViewAdapterContract | undefined;
		entity: AdminEntity | undefined;
		objectDef: ObjectDef | undefined;
		record: RecordDetailRecord | undefined;
		recordId: string;
	}) => string;
	readonly pageSummaryFieldNames?: readonly string[];
	readonly renderDetailsTab?: (args: RecordDetailsRenderArgs) => ReactNode;
	readonly renderFilesTab?: (args: RecordTabRenderArgs) => ReactNode;
	readonly renderNotesTab?: (args: RecordTabRenderArgs) => ReactNode;
	readonly renderPageActions?: (args: RecordTabRenderArgs) => ReactNode;
	readonly renderPageAside?: (args: RecordTabRenderArgs) => ReactNode;
	readonly renderPageSections?: (args: RecordTabRenderArgs) => ReactNode;
}

interface DedicatedDetailLayoutDefinition {
	readonly highlightFieldNames?: readonly string[];
	readonly pageSummaryFieldNames?: readonly string[];
	readonly sections: readonly DetailSectionDefinition[];
}

const DEDICATED_DETAIL_LAYOUTS = {
	listings: {
		highlightFieldNames: [
			"title",
			"propertySummary",
			"principal",
			"interestRate",
		],
		pageSummaryFieldNames: [
			"principal",
			"interestRate",
			"ltvRatio",
			"paymentSummary",
		],
		sections: [
			{
				title: "Marketplace",
				description: "Marketplace publication state and operating flags.",
				fieldNames: ["status", "publishedAt", "featured"],
			},
			{
				title: "Economics",
				description: "Core listing economics and pricing inputs.",
				fieldNames: [
					"propertyType",
					"city",
					"province",
					"paymentSummary",
					"maturityDate",
				],
			},
		],
	},
	mortgages: {
		highlightFieldNames: [
			"propertySummary",
			"principal",
			"borrowerSummary",
			"paymentSummary",
		],
		pageSummaryFieldNames: [
			"principal",
			"interestRate",
			"paymentAmount",
			"maturityDate",
		],
		sections: [
			{
				title: "Loan Terms",
				description: "Primary mortgage economics and pricing terms.",
				fieldNames: [
					"interestRate",
					"loanType",
					"termMonths",
					"maturityDate",
					"status",
				],
			},
			{
				title: "Servicing",
				description: "Payment cadence and downstream servicing status.",
				fieldNames: ["paymentAmount", "paymentFrequency", "firstPaymentDate"],
			},
		],
	},
	obligations: {
		highlightFieldNames: [
			"mortgageSummary",
			"borrowerSummary",
			"amount",
			"paymentProgressSummary",
		],
		pageSummaryFieldNames: ["amount", "amountSettled", "dueDate", "status"],
		sections: [
			{
				title: "Obligation",
				description: "Core obligation attributes and repayment state.",
				fieldNames: [
					"paymentNumber",
					"type",
					"dueDate",
					"gracePeriodEnd",
					"status",
				],
			},
		],
	},
	deals: {
		highlightFieldNames: ["closingDate", "fractionalShare", "status"],
		pageSummaryFieldNames: ["status", "closingDate", "fractionalShare"],
		sections: [
			{
				title: "Economics",
				description: "Commercial terms for the closing package.",
				fieldNames: ["lockingFeeAmount"],
			},
		],
	},
	borrowers: {
		highlightFieldNames: [
			"borrowerName",
			"status",
			"idvStatus",
			"verificationSummary",
		],
		pageSummaryFieldNames: ["status", "idvStatus", "onboardedAt"],
		sections: [
			{
				title: "Verification",
				description: "Identity status and the computed verification summary.",
				fieldNames: ["verificationSummary", "onboardedAt"],
			},
		],
	},
	lenders: {
		highlightFieldNames: ["status", "accreditationStatus", "payoutFrequency"],
		pageSummaryFieldNames: ["status", "accreditationStatus", "payoutFrequency"],
		sections: [
			{
				title: "Payout Preferences",
				description: "Operational status and payout cadence.",
				fieldNames: ["payoutFrequency"],
			},
		],
	},
	brokers: {
		highlightFieldNames: ["status", "brokerageName", "licenseId"],
		pageSummaryFieldNames: ["status", "brokerageName", "licenseId"],
		sections: [
			{
				title: "Brokerage",
				description: "Broker identity and licensing details.",
				fieldNames: ["brokerageName", "licenseId"],
			},
		],
	},
} as const satisfies Record<string, DedicatedDetailLayoutDefinition>;

function buildDedicatedDetailsAdapter(
	layout: DedicatedDetailLayoutDefinition
): RecordSidebarEntityAdapter {
	return {
		pageSummaryFieldNames: layout.pageSummaryFieldNames,
		renderDetailsTab: ({ fields, record }) => (
			<SectionedRecordDetails
				fields={fields}
				highlightFieldNames={layout.highlightFieldNames}
				record={record}
				sections={layout.sections}
			/>
		),
	};
}

const DEDICATED_RECORD_SIDEBAR_ADAPTERS = Object.fromEntries(
	Object.entries(DEDICATED_DETAIL_LAYOUTS).map(([entityType, layout]) => [
		entityType,
		buildDedicatedDetailsAdapter(layout),
	])
) satisfies Partial<Record<string, RecordSidebarEntityAdapter>>;

const ROLLOUT_DETAIL_ADAPTERS: Partial<
	Record<string, RecordSidebarEntityAdapter>
> = {
	listings: {
		renderDetailsTab: ({ fields, record }) => (
			<ListingsDedicatedDetails fields={fields} record={record} />
		),
	},
	mortgages: {
		renderDetailsTab: ({ fields, record }) => (
			<MortgagesDedicatedDetails fields={fields} record={record} />
		),
	},
	obligations: {
		renderDetailsTab: ({ fields, record }) => (
			<ObligationsDedicatedDetails fields={fields} record={record} />
		),
	},
};

export function resolveRecordSidebarEntityAdapter(args: {
	detailSurfaceKey?: string;
	entityType: string | undefined;
	objectDef: ObjectDef | undefined;
	overrides?: Partial<Record<string, RecordSidebarEntityAdapter>>;
}): RecordSidebarEntityAdapter | undefined {
	const resolvedEntityType =
		args.detailSurfaceKey ??
		args.entityType ??
		(args.objectDef
			? getAdminEntityForObjectDef(args.objectDef)?.entityType
			: undefined);

	if (!resolvedEntityType) {
		return undefined;
	}

	const dedicatedAdapter =
		ROLLOUT_DETAIL_ADAPTERS[resolvedEntityType] ??
		DEDICATED_RECORD_SIDEBAR_ADAPTERS[resolvedEntityType];
	const overrideAdapter = args.overrides?.[resolvedEntityType];

	if (!(dedicatedAdapter || overrideAdapter)) {
		return undefined;
	}

	return {
		...dedicatedAdapter,
		...overrideAdapter,
	};
}
