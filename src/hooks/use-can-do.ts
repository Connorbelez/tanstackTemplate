import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { hasEffectivePermission } from "#/lib/auth-policy";

/**
 * Returns true if the current user has the given permission.
 * Uses WorkOS JWT claims — no server round-trip.
 */
export function useCanDo(permission: string): boolean {
	const auth = useAuth();
	return hasEffectivePermission(
		{
			orgId: auth.organizationId ?? null,
			permissions: auth.permissions,
			role: auth.role,
			roles: auth.roles,
		},
		permission
	);
}
