import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { api } from "@/../convex/_generated/api";

export const Route = createFileRoute("/demo/rbac")({
	component: RBACRoute,
});

function RBACRoute() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.fluent.whoAmI, {}));

	return (
		<div>
			<pre>{JSON.stringify(viewer, null, 2)}</pre>
			<Outlet />
		</div>
	);
}
