import { redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAppAuth } from "#/hooks/use-app-auth";
import { isFairLendStaffAdmin as policyIsFairLendStaffAdmin } from "#/lib/auth-policy";
import {
	hasAnyPermissionGrant,
	hasPermissionGrant,
} from "../../convex/auth/permissionCatalog";
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

interface PermissionCheckOptions {
	allowAdminOverride?: boolean;
}

export interface RouteAuthContext {
	orgId: string | null;
	permissions: string[];
	role: string | null;
	roles: string[];
	token: string | null;
	userId: string | null;
}

export type AuthorizationRequirement =
	| {
			kind: "permission";
			options?: PermissionCheckOptions;
			permission: string;
	  }
	| {
			kind: "anyPermission";
			options?: PermissionCheckOptions;
			permissions: readonly string[];
	  }
	| {
			kind: "fairLendAdmin";
	  }
	| {
			kind: "fairLendAdminWithPermission";
			permission: string;
	  }
	| {
			kind: "operationalAdminPermission";
			permission: string;
	  };

function hasExactOperationalPermission(
	permissions: readonly string[],
	permission: string
) {
	return hasPermission(permissions, permission, {
		allowAdminOverride: false,
	});
}

export function hasPermission(
	permissions: readonly string[],
	permission: string,
	options: PermissionCheckOptions = {}
): boolean {
	if (options.allowAdminOverride === false) {
		return permissions.includes(permission);
	}
	return hasPermissionGrant(permissions, permission);
}

export function hasAnyPermission(
	permissions: readonly string[],
	requiredPermissions: readonly string[],
	options: PermissionCheckOptions = {}
): boolean {
	if (options.allowAdminOverride === false) {
		return requiredPermissions.some((permission) =>
			permissions.includes(permission)
		);
	}
	return hasAnyPermissionGrant(permissions, requiredPermissions);
}

export function isFairLendStaffAdmin(context: {
	permissions?: readonly string[];
	role?: string | null;
	orgId: string | null;
	roles: readonly string[];
}): boolean {
	return policyIsFairLendStaffAdmin(context);
}

export const ROUTE_AUTHORIZATION_RULES = {
	adminDocumentEngine: {
		kind: "fairLendAdminWithPermission",
		permission: "document:review",
	},
	adminOriginations: {
		kind: "operationalAdminPermission",
		permission: "mortgage:originate",
	},
	adminRotessaReconciliation: {
		kind: "operationalAdminPermission",
		permission: "payment:manage",
	},
	adminUnderwriting: {
		kind: "anyPermission",
		options: { allowAdminOverride: true },
		permissions: ["admin:access", "underwriter:access"],
	},
	borrower: {
		kind: "permission",
		permission: "borrower:access",
	},
	broker: {
		kind: "permission",
		permission: "broker:access",
	},
	lawyer: {
		kind: "permission",
		permission: "lawyer:access",
	},
	lender: {
		kind: "permission",
		permission: "lender:access",
	},
	onboarding: {
		kind: "permission",
		permission: "onboarding:access",
	},
} as const satisfies Record<string, AuthorizationRequirement>;

export type RouteAuthorizationKey = keyof typeof ROUTE_AUTHORIZATION_RULES;

const ADMIN_PATH_AUTHORIZATION_RULES: ReadonlyArray<{
	matches: (pathname: string) => boolean;
	routeKey: Extract<
		RouteAuthorizationKey,
		"adminOriginations" | "adminRotessaReconciliation" | "adminUnderwriting"
	>;
}> = [
	{
		matches: (pathname) =>
			pathname === "/admin/underwriting" ||
			pathname.startsWith("/admin/underwriting/"),
		routeKey: "adminUnderwriting",
	},
	{
		matches: (pathname) =>
			pathname === "/admin/originations" ||
			pathname.startsWith("/admin/originations/"),
		routeKey: "adminOriginations",
	},
	{
		matches: (pathname) =>
			pathname === "/admin/rotessa-reconciliation" ||
			pathname.startsWith("/admin/rotessa-reconciliation/"),
		routeKey: "adminRotessaReconciliation",
	},
];

