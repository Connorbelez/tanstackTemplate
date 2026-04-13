import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { hasPermission } from "#/lib/auth";

/**
 * Returns true if the current user has the given permission.
 * Uses WorkOS JWT claims — no server round-trip.
 */
export function useCanDo(permission: string): boolean {
	const { permissions } = useAuth();
	return permissions ? hasPermission(permissions, permission) : false;
}
