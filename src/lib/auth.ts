import { redirect } from "@tanstack/react-router";
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
export function guardPermission(permission: IslandPermission) {
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
		if (!context.permissions.includes(permission)) {
			throw redirect({ to: "/unauthorized" });
		}
	};
}
