"use client";

import type { ReactNode } from "react";
import type { AdminRelationNavigationTarget } from "#/lib/admin-relation-navigation";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import {
	BorrowersDedicatedDetails,
	BrokersDedicatedDetails,
	DealsDedicatedDetails,
	LendersDedicatedDetails,
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
import { RecordAttachmentsPanel } from "./RecordAttachmentsPanel";
import { RecordNotesPanel } from "./RecordNotesPanel";
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
	readonly objectDefs?: readonly ObjectDef[];
	readonly onNavigateRelation?: (target: AdminRelationNavigationTarget) => void;
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
		highlightFieldNames: [
			"lenderName",
			"contactEmail",
			"brokerSummary",
			"organizationName",
			"status",
			"accreditationStatus",
		],
		pageSummaryFieldNames: [
			"lenderName",
			"contactEmail",
			"brokerSummary",
			"status",
			"accreditationStatus",
			"payoutFrequency",
		],
		sections: [
			{
				title: "Contact",
				description: "Linked user profile and organization context.",
				fieldNames: [
					"lenderName",
					"contactEmail",
					"contactPhone",
					"organizationName",
				],
			},
			{
				title: "Broker relationship",
				description: "Sponsoring broker record.",
				fieldNames: ["brokerSummary", "brokerId"],
			},
			{
				title: "Compliance & onboarding",
				description: "Accreditation, identity, and onboarding references.",
				fieldNames: [
					"accreditationStatus",
					"idvStatus",
					"kycStatus",
					"onboardingEntryPath",
					"onboardingId",
				],
			},
			{
				title: "Payout preferences",
				description: "Operational status and payout cadence.",
				fieldNames: [
					"status",
					"payoutFrequency",
					"lastPayoutDate",
					"minimumPayoutCents",
				],
			},
		],
	},
	brokers: {
		highlightFieldNames: [
			"brokerContactName",
			"contactEmail",
			"brokerageName",
			"organizationName",
			"status",
		],
		pageSummaryFieldNames: [
			"brokerContactName",
			"contactEmail",
			"brokerageName",
			"status",
			"licenseId",
		],
		sections: [
			{
				title: "Contact",
				description: "Linked user profile and organization context.",
				fieldNames: [
					"brokerContactName",
					"contactEmail",
					"contactPhone",
					"organizationName",
				],
			},
			{
				title: "Brokerage",
				description: "Licensing and registered business name.",
				fieldNames: ["brokerageName", "licenseId", "licenseProvince"],
			},
			{
				title: "Lifecycle",
				description: "Onboarding and record timestamps.",
				fieldNames: ["status", "onboardedAt", "createdAt", "lastTransitionAt"],
			},
		],
	},
} as const satisfies Record<string, DedicatedDetailLayoutDefinition>;

function buildDedicatedDetailsAdapter(
	layout: DedicatedDetailLayoutDefinition
): RecordSidebarEntityAdapter {
	return {
		pageSummaryFieldNames: layout.pageSummaryFieldNames,
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<SectionedRecordDetails
				fields={fields}
				highlightFieldNames={layout.highlightFieldNames}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
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
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<ListingsDedicatedDetails
				fields={fields}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
				record={record}
			/>
		),
	},
	mortgages: {
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<MortgagesDedicatedDetails
				fields={fields}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
				record={record}
			/>
		),
	},
	deals: {
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<DealsDedicatedDetails
				fields={fields}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
				record={record}
			/>
		),
	},
	obligations: {
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<ObligationsDedicatedDetails
				fields={fields}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
				record={record}
			/>
		),
	},
	borrowers: {
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<BorrowersDedicatedDetails
				fields={fields}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
				record={record}
			/>
		),
	},
	lenders: {
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<LendersDedicatedDetails
				fields={fields}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
				record={record}
			/>
		),
	},
	brokers: {
		renderDetailsTab: ({ fields, objectDefs, onNavigateRelation, record }) => (
			<BrokersDedicatedDetails
				fields={fields}
				objectDefs={objectDefs}
				onNavigateRelation={onNavigateRelation}
				record={record}
			/>
		),
	},
};

/**
 * Default notes + files adapter — applied to every record that resolves to a
 * live `objectDef`. Entity-specific adapters can still override these by
 * supplying their own `renderNotesTab` / `renderFilesTab` implementations.
 *
 * We intentionally only emit these when `objectDef` and a concrete `record` are
 * available: the underlying panels issue Convex mutations keyed on
 * `(objectDefId, recordKind, recordId)`, so we cannot render them for
 * placeholder/demo rows that lack a real object definition.
 */
const DEFAULT_RECORD_SIDEBAR_ADAPTER: RecordSidebarEntityAdapter = {
	renderNotesTab: ({ objectDef, record, reference }) => {
		if (!(objectDef && record)) {
			return null;
		}
		return (
			<RecordNotesPanel
				objectDefId={objectDef._id}
				recordId={reference.recordId}
				recordKind={record._kind}
			/>
		);
	},
	renderFilesTab: ({ objectDef, record, reference }) => {
		if (!(objectDef && record)) {
			return null;
		}
		return (
			<RecordAttachmentsPanel
				objectDefId={objectDef._id}
				recordId={reference.recordId}
				recordKind={record._kind}
			/>
		);
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
		// Still provide notes/files when we at least have an objectDef — this keeps
		// the tabs usable for orgs whose admin registry hasn't been updated yet.
		return args.objectDef ? { ...DEFAULT_RECORD_SIDEBAR_ADAPTER } : undefined;
	}

	const baseAdapter = DEDICATED_RECORD_SIDEBAR_ADAPTERS[resolvedEntityType];
	const rolloutAdapter = ROLLOUT_DETAIL_ADAPTERS[resolvedEntityType];
	const overrideAdapter = args.overrides?.[resolvedEntityType];

	return {
		...DEFAULT_RECORD_SIDEBAR_ADAPTER,
		...baseAdapter,
		...rolloutAdapter,
		...overrideAdapter,
	};
}
