import { createFileRoute } from "@tanstack/react-router";
import { BrokerWhiteLabelLandingPage } from "./-components/BrokerWhiteLabelPages";

export const Route = createFileRoute("/demo/broker-whitelabel/")({
	component: BrokerWhiteLabelLandingRouteComponent,
});

export function BrokerWhiteLabelLandingRouteComponent() {
	return <BrokerWhiteLabelLandingPage />;
}
