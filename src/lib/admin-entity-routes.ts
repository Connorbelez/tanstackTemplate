export const dedicatedAdminEntityTypes = [
	"borrowers",
	"deals",
	"listings",
	"mortgages",
	"obligations",
	"properties",
] as const;

export type DedicatedAdminEntityType =
	(typeof dedicatedAdminEntityTypes)[number];

export type DedicatedAdminRecordRoute =
	| "/admin/borrowers/$recordid"
	| "/admin/deals/$recordid"
	| "/admin/listings/$recordid"
	| "/admin/mortgages/$recordid"
	| "/admin/obligations/$recordid"
	| "/admin/properties/$recordid";

export function isDedicatedAdminEntityType(
	entityType: string
): entityType is DedicatedAdminEntityType {
	return dedicatedAdminEntityTypes.includes(
		entityType as DedicatedAdminEntityType
	);
}

export function getDedicatedAdminRecordRoute(
	entityType: DedicatedAdminEntityType
): DedicatedAdminRecordRoute {
	switch (entityType) {
		case "borrowers":
			return "/admin/borrowers/$recordid";
		case "deals":
			return "/admin/deals/$recordid";
		case "listings":
			return "/admin/listings/$recordid";
		case "mortgages":
			return "/admin/mortgages/$recordid";
		case "obligations":
			return "/admin/obligations/$recordid";
		case "properties":
			return "/admin/properties/$recordid";
		default:
			return "/admin/properties/$recordid";
	}
}
