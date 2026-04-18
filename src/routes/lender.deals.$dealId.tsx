import { createFileRoute } from "@tanstack/react-router";
import { LenderDealDetailPage } from "#/components/lender/deals/LenderDealDetailPage";

export const Route = createFileRoute("/lender/deals/$dealId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { dealId } = Route.useParams();

	return <LenderDealDetailPage dealId={dealId} />;
}
