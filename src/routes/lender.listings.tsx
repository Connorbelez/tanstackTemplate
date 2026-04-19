import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/lender/listings")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
