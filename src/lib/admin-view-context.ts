import {
	type AdminEntity,
	getAdminEntityByType,
	getAdminEntityForObjectDef,
} from "#/components/admin/shell/entity-registry";
import type { Doc } from "../../convex/_generated/dataModel";
import type { UserSavedViewDefinition } from "../../convex/crm/types";

type ObjectDef = Doc<"objectDefs">;
type ViewDef = Doc<"viewDefs">;

export type AdminEntityViewMode = "kanban" | "table";

export interface ResolvedAdminEntityViewContext {
	readonly activeSavedView: UserSavedViewDefinition | null;
	readonly activeSourceView: ViewDef | undefined;
	readonly entity: AdminEntity | undefined;
	readonly kanbanView: ViewDef | undefined;
	readonly objectDef: ObjectDef | undefined;
	readonly tableView: ViewDef | undefined;
	readonly viewMode: AdminEntityViewMode;
}

function resolveActiveSourceView(args: {
	defaultSavedView: UserSavedViewDefinition | null;
	kanbanView: ViewDef | undefined;
	tableView: ViewDef | undefined;
	views: readonly ViewDef[];
}) {
	const requestedView = args.defaultSavedView?.sourceViewDefId
		? args.views.find(
				(view) => view._id === args.defaultSavedView?.sourceViewDefId
			)
		: undefined;

	if (requestedView && requestedView.viewType !== "calendar") {
		return requestedView;
	}

	if (args.defaultSavedView?.viewType === "kanban") {
		return args.kanbanView ?? args.tableView;
	}

	return args.tableView ?? args.kanbanView;
}

export function resolveAdminObjectDef(
	entityType: string,
	objectDefs: readonly ObjectDef[]
): ObjectDef | undefined {
	return objectDefs.find(
		(objectDef) =>
			getAdminEntityForObjectDef(objectDef)?.entityType === entityType
	);
}

export function findDefaultUserSavedView(
	savedViews: readonly UserSavedViewDefinition[]
): UserSavedViewDefinition | null {
	return savedViews.find((savedView) => savedView.isDefault) ?? null;
}

export function findSavedViewForSourceView(args: {
	savedViews: readonly UserSavedViewDefinition[];
	viewDefId: ViewDef["_id"];
	viewType: AdminEntityViewMode;
}) {
	return (
		args.savedViews.find(
			(savedView) =>
				savedView.sourceViewDefId === args.viewDefId &&
				savedView.viewType === args.viewType
		) ?? null
	);
}

export function resolveAdminEntityViewContext(args: {
	entityType: string;
	objectDefs: readonly ObjectDef[];
	savedViews: readonly UserSavedViewDefinition[];
	views: readonly ViewDef[];
}): ResolvedAdminEntityViewContext {
	const entity = getAdminEntityByType(args.entityType);
	const objectDef = resolveAdminObjectDef(args.entityType, args.objectDefs);
	const tableView = args.views.find((view) => view.viewType === "table");
	const kanbanView = args.views.find((view) => view.viewType === "kanban");
	const activeSavedView = findDefaultUserSavedView(args.savedViews);
	const activeSourceView = resolveActiveSourceView({
		defaultSavedView: activeSavedView,
		kanbanView,
		tableView,
		views: args.views,
	});
	const viewMode =
		activeSourceView?.viewType === "kanban" ||
		activeSavedView?.viewType === "kanban"
			? "kanban"
			: "table";

	return {
		activeSavedView,
		activeSourceView,
		entity,
		objectDef,
		tableView,
		kanbanView,
		viewMode,
	};
}
