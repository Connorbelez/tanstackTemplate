import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/broker/deals")({
	component: BrokerDealsRoute,
});

function BrokerDealsRoute() {
	return <Outlet />;
}
