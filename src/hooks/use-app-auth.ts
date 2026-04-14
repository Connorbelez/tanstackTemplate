import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import {
	normalizePermissions,
	normalizeRoles,
	resolvePrimaryRole,
} from "#/lib/auth-policy";

export interface AppAuthContext {
	loading: boolean;
	orgId: string | null;
	permissions: string[];
	role: string | null;
	roles: string[];
	signOut: ReturnType<typeof useAuth>["signOut"];
	user: ReturnType<typeof useAuth>["user"];
}

/**
 * Typed wrapper around WorkOS useAuth() that normalizes optional fields
 * and exposes roles, permissions, orgId with consistent non-optional types.
 */
export function useAppAuth(): AppAuthContext {
	const auth = useAuth();
	const roles = normalizeRoles({ role: auth.role, roles: auth.roles });
	return {
		user: auth.user,
		loading: auth.loading,
		signOut: auth.signOut,
		orgId: auth.organizationId ?? null,
		role: resolvePrimaryRole({ role: auth.role, roles }),
		roles,
		permissions: normalizePermissions(auth.permissions),
	};
}
