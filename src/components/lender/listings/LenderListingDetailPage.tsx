"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { FileText, MapPin, Percent, Wallet } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

function formatCurrency(value: number | undefined) {
	if (typeof value !== "number") {
		return "Unavailable";
	}

	return new Intl.NumberFormat("en-CA", {
		currency: "CAD",
		maximumFractionDigits: 0,
		style: "currency",
	}).format(value);
}

function formatPercent(value: number | undefined) {
	if (typeof value !== "number") {
		return "Unavailable";
	}

	return `${value}%`;
}

interface LenderListingDetailPageProps {
	listingId: string;
}

export function LenderListingDetailPage({
	listingId,
}: LenderListingDetailPageProps) {
	const detail = useQuery(api.listings.queries.getListingWithAvailability, {
		listingId: listingId as Id<"listings">,
	});
	const publicDocuments = useQuery(
		api.listings.publicDocuments.listForListing,
		{
			listingId: listingId as Id<"listings">,
		}
	);

	if (detail === undefined || publicDocuments === undefined) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center">
				<p className="text-muted-foreground text-sm">Loading listing...</p>
			</div>
		);
	}

	if (detail === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
				<Card>
					<CardHeader>
						<CardTitle>Listing not found</CardTitle>
						<CardDescription>
							The requested lender listing could not be loaded.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const { availability, listing } = detail;

	return (
		<div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{listing.status}</Badge>
					<Badge variant="secondary">{listing.loanType}</Badge>
					<Badge variant="secondary">{listing.propertyType}</Badge>
				</div>
				<div className="space-y-1">
					<h1 className="font-semibold text-3xl tracking-tight">
						{listing.title ?? "Mortgage Listing"}
					</h1>
					<p className="flex items-center gap-2 text-muted-foreground text-sm">
						<MapPin className="size-4" />
						{[listing.city, listing.province].filter(Boolean).join(", ")}
					</p>
				</div>
				{listing.description ? (
					<p className="max-w-3xl text-muted-foreground text-sm leading-6">
						{listing.description}
					</p>
				) : null}
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Principal</CardDescription>
						<CardTitle>{formatCurrency(listing.principal)}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Interest Rate</CardDescription>
						<CardTitle className="flex items-center gap-2">
							<Percent className="size-4 text-muted-foreground" />
							{formatPercent(listing.interestRate)}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Monthly Payment</CardDescription>
						<CardTitle className="flex items-center gap-2">
							<Wallet className="size-4 text-muted-foreground" />
							{formatCurrency(listing.monthlyPayment)}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Available Fractions</CardDescription>
						<CardTitle>
							{availability?.availableFractions ?? "Unavailable"}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
				<Card>
					<CardHeader>
						<CardTitle>Investment Snapshot</CardTitle>
						<CardDescription>
							Projected mortgage terms sourced from the canonical mortgage and
							listing projection.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<SnapshotItem label="LTV" value={formatPercent(listing.ltvRatio)} />
						<SnapshotItem
							label="Maturity Date"
							value={listing.maturityDate || "Unavailable"}
						/>
						<SnapshotItem
							label="Lien Position"
							value={String(listing.lienPosition)}
						/>
						<SnapshotItem
							label="Payment Frequency"
							value={listing.paymentFrequency.replace(/_/g, " ")}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Public Documents</CardTitle>
						<CardDescription>
							Only mortgage blueprints marked public are exposed here.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{publicDocuments.length > 0 ? (
							publicDocuments.map((document) => (
								<div
									className="rounded-lg border border-border/60 p-3"
									key={String(document.blueprintId)}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="space-y-1">
											<p className="font-medium text-sm">
												{document.displayName}
											</p>
											{document.description ? (
												<p className="text-muted-foreground text-xs">
													{document.description}
												</p>
											) : null}
										</div>
										<Button asChild size="sm" variant="outline">
											<a
												href={document.url ?? "#"}
												rel="noreferrer"
												target="_blank"
											>
												<FileText className="mr-2 size-4" />
												Open PDF
											</a>
										</Button>
									</div>
								</div>
							))
						) : (
							<p className="text-muted-foreground text-sm">
								No public documents are available for this listing.
							</p>
						)}
					</CardContent>
				</Card>
			</div>

			<div>
				<Button asChild type="button" variant="ghost">
					<Link to="/lender">Back to lender workspace</Link>
				</Button>
			</div>
		</div>
	);
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-border/60 p-3">
			<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
				{label}
			</p>
			<p className="mt-2 font-medium text-sm">{value}</p>
		</div>
	);
}
