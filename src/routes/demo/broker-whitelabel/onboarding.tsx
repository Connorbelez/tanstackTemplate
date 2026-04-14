import { createFileRoute } from "@tanstack/react-router";
import { BrokerWhiteLabelOnboardingPage } from "./-components/BrokerWhiteLabelPages";

export const Route = createFileRoute("/demo/broker-whitelabel/onboarding")({
	component: BrokerWhiteLabelOnboardingRouteComponent,
});

export function BrokerWhiteLabelOnboardingRouteComponent() {
	return <BrokerWhiteLabelOnboardingPage />;
}
