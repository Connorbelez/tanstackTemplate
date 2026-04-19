export const ADMIN_ENTITY_TYPES = [
	"borrowers",
	"brokers",
	"deals",
	"lenders",
	"listings",
	"mortgages",
	"obligations",
	"properties",
] as const;

export type AdminEntityType = (typeof ADMIN_ENTITY_TYPES)[number];

export const RESERVED_ADMIN_ROUTE_SEGMENTS = [
	"financial-ledger",
	"payment-operations",
	"underwriting",
] as const;

export const ADMIN_ENTITY_LABELS: Record<AdminEntityType, string> = {
	borrowers: "Borrowers",
	brokers: "Brokers",
	deals: "Deals",
	lenders: "Lenders",
	listings: "Listings",
	mortgages: "Mortgages",
	obligations: "Obligations",
	properties: "Properties",
};

export function isAdminEntityType(value: string): value is AdminEntityType {
	return ADMIN_ENTITY_TYPES.includes(value as AdminEntityType);
}

export function isReservedAdminRouteSegment(value: string): boolean {
	return RESERVED_ADMIN_ROUTE_SEGMENTS.includes(
		value as (typeof RESERVED_ADMIN_ROUTE_SEGMENTS)[number]
	);
}
