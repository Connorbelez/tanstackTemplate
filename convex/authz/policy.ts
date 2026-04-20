import {
	ADMIN_ACCESS_PERMISSION as sharedAdminAccessPermission,
	hasAdminAccessPermission as sharedHasAdminAccessPermission,
	hasAnyEffectivePermission as sharedHasAnyEffectivePermission,
	hasEffectivePermission as sharedHasEffectivePermission,
	isFairLendStaffAdmin as sharedIsFairLendStaffAdmin,
	normalizePermissions as sharedNormalizePermissions,
	normalizeRoles as sharedNormalizeRoles,
	parseClaimArray as sharedParseClaimArray,
	resolvePrimaryRole as sharedResolvePrimaryRole,
} from "../../src/lib/auth-policy";

export type {
	FairLendAdminCheck,
	PermissionCheckContext,
	RoleClaimsInput,
} from "../../src/lib/auth-policy";

import type {
	FairLendAdminCheck,
	PermissionCheckContext,
	RoleClaimsInput,
} from "../../src/lib/auth-policy";

export const ADMIN_ACCESS_PERMISSION = sharedAdminAccessPermission;

export function parseClaimArray(value: unknown): string[] {
	return sharedParseClaimArray(value);
}

export function normalizeRoles(input: RoleClaimsInput): string[] {
	return sharedNormalizeRoles(input);
}

export function normalizePermissions(permissions: unknown): string[] {
	return sharedNormalizePermissions(permissions);
}

export function resolvePrimaryRole(input: RoleClaimsInput): string | null {
	return sharedResolvePrimaryRole(input);
}

export function isFairLendStaffAdmin(context: FairLendAdminCheck): boolean {
	return sharedIsFairLendStaffAdmin(context);
}

export function hasAdminAccessPermission(
	permissions: PermissionCheckContext["permissions"]
): boolean {
	return sharedHasAdminAccessPermission(permissions);
}

export function hasEffectivePermission(
	context: PermissionCheckContext,
	permission: string
): boolean {
	return sharedHasEffectivePermission(context, permission);
}

export function hasAnyEffectivePermission(
	context: PermissionCheckContext,
	requiredPermissions: readonly string[]
): boolean {
	return sharedHasAnyEffectivePermission(context, requiredPermissions);
}
