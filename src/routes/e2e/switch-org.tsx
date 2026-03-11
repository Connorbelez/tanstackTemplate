import { createFileRoute, redirect } from "@tanstack/react-router";
import { switchToOrganization } from "@workos/authkit-tanstack-react-start";

export const Route = createFileRoute("/e2e/switch-org")({
	validateSearch: (search: Record<string, unknown>) => ({
		orgId: typeof search.orgId === "string" ? search.orgId : "",
	}),
	loaderDeps: ({ search: { orgId } }) => ({ orgId }),
	loader: async ({ deps: { orgId } }) => {
		// Gate behind VITE_E2E — prevents this route from functioning in production
		if (!import.meta.env.VITE_E2E) {
			throw redirect({ to: "/" });
		}

		if (!orgId) {
			throw redirect({ to: "/" });
		}

		await switchToOrganization({ data: { organizationId: orgId } });

		throw redirect({ to: "/" });
	},
});
