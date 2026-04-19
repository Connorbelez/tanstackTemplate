import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { buildEntityViewAdapter } from "./entityViewFields";
import { getNativeRecordById } from "./systemAdapters/queryAdapter";
import type {
	EntityViewCellDisplayValue,
	NormalizedFieldDefinition,
	RelationCellDisplayValue,
	RelationCellItem,
	UnifiedRecord,
} from "./types";

type FieldDef = Doc<"fieldDefs">;
type LinkTypeDef = Doc<"linkTypeDefs">;
type ObjectDef = Doc<"objectDefs">;
type RecordLinkDoc = Doc<"recordLinks">;

interface RelationFieldBinding {
	cardinality: NonNullable<
		NormalizedFieldDefinition["relation"]
	>["cardinality"];
	fieldName: string;
	matches: Array<{
		direction: "inbound" | "outbound";
		linkTypeDefId: Id<"linkTypeDefs">;
	}>;
}

interface RelationPeerReference {
	objectDefId: Id<"objectDefs">;
	recordId: string;
	recordKind: "record" | "native";
}

function createRecordReferenceKey(
	recordKind: "record" | "native",
	recordId: string
): string {
	return `${recordKind}:${recordId}`;
}

function createFieldReferenceKey(recordKey: string, fieldName: string): string {
	return `${recordKey}:${fieldName}`;
}

function createPeerReferenceKey(reference: RelationPeerReference): string {
	return `${reference.recordKind}:${reference.recordId}:${String(reference.objectDefId)}`;
}

async function loadActiveFieldDefs(
	ctx: QueryCtx,
	objectDefId: Id<"objectDefs">
): Promise<FieldDef[]> {
	const allFieldDefs = await ctx.db
		.query("fieldDefs")
		.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
		.collect();

	return allFieldDefs.filter((fieldDef) => fieldDef.isActive);
}

function resolveRelationFieldBindings(args: {
	inboundLinkTypes: readonly LinkTypeDef[];
	objectDef: ObjectDef;
	outboundLinkTypes: readonly LinkTypeDef[];
	relationFields: readonly Pick<
		NormalizedFieldDefinition,
		"name" | "relation"
	>[];
}): RelationFieldBinding[] {
	return args.relationFields.flatMap((field) => {
		const relation = field.relation;
		if (!relation) {
			return [];
		}

		const relationName = relation.relationName?.trim().toLowerCase();
		const outboundMatches = args.outboundLinkTypes
			.filter((linkTypeDef) => {
				if (
					relation.targetObjectDefId &&
					linkTypeDef.targetObjectDefId !== relation.targetObjectDefId
				) {
					return false;
				}

				return relationName
					? linkTypeDef.name.trim().toLowerCase() === relationName
					: true;
			})
			.map((linkTypeDef) => ({
				direction: "outbound" as const,
				linkTypeDefId: linkTypeDef._id,
			}));
		const inboundMatches = args.inboundLinkTypes
			.filter((linkTypeDef) => {
				if (
					relation.targetObjectDefId &&
					linkTypeDef.sourceObjectDefId !== relation.targetObjectDefId
				) {
					return false;
				}

				return relationName
					? linkTypeDef.name.trim().toLowerCase() === relationName
					: true;
			})
			.map((linkTypeDef) => ({
				direction: "inbound" as const,
				linkTypeDefId: linkTypeDef._id,
			}));

		return [
			{
				fieldName: field.name,
				cardinality: relation.cardinality,
				matches: [...outboundMatches, ...inboundMatches],
			},
		];
	});
}

