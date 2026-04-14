import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/broker-whitelabel/listings")({
	component: BrokerWhiteLabelListingsRouteLayout,
});

function BrokerWhiteLabelListingsRouteLayout() {
	return <Outlet />;
}
