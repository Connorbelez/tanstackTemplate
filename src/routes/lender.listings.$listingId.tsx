import { createFileRoute } from "@tanstack/react-router";
import { LenderListingDetailPage } from "#/components/lender/listings/LenderListingDetailPage";

export const Route = createFileRoute("/lender/listings/$listingId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { listingId } = Route.useParams();

	return <LenderListingDetailPage listingId={listingId} />;
}