async function loadLinksByType(args: {
	ctx: QueryCtx;
	linkTypeDefIds: readonly Id<"linkTypeDefs">[];
	orgId: string;
	records: readonly UnifiedRecord[];
}): Promise<Map<string, RecordLinkDoc[]>> {
	const allowedLinkTypeIds = new Set(
		args.linkTypeDefIds.map((linkTypeDefId) => linkTypeDefId.toString())
	);
	const linksByType = new Map<string, RecordLinkDoc[]>();
	const seenLinkIdsByType = new Map<string, Set<string>>();

	await Promise.all(
		args.records.map(async (record) => {
			const [outboundLinks, inboundLinks] = await Promise.all([
				args.ctx.db
					.query("recordLinks")
					.withIndex("by_org_source", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("sourceKind", record._kind)
							.eq("sourceId", record._id)
					)
					.collect(),
				args.ctx.db
					.query("recordLinks")
					.withIndex("by_org_target", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("targetKind", record._kind)
							.eq("targetId", record._id)
					)
					.collect(),
			]);

			for (const link of [...outboundLinks, ...inboundLinks]) {
				if (link.isDeleted) {
					continue;
				}

				const linkTypeDefKey = link.linkTypeDefId.toString();
				if (!allowedLinkTypeIds.has(linkTypeDefKey)) {
					continue;
				}

				const seenLinkIds =
					seenLinkIdsByType.get(linkTypeDefKey) ?? new Set<string>();
				if (seenLinkIds.has(link._id.toString())) {
					continue;
				}

				seenLinkIds.add(link._id.toString());
				seenLinkIdsByType.set(linkTypeDefKey, seenLinkIds);
				const matchingLinks = linksByType.get(linkTypeDefKey) ?? [];
				matchingLinks.push(link);
				linksByType.set(linkTypeDefKey, matchingLinks);
			}
		})
	);

	return linksByType;
}

function getRecordDisplayLabel(args: {
	activeFieldDefs: readonly FieldDef[];
	objectDef: ObjectDef;
	record: UnifiedRecord;
}): string {
	const adapterContract = buildEntityViewAdapter({
		currentLayout: "table",
		fieldDefs: args.activeFieldDefs,
		objectDef: args.objectDef,
		objectDefId: args.objectDef._id,
	});

	if (adapterContract.titleFieldName) {
		const preferredValue = args.record.fields[adapterContract.titleFieldName];
		if (
			typeof preferredValue === "string" &&
			preferredValue.trim().length > 0
		) {
			return preferredValue;
		}
	}

	for (const fieldDef of args.activeFieldDefs) {
		const value = args.record.fields[fieldDef.name];
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}

	return args.record._id;
}

async function resolveRelationCellItem(args: {
	activeFieldDefsByObjectId: Map<string, FieldDef[]>;
	ctx: QueryCtx;
	objectDefsById: Map<string, ObjectDef>;
	orgId: string;
	reference: RelationPeerReference;
}): Promise<RelationCellItem | null> {
	if (args.reference.recordKind === "record") {
		const normalizedId = args.ctx.db.normalizeId(
			"records",
			args.reference.recordId
		);
		if (!normalizedId) {
			return null;
		}

		const recordDoc = await args.ctx.db.get(normalizedId);
		if (!recordDoc || recordDoc.orgId !== args.orgId || recordDoc.isDeleted) {
			return null;
		}

		return {
			label: recordDoc.labelValue ?? args.reference.recordId,
			objectDefId: args.reference.objectDefId,
			recordId: args.reference.recordId,
			recordKind: args.reference.recordKind,
		};
	}

	const objectDefKey = args.reference.objectDefId.toString();
	let objectDef = args.objectDefsById.get(objectDefKey);
	if (!objectDef) {
		const loadedObjectDef = await args.ctx.db.get(args.reference.objectDefId);
		if (
			!loadedObjectDef ||
			loadedObjectDef.orgId !== args.orgId ||
			!loadedObjectDef.isActive
		) {
			return null;
		}
		objectDef = loadedObjectDef;
		args.objectDefsById.set(objectDefKey, loadedObjectDef);
	}

	let activeFieldDefs = args.activeFieldDefsByObjectId.get(objectDefKey);
	if (!activeFieldDefs) {
		activeFieldDefs = await loadActiveFieldDefs(
			args.ctx,
			args.reference.objectDefId
		);
		args.activeFieldDefsByObjectId.set(objectDefKey, activeFieldDefs);
	}

	const record = await getNativeRecordById(
		args.ctx,
		objectDef,
		activeFieldDefs,
		args.orgId,
		args.reference.recordId
	);
	if (!record) {
		return null;
	}

	return {
		label: getRecordDisplayLabel({
			activeFieldDefs,
			objectDef,
			record,
		}),
		objectDefId: args.reference.objectDefId,
		recordId: args.reference.recordId,
		recordKind: args.reference.recordKind,
	};
}

