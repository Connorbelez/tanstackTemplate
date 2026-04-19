import { useAuthorization } from "#/lib/auth";

/**
 * Legacy convenience wrapper for component-level permission checks.
 * New code should prefer `useAuthorization(...)` directly.
 */
export function useCanDo(permission: string): boolean {
	return useAuthorization({
		kind: "permission",
		permission,
	}).allowed;
}
