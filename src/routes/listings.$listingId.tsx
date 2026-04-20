import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { MarketplaceListingDetailPage } from "#/components/listings/MarketplaceListingDetailPage";
import { marketplaceListingDetailQueryOptions } from "#/components/listings/query-options";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/listings/$listingId")({
	beforeLoad: guardRouteAccess("listings"),
	loader: async ({ context, params }) => {
		const detail = await context.queryClient.ensureQueryData(
			marketplaceListingDetailQueryOptions(params.listingId)
		);
		if (!detail) {
			throw notFound();
		}

		return { listingId: params.listingId };
	},
	component: RouteComponent,
	notFoundComponent: MarketplaceListingNotFoundComponent,
});

function RouteComponent() {
	const { listingId } = Route.useLoaderData();
	const { data } = useSuspenseQuery(
		marketplaceListingDetailQueryOptions(listingId)
	);

	if (!data) {
		throw notFound();
	}

	return <MarketplaceListingDetailPage snapshot={data} />;
}

function MarketplaceListingNotFoundComponent() {
	const { listingId } = Route.useParams();

	return (
		<div className="min-h-screen bg-[#FAFAF8] px-4 py-16 text-[#1F1F1B] sm:px-6">
			<div className="mx-auto max-w-2xl rounded-3xl border border-[#E7E5E4] bg-white px-8 py-10 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-full bg-[#F8EAEA] text-[#B42318]">
						<AlertCircle className="size-5" />
					</div>
					<div>
						<h1 className="font-semibold text-2xl tracking-tight">
							Unable to load listing
						</h1>
						<p className="mt-1 text-[#6B6B68] text-sm">
							We could not find a published listing for <code>{listingId}</code>
							.
						</p>
					</div>
				</div>

				<Link
					className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E7E5E4] px-4 py-2 font-medium text-sm hover:bg-[#FBFAF8]"
					to="/listings"
				>
					<ArrowLeft className="size-4" />
					Back to Listings
				</Link>
			</div>
		</div>
	);
}
