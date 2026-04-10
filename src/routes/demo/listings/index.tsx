import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPinned } from "lucide-react";
import { getListingDetailMock } from "#/components/demo/listings/listing-detail-mock-data";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/demo/listings/")({
	component: DemoListingsIndexRouteComponent,
});

function DemoListingsIndexRouteComponent() {
	const featuredListing = getListingDetailMock("first-mortgage-north-york");

	return (
		<div className="min-h-screen bg-[#FAFAF8] px-4 py-10 text-[#1F1F1B] sm:px-6 lg:px-16">
			<div className="mx-auto max-w-5xl">
				<div className="rounded-3xl border border-[#E7E5E4] bg-white px-6 py-6 shadow-sm sm:px-8 sm:py-8">
					<p className="font-medium text-[#2E7D4F] text-xs uppercase tracking-[0.22em]">
						Demo listings
					</p>
					<h1 className="mt-3 font-semibold text-3xl tracking-tight sm:text-4xl">
						Listing detail demo index
					</h1>
					<p className="mt-3 max-w-2xl text-[#5A5956] text-sm leading-6 sm:text-base">
						This is a lightweight router target so detail pages can use typed
						links back to the demo listing hub.
					</p>

					<div className="mt-6 grid gap-4 sm:grid-cols-2">
						{featuredListing ? (
							<div className="rounded-2xl border border-[#E7E5E4] bg-[#FBFAF8] p-5">
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="font-medium text-[#6B6B68] text-xs uppercase tracking-[0.18em]">
											Featured listing
										</p>
										<p className="mt-2 font-semibold text-lg">
											{featuredListing.title}
										</p>
										<p className="mt-1 text-[#737373] text-sm">
											{featuredListing.listedLabel} · MLS #
											{featuredListing.mlsId}
										</p>
									</div>
									<MapPinned className="size-5 text-[#2E7D4F]" />
								</div>

								<div className="mt-5 flex flex-wrap gap-2">
									{featuredListing.badges.map((badge) => (
										<span
											className="rounded-full border border-[#E7E5E4] bg-white px-3 py-1 font-medium text-[#4A4A48] text-xs"
											key={badge.id}
										>
											{badge.label}
										</span>
									))}
								</div>

								<Button asChild className="mt-5 rounded-full">
									<Link
										params={{ listingid: featuredListing.id }}
										to="/demo/listings/$listingid"
									>
										Open detail page
										<ArrowRight className="ml-2 size-4" />
									</Link>
								</Button>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
