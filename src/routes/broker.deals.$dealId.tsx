import { createFileRoute } from "@tanstack/react-router";
import { BrokerDealDetailPage } from "#/components/broker/deals/BrokerDealDetailPage";

export const Route = createFileRoute("/broker/deals/$dealId")({
	component: BrokerDealDetailRoute,
});

function BrokerDealDetailRoute() {
	const { dealId } = Route.useParams();

	return <BrokerDealDetailPage dealId={dealId} />;
}
