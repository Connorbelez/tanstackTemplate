export type AdminEntityDomain =
	| "marketplace"
	| "payments"
	| "ledger"
	| "system";

export interface AdminDomainDefinition {
	readonly id: AdminEntityDomain;
	readonly label: string;
	readonly order: number;
}

export interface AdminEntityDefinition {
	readonly domain: AdminEntityDomain;
	readonly entityType: string;
	readonly iconName: string;
	readonly isHiddenFromNavigation?: boolean;
	readonly labelColor?: string;
	readonly pluralLabel: string;
	readonly route: `/admin/${string}`;
	readonly singularLabel: string;
	readonly supportsDetailPage: boolean;
	readonly supportsTableView: boolean;
	readonly tableName?: string;
}

export const ADMIN_DOMAIN_DEFINITIONS = {
	marketplace: { id: "marketplace", label: "Marketplace", order: 10 },
	payments: { id: "payments", label: "Payments", order: 20 },
	ledger: { id: "ledger", label: "Ledger", order: 30 },
	system: { id: "system", label: "System", order: 40 },
} as const satisfies Record<AdminEntityDomain, AdminDomainDefinition>;

export const ADMIN_ENTITIES = [
	{
		entityType: "listings",
		singularLabel: "Listing",
		pluralLabel: "Listings",
		route: "/admin/listings",
		iconName: "box",
		domain: "marketplace",
		tableName: "listings",
		labelColor: "sky",
		supportsTableView: true,
		supportsDetailPage: true,
	},
	{
		entityType: "properties",
		singularLabel: "Property",
		pluralLabel: "Properties",
		route: "/admin/properties",
		iconName: "building-2",
		domain: "marketplace",
		tableName: "properties",
		labelColor: "cyan",
		supportsTableView: true,
		supportsDetailPage: true,
	},
	{
		entityType: "deals",
		singularLabel: "Deal",
		pluralLabel: "Deals",
		route: "/admin/deals",
		iconName: "handshake",
		domain: "marketplace",
		tableName: "deals",
		labelColor: "emerald",
		supportsTableView: true,
		supportsDetailPage: true,
	},
	{
		entityType: "mortgages",
		singularLabel: "Mortgage",
		pluralLabel: "Mortgages",
		route: "/admin/mortgages",
		iconName: "landmark",
		domain: "payments",
		tableName: "mortgages",
		labelColor: "blue",
		supportsTableView: true,
		supportsDetailPage: true,
	},
	{
		entityType: "obligations",
		singularLabel: "Obligation",
		pluralLabel: "Obligations",
		route: "/admin/obligations",
		iconName: "badge-dollar-sign",
		domain: "payments",
		tableName: "obligations",
		labelColor: "amber",
		supportsTableView: true,
		supportsDetailPage: true,
	},
	{
		entityType: "lenders",
		singularLabel: "Lender",
		pluralLabel: "Lenders",
		route: "/admin/lenders",
		iconName: "building",
		domain: "system",
		tableName: "lenders",
		labelColor: "violet",
		supportsTableView: true,
		supportsDetailPage: true,
	},
	{
		entityType: "borrowers",
		singularLabel: "Borrower",
		pluralLabel: "Borrowers",
		route: "/admin/borrowers",
		iconName: "user",
		domain: "system",
		tableName: "borrowers",
		labelColor: "rose",
		supportsTableView: true,
		supportsDetailPage: true,
	},
	{
		entityType: "brokers",
		singularLabel: "Broker",
		pluralLabel: "Brokers",
		route: "/admin/brokers",
		iconName: "briefcase",
		domain: "system",
		tableName: "brokers",
		labelColor: "slate",
		supportsTableView: true,
		supportsDetailPage: true,
	},
] as const satisfies readonly AdminEntityDefinition[];

export type AdminEntity = (typeof ADMIN_ENTITIES)[number];
export type AdminEntityRoute = (typeof ADMIN_ENTITIES)[number]["route"];

export type AdminNavigationItemKind = "entity" | "route";

interface StaticAdminNavigationItem {
	readonly domain: AdminEntityDomain;
	readonly iconName?: string;
	readonly kind: "route";
	readonly label: string;
	readonly route: `/admin${string}`;
}

export const STATIC_ADMIN_NAV_ITEMS = [
	{
		kind: "route",
		label: "Dashboard",
		route: "/admin",
		domain: "system",
		iconName: "shield",
	},
] as const satisfies readonly StaticAdminNavigationItem[];

export type StaticAdminRoute = (typeof STATIC_ADMIN_NAV_ITEMS)[number]["route"];

export type AdminNavigationRoute = AdminEntityRoute | StaticAdminRoute;

interface AdminEntityNavigationItem {
	readonly domain: AdminEntityDomain;
	readonly entityType: AdminEntity["entityType"];
	readonly iconName: AdminEntity["iconName"];
	readonly kind: "entity";
	readonly label: string;
	readonly route: AdminEntityRoute;
}

