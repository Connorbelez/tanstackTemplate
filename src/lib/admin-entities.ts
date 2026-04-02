export const ADMIN_ENTITY_TYPES = [
	"mortgages",
	"properties",
	"listings",
	"deals",
] as const;

export type AdminEntityType = (typeof ADMIN_ENTITY_TYPES)[number];

export const ADMIN_ENTITY_LABELS: Record<AdminEntityType, string> = {
	mortgages: "Mortgages",
	properties: "Properties",
	listings: "Listings",
	deals: "Deals",
};

export function isAdminEntityType(value: string): value is AdminEntityType {
	return ADMIN_ENTITY_TYPES.includes(value as AdminEntityType);
}
