import { createFileRoute } from "@tanstack/react-router";
import { BrokerWhiteLabelAuthPage } from "./-components/BrokerWhiteLabelPages";

export const Route = createFileRoute("/demo/broker-whitelabel/auth")({
	component: BrokerWhiteLabelAuthRouteComponent,
});

export function BrokerWhiteLabelAuthRouteComponent() {
	return <BrokerWhiteLabelAuthPage />;
}
