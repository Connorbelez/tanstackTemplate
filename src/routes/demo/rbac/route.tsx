import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardAuthenticated } from "#/lib/auth";
import { api } from "@/../convex/_generated/api";

export const Route = createFileRoute("/demo/rbac")({
	beforeLoad: guardAuthenticated(),
	component: RBACRoute,
});

function RBACRoute() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.fluent.whoAmI, {}));
	const isProd = import.meta.env.PROD;

	return (
		<div>
			<pre>
				{isProd
					? JSON.stringify(
							{
								authId: viewer.authId,
								orgId: viewer.orgId,
								role: viewer.role,
								roles: viewer.roles,
								permissionCount: viewer.permissions?.length ?? 0,
							},
							null,
							2
						)
					: JSON.stringify(viewer, null, 2)}
			</pre>
			<Outlet />
		</div>
	);
}
