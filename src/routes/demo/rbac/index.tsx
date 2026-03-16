import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/rbac/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/demo/rbac/"!</div>;
}
