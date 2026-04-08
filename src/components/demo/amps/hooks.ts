import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";

export function useAmpsDemoAccess() {
	const auth = useAuth();
	const canAccess =
		Boolean(auth.user) &&
		auth.organizationId === FAIRLEND_STAFF_ORG_ID &&
		Boolean(auth.roles?.includes("admin"));

	const workspaceOverview = useQuery(
		api.demo.amps.getWorkspaceOverview,
		canAccess ? {} : "skip"
	);

	return {
		auth,
		canAccess,
		workspaceOverview,
	};
}
