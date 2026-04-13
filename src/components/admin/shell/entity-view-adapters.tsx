"use client";

import type { ReactNode } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
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
	readonly objectDef: ObjectDef;
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
	readonly renderDetailsTab?: (args: RecordDetailsRenderArgs) => ReactNode;
	readonly renderFilesTab?: (args: RecordTabRenderArgs) => ReactNode;
	readonly renderNotesTab?: (args: RecordTabRenderArgs) => ReactNode;
}

interface DedicatedDetailLayoutDefinition {
	readonly highlightFieldNames?: readonly string[];
	readonly sections: readonly DetailSectionDefinition[];
}

const DEDICATED_DETAIL_LAYOUTS = {
	mortgages: {
		highlightFieldNames: ["principal", "paymentAmount", "maturityDate"],
		sections: [
			{
				title: "Loan Terms",
				description: "Primary mortgage economics and pricing terms.",
				fieldNames: ["interestRate", "loanType", "termMonths", "status"],
			},
			{
				title: "Servicing",
				description: "Payment cadence and downstream servicing status.",
				fieldNames: ["paymentFrequency"],
			},
		],
	},
	obligations: {
		highlightFieldNames: ["amount", "dueDate", "status"],
		sections: [
			{
				title: "Obligation",
				description: "Core obligation attributes and repayment state.",
				fieldNames: ["type"],
			},
		],
	},
	deals: {
		highlightFieldNames: ["closingDate", "fractionalShare", "status"],
		sections: [
			{
				title: "Economics",
				description: "Commercial terms for the closing package.",
				fieldNames: ["lockingFeeAmount"],
			},
		],
	},
	borrowers: {
		highlightFieldNames: ["status", "idvStatus", "verificationSummary"],
		sections: [
			{
				title: "Verification",
				description: "Identity status and the computed verification summary.",
				fieldNames: ["verificationSummary"],
			},
		],
	},
	lenders: {
		highlightFieldNames: ["status", "accreditationStatus", "payoutFrequency"],
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