function collectFieldReferences(args: {
	currentRecordKeys: ReadonlySet<string>;
	linksByType: ReadonlyMap<string, readonly RecordLinkDoc[]>;
	relationFieldBindings: readonly RelationFieldBinding[];
}): Map<string, Map<string, RelationPeerReference>> {
	const fieldReferences = new Map<string, Map<string, RelationPeerReference>>();

	for (const binding of args.relationFieldBindings) {
		for (const match of binding.matches) {
			const links = args.linksByType.get(match.linkTypeDefId.toString()) ?? [];
			for (const link of links) {
				const currentKey =
					match.direction === "outbound"
						? createRecordReferenceKey(link.sourceKind, link.sourceId)
						: createRecordReferenceKey(link.targetKind, link.targetId);
				if (!args.currentRecordKeys.has(currentKey)) {
					continue;
				}

				const peerReference: RelationPeerReference =
					match.direction === "outbound"
						? {
								objectDefId: link.targetObjectDefId,
								recordId: link.targetId,
								recordKind: link.targetKind,
							}
						: {
								objectDefId: link.sourceObjectDefId,
								recordId: link.sourceId,
								recordKind: link.sourceKind,
							};
				const fieldReferenceKey = createFieldReferenceKey(
					currentKey,
					binding.fieldName
				);
				const referencesForField =
					fieldReferences.get(fieldReferenceKey) ??
					new Map<string, RelationPeerReference>();

				referencesForField.set(
					createPeerReferenceKey(peerReference),
					peerReference
				);
				fieldReferences.set(fieldReferenceKey, referencesForField);
			}
		}
	}

	return fieldReferences;
}

async function resolveRelationItemsByKey(args: {
	ctx: QueryCtx;
	fieldReferences: ReadonlyMap<
		string,
		ReadonlyMap<string, RelationPeerReference>
	>;
	orgId: string;
}): Promise<Map<string, RelationCellItem | null>> {
	const objectDefsById = new Map<string, ObjectDef>();
	const activeFieldDefsByObjectId = new Map<string, FieldDef[]>();
	const uniqueReferencesByKey = new Map<string, RelationPeerReference>();
	const resolvedItemsByKey = new Map<string, RelationCellItem | null>();

	for (const referencesForField of args.fieldReferences.values()) {
		for (const reference of referencesForField.values()) {
			const peerReferenceKey = createPeerReferenceKey(reference);
			uniqueReferencesByKey.set(peerReferenceKey, reference);
		}
	}

	const resolvedEntries = await Promise.all(
		[...uniqueReferencesByKey.entries()].map(
			async ([peerReferenceKey, reference]) =>
				[
					peerReferenceKey,
					await resolveRelationCellItem({
						activeFieldDefsByObjectId,
						ctx: args.ctx,
						objectDefsById,
						orgId: args.orgId,
						reference,
					}),
				] as const
		)
	);

	for (const [peerReferenceKey, resolvedItem] of resolvedEntries) {
		resolvedItemsByKey.set(peerReferenceKey, resolvedItem);
	}

	return resolvedItemsByKey;
}

function buildRelationDisplayValuesForRecord(args: {
	bindings: readonly RelationFieldBinding[];
	fieldReferences: ReadonlyMap<
		string,
		ReadonlyMap<string, RelationPeerReference>
	>;
	record: UnifiedRecord;
	resolvedItemsByKey: ReadonlyMap<string, RelationCellItem | null>;
}): Map<string, RelationCellDisplayValue> {
	const recordKey = createRecordReferenceKey(
		args.record._kind,
		args.record._id
	);
	const displayValues = new Map<string, RelationCellDisplayValue>();

	for (const binding of args.bindings) {
		const fieldReferenceKey = createFieldReferenceKey(
			recordKey,
			binding.fieldName
		);
		const referencesForField = args.fieldReferences.get(fieldReferenceKey);
		const items = referencesForField
			? [...referencesForField.values()].flatMap((reference) => {
					const resolved = args.resolvedItemsByKey.get(
						createPeerReferenceKey(reference)
					);
					return resolved ? [resolved] : [];
				})
			: [];

		displayValues.set(binding.fieldName, {
			cardinality: binding.cardinality,
			items,
			kind: "relation",
		});
	}

	return displayValues;
}

