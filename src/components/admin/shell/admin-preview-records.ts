import { isAdminEntityType } from "#/lib/admin-entities";
import { getAdminEntityByType } from "./entity-registry";

export interface AdminPreviewRecord {
	readonly amount: number;
	readonly id: number;
	readonly name: string;
}

export interface AdminPreviewEntityMeta {
	readonly entityType: string;
	readonly iconName?: string;
	readonly pluralLabel: string;
	readonly singularLabel: string;
	readonly supportsDetailPage: boolean;
	readonly supportsTableView: boolean;
	tableName?: string;
}

const ADMIN_PREVIEW_RECORD_COUNT = 10;

export function getAdminPreviewEntityMeta(
	entityType: string
): AdminPreviewEntityMeta | undefined {
	const entity = getAdminEntityByType(entityType);
	if (entity) {
		return entity;
	}

	if (!isAdminEntityType(entityType)) {
		return undefined;
	}

	return {
		entityType,
		pluralLabel: formatEntityLabel(entityType),
		singularLabel: singularizeEntityLabel(formatEntityLabel(entityType)),
		supportsDetailPage: true,
		supportsTableView: true,
		tableName: entityType,
	};
}

export function buildAdminPreviewRecords(
	entityType: string
): AdminPreviewRecord[] {
	const entity = getAdminPreviewEntityMeta(entityType);
	if (!entity) {
		return [];
	}

	const baseAmount = entity.singularLabel.length * 217;

	return Array.from({ length: ADMIN_PREVIEW_RECORD_COUNT }, (_, index) => ({
		id: index,
		name: `${entity.singularLabel} ${index + 1}`,
		amount: baseAmount + (index + 1) * 1375,
	}));
}

export function getAdminPreviewRecord(entityType: string, recordId: string) {
	return buildAdminPreviewRecords(entityType).find(
		(record) => String(record.id) === recordId
	);
}

function formatEntityLabel(entityType: string) {
	return entityType
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function singularizeEntityLabel(label: string) {
	if (label.endsWith("ies")) {
		return `${label.slice(0, -3)}y`;
	}

	if (label.endsWith("s")) {
		return label.slice(0, -1);
	}

	return label;
}
