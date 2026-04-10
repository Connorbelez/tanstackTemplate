import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { ListingDetailPage } from "#/components/demo/listings/ListingDetailPage";
import { getListingDetailMock } from "#/components/demo/listings/listing-detail-mock-data";

export const Route = createFileRoute("/demo/listings/$listingid")({
	loader: ({ params }) => {
		const listing = getListingDetailMock(params.listingid);
		if (!listing) {
			throw notFound();
		}
		return { listing };
	},
	component: DemoListingDetailRouteComponent,
	notFoundComponent: DemoListingDetailNotFoundComponent,
});

function DemoListingDetailRouteComponent() {
	const { listing } = Route.useLoaderData();

	return <ListingDetailPage listing={listing} />;
}

function DemoListingDetailNotFoundComponent() {
	const { listingid } = Route.useParams();

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
							We could not find a demo listing for <code>{listingid}</code>.
						</p>
					</div>
				</div>

				<Link
					className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E7E5E4] px-4 py-2 font-medium text-sm hover:bg-[#FBFAF8]"
					to="/demo/listings"
				>
					<ArrowLeft className="size-4" />
					Back to Listings
				</Link>
			</div>
		</div>
	);
}