function resolveAuthorizationRequirement(
	requirement: AuthorizationRequirement | RouteAuthorizationKey
): AuthorizationRequirement {
	if (typeof requirement === "string") {
		return ROUTE_AUTHORIZATION_RULES[requirement];
	}

	return requirement;
}

export function isAuthorized(
	context: Pick<RouteAuthContext, "orgId" | "permissions" | "role" | "roles">,
	requirement: AuthorizationRequirement | RouteAuthorizationKey
): boolean {
	const resolvedRequirement = resolveAuthorizationRequirement(requirement);
	switch (resolvedRequirement.kind) {
		case "permission":
			return hasPermission(
				context.permissions,
				resolvedRequirement.permission,
				resolvedRequirement.options
			);
		case "anyPermission":
			return hasAnyPermission(
				context.permissions,
				resolvedRequirement.permissions,
				resolvedRequirement.options
			);
		case "fairLendAdmin":
			return isFairLendStaffAdmin(context);
		case "fairLendAdminWithPermission":
			return (
				isFairLendStaffAdmin(context) &&
				hasPermission(context.permissions, resolvedRequirement.permission)
			);
		case "operationalAdminPermission":
			return (
				isFairLendStaffAdmin(context) ||
				hasExactOperationalPermission(
					context.permissions,
					resolvedRequirement.permission
				)
			);
		default: {
			const exhaustiveCheck: never = resolvedRequirement;
			return exhaustiveCheck;
		}
	}
}

export function canAccessRoute(
	routeKey: RouteAuthorizationKey,
	context: Pick<RouteAuthContext, "orgId" | "permissions" | "role" | "roles">
): boolean {
	return isAuthorized(context, routeKey);
}

export function canAccessAdminPath(
	pathname: string,
	context: Pick<RouteAuthContext, "orgId" | "permissions" | "role" | "roles">
): boolean {
	const matchingRule = ADMIN_PATH_AUTHORIZATION_RULES.find((rule) =>
		rule.matches(pathname)
	);
	if (!matchingRule) {
		return isFairLendStaffAdmin(context);
	}

	return canAccessRoute(matchingRule.routeKey, context);
}

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

function guardAuthorization(
	requirement: AuthorizationRequirement | RouteAuthorizationKey
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
		if (!isAuthorized(context, requirement)) {
			throw redirect({ to: "/unauthorized" });
		}
	};
}

export function guardRouteAccess(routeKey: RouteAuthorizationKey) {
	return guardAuthorization(routeKey);
}

export function guardPermission(
	permission: string,
	options: PermissionCheckOptions = {}
) {
	return guardAuthorization({ kind: "permission", options, permission });
}

export function guardFairLendAdmin() {
	return guardAuthorization({ kind: "fairLendAdmin" });
}

export function guardFairLendAdminWithPermission(permission: string) {
	return guardAuthorization({
		kind: "fairLendAdminWithPermission",
		permission,
	});
}

export function guardAnyPermission(
	requiredPermissions: readonly string[],
	options: PermissionCheckOptions = {}
) {
	return guardAuthorization({
		kind: "anyPermission",
		options,
		permissions: requiredPermissions,
	});
}

export function guardOperationalAdminPermission(permission: string) {
	return guardAuthorization({
		kind: "operationalAdminPermission",
		permission,
	});
}

export function useAuthorization(
	requirement: AuthorizationRequirement | RouteAuthorizationKey
) {
	const auth = useAppAuth();
	return {
		allowed: isAuthorized(
			{
				orgId: auth.orgId,
				permissions: auth.permissions,
				role: auth.role,
				roles: auth.roles,
			},
			requirement
		),
		loading: auth.loading,
	};
}

export function AuthorizationGate(props: {
	children: ReactNode;
	fallback?: ReactNode;
	loadingFallback?: ReactNode;
	requirement: AuthorizationRequirement | RouteAuthorizationKey;
}) {
	const authorization = useAuthorization(props.requirement);
	if (authorization.loading) {
		return props.loadingFallback ?? null;
	}

	if (!authorization.allowed) {
		return props.fallback ?? null;
	}

	return props.children;
}