export async function buildRelationCellDisplayValueMap(args: {
	ctx: QueryCtx;
	fields: readonly Pick<NormalizedFieldDefinition, "name" | "relation">[];
	objectDef: ObjectDef;
	orgId: string;
	records: readonly UnifiedRecord[];
}): Promise<Map<string, Map<string, RelationCellDisplayValue>>> {
	if (args.records.length === 0) {
		return new Map();
	}

	const relationFields = args.fields.filter((field) => field.relation);
	if (relationFields.length === 0) {
		return new Map();
	}

	const [outboundLinkTypes, inboundLinkTypes] = await Promise.all([
		args.ctx.db
			.query("linkTypeDefs")
			.withIndex("by_org_source_object", (q) =>
				q.eq("orgId", args.orgId).eq("sourceObjectDefId", args.objectDef._id)
			)
			.collect(),
		args.ctx.db
			.query("linkTypeDefs")
			.withIndex("by_org_target_object", (q) =>
				q.eq("orgId", args.orgId).eq("targetObjectDefId", args.objectDef._id)
			)
			.collect(),
	]);

	const relationFieldBindings = resolveRelationFieldBindings({
		inboundLinkTypes,
		objectDef: args.objectDef,
		outboundLinkTypes,
		relationFields,
	});
	if (relationFieldBindings.length === 0) {
		return new Map();
	}

	const uniqueLinkTypeDefIds = [
		...new Set(
			relationFieldBindings.flatMap((binding) =>
				binding.matches.map((match) => match.linkTypeDefId.toString())
			)
		),
	].map((linkTypeDefId) => linkTypeDefId as Id<"linkTypeDefs">);
	const linksByType = await loadLinksByType({
		ctx: args.ctx,
		linkTypeDefIds: uniqueLinkTypeDefIds,
		orgId: args.orgId,
		records: args.records,
	});

	const currentRecordKeys = new Set(
		args.records.map((record) =>
			createRecordReferenceKey(record._kind, record._id)
		)
	);
	const fieldReferences = collectFieldReferences({
		currentRecordKeys,
		linksByType,
		relationFieldBindings,
	});
	const resolvedItemsByKey = await resolveRelationItemsByKey({
		ctx: args.ctx,
		fieldReferences,
		orgId: args.orgId,
	});

	const displayValuesByRecordId = new Map<
		string,
		Map<string, RelationCellDisplayValue>
	>();

	for (const record of args.records) {
		const displayValues = buildRelationDisplayValuesForRecord({
			bindings: relationFieldBindings,
			fieldReferences,
			record,
			resolvedItemsByKey,
		});

		if (displayValues.size > 0) {
			displayValuesByRecordId.set(record._id, displayValues);
		}
	}

	return displayValuesByRecordId;
}

export async function materializeRelationFieldValues(args: {
	ctx: QueryCtx;
	fields: readonly Pick<NormalizedFieldDefinition, "name" | "relation">[];
	objectDef: ObjectDef;
	orgId: string;
	records: readonly UnifiedRecord[];
}): Promise<UnifiedRecord[]> {
	const relationDisplayValuesByRecordId =
		await buildRelationCellDisplayValueMap({
			ctx: args.ctx,
			fields: args.fields,
			objectDef: args.objectDef,
			orgId: args.orgId,
			records: args.records,
		});

	return args.records.map((record) => {
		const relationDisplayValues = relationDisplayValuesByRecordId.get(
			record._id
		);
		if (!relationDisplayValues) {
			return record;
		}

		const nextFields = { ...record.fields };
		let changed = false;

		for (const [fieldName, relationDisplayValue] of relationDisplayValues) {
			nextFields[fieldName] = relationDisplayValue;
			changed = true;
		}

		return changed
			? {
					...record,
					fields: nextFields,
				}
			: record;
	});
}

export function buildEntityViewCellDisplayValueMap(args: {
	records: readonly UnifiedRecord[];
	relationDisplayValuesByRecordId?: ReadonlyMap<
		string,
		ReadonlyMap<string, RelationCellDisplayValue>
	>;
}): Map<string, Map<string, EntityViewCellDisplayValue>> {
	const displayValuesByRecordId = new Map<
		string,
		Map<string, EntityViewCellDisplayValue>
	>();

	for (const record of args.records) {
		const relationDisplayValues = args.relationDisplayValuesByRecordId?.get(
			record._id
		);
		const displayValues = new Map<string, EntityViewCellDisplayValue>();

		for (const [fieldName, relationDisplayValue] of relationDisplayValues ??
			[]) {
			displayValues.set(fieldName, relationDisplayValue);
		}

		displayValuesByRecordId.set(record._id, displayValues);
	}

	return displayValuesByRecordId;
}
