import { createFileRoute } from "@tanstack/react-router";
import { BrokerWhiteLabelListingsPage } from "../-components/BrokerWhiteLabelPages";

export const Route = createFileRoute("/demo/broker-whitelabel/listings/")({
	component: BrokerWhiteLabelListingsIndexRouteComponent,
});

export function BrokerWhiteLabelListingsIndexRouteComponent() {
	return <BrokerWhiteLabelListingsPage />;
}
