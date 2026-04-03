"use client";

import type { ReactNode } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { UnifiedRecord } from "../../../../convex/crm/types";
import {
	type getAdminEntityByType,
	getAdminEntityForObjectDef,
} from "./entity-registry";
import { FieldRenderer } from "./FieldRenderer";
import type { SidebarRecordRef } from "./RecordSidebarProvider";

type FieldDef = Doc<"fieldDefs">;
type ObjectDef = Doc<"objectDefs">;
type RecordDetailRecord = UnifiedRecord;

type AdminEntity = ReturnType<typeof getAdminEntityByType>;

export interface RecordTabRenderArgs {
	readonly entity: AdminEntity | undefined;
	readonly fieldDefs: readonly FieldDef[];
	readonly objectDef: ObjectDef | undefined;
	readonly record: RecordDetailRecord | undefined;
	readonly reference: SidebarRecordRef;
}

export interface RecordDetailsRenderArgs {
	readonly entity: AdminEntity | undefined;
	readonly fieldDefs: readonly FieldDef[];
	readonly objectDef: ObjectDef;
	readonly record: RecordDetailRecord;
	readonly recordId: string;
}

export interface RecordSidebarEntityAdapter {
	readonly getRecordStatus?: (args: {
		entity: AdminEntity | undefined;
		objectDef: ObjectDef | undefined;
		record: RecordDetailRecord | undefined;
	}) => string | undefined;
	readonly getRecordTitle?: (args: {
		entity: AdminEntity | undefined;
		objectDef: ObjectDef | undefined;
		record: RecordDetailRecord | undefined;
		recordId: string;
	}) => string;
	readonly renderDetailsTab?: (args: RecordDetailsRenderArgs) => ReactNode;
	readonly renderFilesTab?: (args: RecordTabRenderArgs) => ReactNode;
	readonly renderNotesTab?: (args: RecordTabRenderArgs) => ReactNode;
}

const DEDICATED_DETAIL_FIELD_ORDER = {
	mortgages: [
		"principal",
		"paymentAmount",
		"interestRate",
		"paymentFrequency",
		"loanType",
		"maturityDate",
		"status",
	],
	obligations: ["amount", "dueDate", "type", "status"],
	deals: ["closingDate", "fractionalShare", "lockingFeeAmount", "status"],
	borrowers: ["status", "idvStatus"],
	lenders: ["status", "accreditationStatus", "payoutFrequency"],
	brokers: ["status", "brokerageName", "licenseId"],
} as const satisfies Record<string, readonly string[]>;

function hasRenderableFieldValue(value: unknown): boolean {
	return value !== undefined && value !== null && value !== "";
}

function renderPrioritizedFieldGrid(args: {
	fieldDefs: readonly FieldDef[];
	priorityFieldNames: readonly string[];
	record: RecordDetailRecord;
}): ReactNode {
	const fieldDefsByName = new Map(
		args.fieldDefs.map((fieldDef) => [fieldDef.name, fieldDef] as const)
	);
	const prioritizedNames = new Set(args.priorityFieldNames);
	const prioritizedFields = args.priorityFieldNames.flatMap((fieldName) => {
		const fieldDef = fieldDefsByName.get(fieldName);
		if (!fieldDef) {
			return [];
		}

		const value = args.record.fields[fieldDef.name];
		return hasRenderableFieldValue(value) ? [fieldDef] : [];
	});
	const remainingFields = args.fieldDefs.filter((fieldDef) => {
		if (prioritizedNames.has(fieldDef.name)) {
			return false;
		}

		return hasRenderableFieldValue(args.record.fields[fieldDef.name]);
	});
	const orderedFields = [...prioritizedFields, ...remainingFields];

	if (orderedFields.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-3">
			{orderedFields.map((fieldDef) => (
				<FieldRenderer
					fieldType={fieldDef.fieldType}
					key={fieldDef._id}
					label={fieldDef.label}
					value={args.record.fields[fieldDef.name]}
				/>
			))}
		</div>
	);
}

function buildDedicatedDetailsAdapter(
	priorityFieldNames: readonly string[]
): RecordSidebarEntityAdapter {
	return {
		renderDetailsTab: ({ fieldDefs, record }) =>
			renderPrioritizedFieldGrid({
				fieldDefs,
				priorityFieldNames,
				record,
			}),
	};
}

const DEDICATED_RECORD_SIDEBAR_ADAPTERS = Object.fromEntries(
	Object.entries(DEDICATED_DETAIL_FIELD_ORDER).map(
		([entityType, priorityFieldNames]) =>
			[entityType, buildDedicatedDetailsAdapter(priorityFieldNames)] as const
	)
) satisfies Partial<Record<string, RecordSidebarEntityAdapter>>;

export function resolveRecordSidebarEntityAdapter(args: {
	entityType: string | undefined;
	objectDef: ObjectDef | undefined;
	overrides?: Partial<Record<string, RecordSidebarEntityAdapter>>;
}): RecordSidebarEntityAdapter | undefined {
	const resolvedEntityType =
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
