import { createFileRoute, notFound } from "@tanstack/react-router";
import { BrokerWhiteLabelListingDetailPage } from "../-components/BrokerWhiteLabelPages";
import { getBrokerListingById } from "../-lib/store";

export const Route = createFileRoute(
	"/demo/broker-whitelabel/listings/$listingId"
)({
	loader: ({ params }) => {
		const listing = getBrokerListingById(params.listingId);
		if (!listing) {
			throw notFound();
		}

		return { listingId: listing.id };
	},
	component: BrokerWhiteLabelListingDetailRouteComponent,
});

export function BrokerWhiteLabelListingDetailRouteComponent() {
	const { listingId } = Route.useLoaderData();
	return <BrokerWhiteLabelListingDetailPage listingId={listingId} />;
}
