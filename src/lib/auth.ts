import { redirect } from "@tanstack/react-router";

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
 * Creates a TanStack Router `beforeLoad` guard that checks for a required permission.
 * Redirects to /sign-in if not authenticated, /unauthorized if missing permission.
 */
export function guardPermission(permission: string) {
	return ({
		context,
		location,
	}: {
		context: RouteAuthContext;
		location: { pathname: string };
	}) => {
		if (!context.userId) {
			throw redirect({
				to: "/sign-in",
				search: { redirectTo: location.pathname },
			});
		}
		if (!context.permissions.includes(permission)) {
			throw redirect({ to: "/unauthorized" });
		}
	};
}
