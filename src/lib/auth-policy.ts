import { FAIRLEND_STAFF_ORG_ID } from "../../convex/constants";

type ClaimCollection = Iterable<string> | readonly string[] | null | undefined;
export const ADMIN_ACCESS_PERMISSION = "admin:access";

export interface PermissionCheckContext extends FairLendAdminCheck {
	permissions: ClaimCollection;
}

export interface RoleClaimsInput {
	role?: string | null;
	roles?: unknown;
}

export interface FairLendAdminCheck extends RoleClaimsInput {
	orgId?: string | null;
	permissions?: ClaimCollection;
}

export function parseClaimArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === "string");
	}

	if (typeof value === "string" && value.length > 0) {
		try {
			const parsed: unknown = JSON.parse(value);
			return Array.isArray(parsed)
				? parsed.filter((entry): entry is string => typeof entry === "string")
				: [];
		} catch {
			return [];
		}
	}

	return [];
}

export function normalizeRoles({ role, roles }: RoleClaimsInput): string[] {
	const normalizedRoles = new Set(parseClaimArray(roles));

	if (typeof role === "string" && role.length > 0) {
		normalizedRoles.add(role);
	}

	return [...normalizedRoles];
}

export function normalizePermissions(permissions: unknown): string[] {
	return [...new Set(parseClaimArray(permissions))];
}

export function resolvePrimaryRole({
	role,
	roles,
}: RoleClaimsInput): string | null {
	if (typeof role === "string" && role.length > 0) {
		return role;
	}

	return normalizeRoles({ role, roles })[0] ?? null;
}

function toClaimSet(values: ClaimCollection): ReadonlySet<string> {
	if (!values) {
		return new Set<string>();
	}

	if (values instanceof Set) {
		return values;
	}

	return new Set(values);
}

export function hasPermission(
	permissions: ClaimCollection,
	permission: string
): boolean {
	return toClaimSet(permissions).has(permission);
}

export function hasAnyPermission(
	permissions: ClaimCollection,
	requiredPermissions: readonly string[]
): boolean {
	const permissionSet = toClaimSet(permissions);
	return requiredPermissions.some((permission) =>
		permissionSet.has(permission)
	);
}

export function isFairLendStaffAdmin(context: FairLendAdminCheck): boolean {
	return (
		context.orgId === FAIRLEND_STAFF_ORG_ID &&
		(normalizeRoles(context).includes("admin") ||
			hasAdminAccessPermission(context.permissions))
	);
}

export function hasAdminAccessPermission(
	permissions: ClaimCollection
): boolean {
	return hasPermission(permissions, ADMIN_ACCESS_PERMISSION);
}

export function hasEffectivePermission(
	context: PermissionCheckContext,
	permission: string
): boolean {
	return (
		hasAdminAccessPermission(context.permissions) ||
		hasPermission(context.permissions, permission)
	);
}

export function hasAnyEffectivePermission(
	context: PermissionCheckContext,
	requiredPermissions: readonly string[]
): boolean {
	return (
		hasAdminAccessPermission(context.permissions) ||
		hasAnyPermission(context.permissions, requiredPermissions)
	);
}
