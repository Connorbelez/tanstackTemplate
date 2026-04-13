import {
	ROLE_PERMISSIONS as CANONICAL_ROLE_PERMISSIONS,
	type RoleSlug,
	lookupPermissions,
} from "../../../convex/auth/permissionCatalog";

export type { RoleSlug };
export { lookupPermissions };

export const ROLE_PERMISSIONS: Record<string, readonly string[]> =
	CANONICAL_ROLE_PERMISSIONS;
