import { redirect } from "@tanstack/react-router";
import { FAIRLEND_STAFF_ORG_ID } from "../../convex/constants";
import { buildSignInRedirect } from "./auth-redirect";

/** Permissions that control island-level route access. */
export const ISLAND_PERMISSIONS = {
	admin: "admin:access",
	broker: "broker:access",
	borrower: "borrower:access",
	lender: "lender:access",
	underwriter: "underwriter:access",
	lawyer: "lawyer:access",
	onboarding: "onboarding:access",
} as const;

export type IslandPermission =
	(typeof ISLAND_PERMISSIONS)[keyof typeof ISLAND_PERMISSIONS];

const ADMIN_ACCESS_PERMISSION = ISLAND_PERMISSIONS.admin;

interface PermissionCheckOptions {
	allowAdminOverride?: boolean;
}

export function hasPermission(
	permissions: readonly string[],
	permission: string,
	options: PermissionCheckOptions = {}
): boolean {
	return (
		permissions.includes(permission) ||
		(options.allowAdminOverride !== false &&
			permissions.includes(ADMIN_ACCESS_PERMISSION))
	);
}

export function hasAnyPermission(
	permissions: readonly string[],
	requiredPermissions: readonly string[],
	options: PermissionCheckOptions = {}
): boolean {
	return requiredPermissions.some((permission) =>
		hasPermission(permissions, permission, options)
	);
}

export function isFairLendStaffAdmin(context: {
	orgId: string | null;
	roles: readonly string[];
}): boolean {
	return (
		context.orgId === FAIRLEND_STAFF_ORG_ID && context.roles.includes("admin")
	);
}

export function canAccessAdminPath(
	pathname: string,
	context: Pick<RouteAuthContext, "orgId" | "permissions" | "roles">
): boolean {
	if (isFairLendStaffAdmin(context)) {
		return true;
	}

	if (pathname === "/admin/underwriting") {
		return hasPermission(context.permissions, "underwriter:access", {
			allowAdminOverride: false,
		});
	}

	return pathname.startsWith("/admin/underwriting/")
		? hasPermission(context.permissions, "underwriter:access", {
				allowAdminOverride: false,
			})
		: false;
}

/** Auth context returned by the root beforeLoad and available to all child routes. */
export interface RouteAuthContext {
	orgId: string | null;
	permissions: string[];
	roles: string[];
	token: string | null;
	userId: string | null;
}

/**
 * Guard that requires authentication only. Redirects to /sign-in if not authenticated.
 */
export function guardAuthenticated() {
	return ({
		context,
		location,
	}: {
		context: RouteAuthContext;
		location: { href: string };
	}) => {
		if (!context.userId) {
			throw redirect(buildSignInRedirect(location.href));
		}
	};
}

/**
 * Creates a TanStack Router `beforeLoad` guard that checks for a required permission.
 * Redirects to /sign-in if not authenticated, /unauthorized if missing permission.
 */
export function guardPermission(
	permission: string,
	options: PermissionCheckOptions = {}
) {
	return ({
		context,
		location,
	}: {
		context: RouteAuthContext;
		location: { href: string };
	}) => {
		if (!context.userId) {
			throw redirect(buildSignInRedirect(location.href));
		}
		if (!hasPermission(context.permissions, permission, options)) {
			throw redirect({ to: "/unauthorized" });
		}
	};
}

export function guardFairLendAdmin() {
	return ({
		context,
		location,
	}: {
		context: RouteAuthContext;
		location: { href: string };
	}) => {
		if (!context.userId) {
			throw redirect(buildSignInRedirect(location.href));
		}
		if (!isFairLendStaffAdmin(context)) {
			throw redirect({ to: "/unauthorized" });
		}
	};
}

export function guardFairLendAdminWithPermission(permission: string) {
	return ({
		context,
		location,
	}: {
		context: RouteAuthContext;
		location: { href: string };
	}) => {
		if (!context.userId) {
			throw redirect(buildSignInRedirect(location.href));
		}
		if (!isFairLendStaffAdmin(context)) {
			throw redirect({ to: "/unauthorized" });
		}
		if (!hasPermission(context.permissions, permission)) {
			throw redirect({ to: "/unauthorized" });
		}
	};
}

export function guardAnyPermission(
	requiredPermissions: readonly string[],
	options: PermissionCheckOptions = {}
) {
	return ({
		context,
		location,
	}: {
		context: RouteAuthContext;
		location: { href: string };
	}) => {
		if (!context.userId) {
			throw redirect(buildSignInRedirect(location.href));
		}
		if (!hasAnyPermission(context.permissions, requiredPermissions, options)) {
			throw redirect({ to: "/unauthorized" });
		}
	};
}