interface AdminStaticNavigationItem {
	readonly domain: AdminEntityDomain;
	readonly entityType?: string;
	readonly iconName?: string;
	readonly kind: "route";
	readonly label: string;
	readonly route: StaticAdminRoute;
}

export type AdminNavigationItem =
	| AdminEntityNavigationItem
	| AdminStaticNavigationItem;

export interface AdminNavigationSection {
	readonly domain: AdminEntityDomain;
	readonly items: readonly AdminNavigationItem[];
	readonly label: string;
}

const ADMIN_ENTITIES_BY_TYPE: ReadonlyMap<string, AdminEntity> = new Map(
	ADMIN_ENTITIES.map((entity) => [entity.entityType, entity] as const)
);

const ADMIN_ENTITIES_BY_TABLE_NAME: ReadonlyMap<string, AdminEntity> = new Map(
	ADMIN_ENTITIES.flatMap((entity) =>
		entity.tableName ? [[entity.tableName, entity] as const] : []
	)
);

const ADMIN_ENTITIES_BY_ROUTE: ReadonlyMap<AdminEntityRoute, AdminEntity> =
	new Map(ADMIN_ENTITIES.map((entity) => [entity.route, entity] as const));

function sortNavigationItems(
	left: AdminNavigationItem,
	right: AdminNavigationItem
): number {
	if (left.kind !== right.kind) {
		return left.kind === "route" ? -1 : 1;
	}

	return left.label.localeCompare(right.label);
}

export function getAdminEntityByType(entityType: string) {
	return ADMIN_ENTITIES_BY_TYPE.get(entityType);
}

export function getAdminEntityByRoute(route: AdminEntityRoute) {
	return ADMIN_ENTITIES_BY_ROUTE.get(route);
}

export function getAdminEntityByTableName(tableName: string) {
	return ADMIN_ENTITIES_BY_TABLE_NAME.get(tableName);
}

export function getAdminEntityForObjectDef(objectDef: {
	name?: string;
	nativeTable?: string;
	pluralLabel?: string;
	singularLabel?: string;
}) {
	if (objectDef.nativeTable) {
		const entityByTable = getAdminEntityByTableName(objectDef.nativeTable);
		if (entityByTable) {
			return entityByTable;
		}
	}

	const normalizedCandidates = [
		objectDef.name,
		objectDef.pluralLabel,
		objectDef.singularLabel,
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => value.trim().toLowerCase());

	if (normalizedCandidates.length === 0) {
		return undefined;
	}

	return ADMIN_ENTITIES.find((entity) => {
		const entityCandidates = [
			entity.entityType,
			entity.pluralLabel,
			entity.singularLabel,
			entity.tableName,
		]
			.filter((value): value is string => Boolean(value))
			.map((value) => value.trim().toLowerCase());

		return normalizedCandidates.some((candidate) =>
			entityCandidates.includes(candidate)
		);
	});
}

export function getAdminEntityByPathname(pathname: string) {
	const segments = pathname.split("/").filter(Boolean);
	if (segments[0] !== "admin") {
		return undefined;
	}

	return getAdminEntityByType(segments[1] ?? "");
}

export function isAdminEntityType(value: string): boolean {
	return ADMIN_ENTITIES_BY_TYPE.has(value);
}

export function isAdminRouteActive(
	pathname: string,
	route: AdminNavigationRoute
): boolean {
	if (route === "/admin") {
		return pathname === route;
	}

	return pathname === route || pathname.startsWith(`${route}/`);
}

export function getAdminNavigationSections(): AdminNavigationSection[] {
	const groupedItems = new Map<AdminEntityDomain, AdminNavigationItem[]>(
		Object.keys(ADMIN_DOMAIN_DEFINITIONS).map((domain) => [
			domain as AdminEntityDomain,
			[],
		])
	);

	for (const item of STATIC_ADMIN_NAV_ITEMS) {
		const items = groupedItems.get(item.domain) ?? [];
		items.push(item);
		groupedItems.set(item.domain, items);
	}

	for (const entity of ADMIN_ENTITIES) {
		if ("isHiddenFromNavigation" in entity && entity.isHiddenFromNavigation) {
			continue;
		}

		const items = groupedItems.get(entity.domain) ?? [];
		items.push({
			kind: "entity",
			label: entity.pluralLabel,
			route: entity.route,
			domain: entity.domain,
			iconName: entity.iconName,
			entityType: entity.entityType,
		});
		groupedItems.set(entity.domain, items);
	}

	return Object.values(ADMIN_DOMAIN_DEFINITIONS)
		.sort((left, right) => left.order - right.order)
		.map((domain) => ({
			domain: domain.id,
			label: domain.label,
			items: (groupedItems.get(domain.id) ?? []).sort(sortNavigationItems),
		}))
		.filter((section) => section.items.length > 0);
}
