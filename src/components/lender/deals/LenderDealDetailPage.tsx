"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileText, Home, Percent, Wallet } from "lucide-react";
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

function formatCurrency(value: number | null | undefined) {
	if (typeof value !== "number") {
		return "Unavailable";
	}

	return new Intl.NumberFormat("en-CA", {
		currency: "CAD",
		maximumFractionDigits: 0,
		style: "currency",
	}).format(value);
}

function formatDate(value: number | null | undefined) {
	if (typeof value !== "number") {
		return "Unavailable";
	}

	return new Date(value).toLocaleDateString();
}

function formatEnumLabel(value: string | null | undefined) {
	if (!value) {
		return "Unavailable";
	}

	return value
		.split("_")
		.map((segment) =>
			segment.length > 0
				? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
				: segment
		)
		.join(" ");
}

type PortalDealDetail = FunctionReturnType<
	typeof api.deals.queries.getPortalDealDetail
>;
type DealDocumentListItem = NonNullable<
	NonNullable<PortalDealDetail>["documentInstances"]
>[number];

function groupAvailableDocuments(documents: DealDocumentListItem[]) {
	const availableDocuments = documents.filter(
		(document) => document.status === "available" && document.url
	);

	return {
		generatedReadOnly: availableDocuments.filter(
			(document) => document.class === "private_templated_non_signable"
		),
		privateStatic: availableDocuments.filter(
			(document) => document.class === "private_static"
		),
		signableReservedCount: documents.filter(
			(document) => document.class === "private_templated_signable"
		).length,
	};
}

interface LenderDealDetailPageProps {
	dealId: string;
}

export function LenderDealDetailPage({ dealId }: LenderDealDetailPageProps) {
	const detail = useQuery(api.deals.queries.getPortalDealDetail, {
		dealId: dealId as Id<"deals">,
	});

	if (detail === undefined) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center">
				<p className="text-muted-foreground text-sm">Loading deal package...</p>
			</div>
		);
	}

	if (detail === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
				<Card>
					<CardHeader>
						<CardTitle>Deal not found</CardTitle>
						<CardDescription>
							The requested deal package could not be loaded.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const groupedDocuments = groupAvailableDocuments(detail.documentInstances);

	return (
		<div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{detail.deal.status}</Badge>
					<Badge variant="secondary">
						{detail.documentPackage?.status ?? "No package yet"}
					</Badge>
					<Badge variant="secondary">{detail.mortgage.status}</Badge>
				</div>
				<div className="space-y-1">
					<h1 className="font-semibold text-3xl tracking-tight">
						Deal Package
					</h1>
					<p className="text-muted-foreground text-sm">
						Private deal-time docs materialized from the canonical mortgage
						blueprints for this closing.
					</p>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Principal</CardDescription>
						<CardTitle>{formatCurrency(detail.mortgage.principal)}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Interest Rate</CardDescription>
						<CardTitle className="flex items-center gap-2">
							<Percent className="size-4 text-muted-foreground" />
							{detail.mortgage.interestRate}%
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Payment Amount</CardDescription>
						<CardTitle className="flex items-center gap-2">
							<Wallet className="size-4 text-muted-foreground" />
							{formatCurrency(detail.mortgage.paymentAmount)}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardDescription>Closing Date</CardDescription>
						<CardTitle>{formatDate(detail.deal.closingDate)}</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
				<Card>
					<CardHeader>
						<CardTitle>Closing Snapshot</CardTitle>
						<CardDescription>
							Canonical deal, property, and participant context frozen alongside
							the package.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<SnapshotItem
							label="Fractional Share"
							value={`${detail.deal.fractionalShare} bps`}
						/>
						<SnapshotItem
							label="Payment Frequency"
							value={formatEnumLabel(detail.mortgage.paymentFrequency)}
						/>
						<SnapshotItem
							label="Maturity Date"
							value={detail.mortgage.maturityDate}
						/>
						<SnapshotItem label="Lender" value={detail.parties.lender.name} />
						<SnapshotItem label="Seller" value={detail.parties.seller.name} />
						<SnapshotItem
							label="Property"
							value={
								detail.property
									? `${detail.property.streetAddress}, ${detail.property.city}`
									: "Unavailable"
							}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Package Status</CardTitle>
						<CardDescription>
							Immutable package header for this locked deal.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<SnapshotItem
							label="Package Status"
							value={detail.documentPackage?.status ?? "Pending"}
						/>
						<SnapshotItem
							label="Retry Count"
							value={String(detail.documentPackage?.retryCount ?? 0)}
						/>
						<SnapshotItem
							label="Last Error"
							value={detail.documentPackage?.lastError ?? "None"}
						/>
						<SnapshotItem
							label="Ready At"
							value={formatDate(detail.documentPackage?.readyAt ?? null)}
						/>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Private Static Documents</CardTitle>
					<CardDescription>
						Uploaded private documents frozen into the deal package at lock
						time.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{groupedDocuments.privateStatic.length > 0 ? (
						groupedDocuments.privateStatic.map((document) => (
							<div
								className="rounded-lg border border-border/60 p-3"
								key={document.instanceId}
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="space-y-1">
										<p className="font-medium text-sm">
											{document.displayName}
										</p>
										<p className="text-muted-foreground text-xs">
											{document.packageLabel ?? "Deal package document"} •{" "}
											{formatEnumLabel(document.kind)}
										</p>
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
							No private static documents are available yet.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Generated Read-only Documents</CardTitle>
					<CardDescription>
						Non-signable templates materialized from the locked mortgage
						blueprints.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{groupedDocuments.generatedReadOnly.length > 0 ? (
						groupedDocuments.generatedReadOnly.map((document) => (
							<div
								className="rounded-lg border border-border/60 p-3"
								key={document.instanceId}
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="space-y-1">
										<p className="font-medium text-sm">
											{document.displayName}
										</p>
										<p className="text-muted-foreground text-xs">
											{document.packageLabel ?? "Deal package document"} •{" "}
											{formatEnumLabel(document.kind)}
										</p>
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
							No generated read-only documents are available yet.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Reserved Signable Documents</CardTitle>
					<CardDescription>
						Signable package members are reserved for the next signing phase and
						are not downloadable here yet.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">
						{groupedDocuments.signableReservedCount > 0
							? `${groupedDocuments.signableReservedCount} signable document placeholder${groupedDocuments.signableReservedCount === 1 ? "" : "s"} reserved for future activation.`
							: "No signable placeholders are reserved on this package."}
					</p>
				</CardContent>
			</Card>

			{detail.property ? (
				<Card>
					<CardHeader>
						<CardTitle>Property</CardTitle>
						<CardDescription>
							Canonical property context linked to the deal’s mortgage.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<SnapshotItem
							label="Address"
							value={`${detail.property.streetAddress}${detail.property.unit ? `, Unit ${detail.property.unit}` : ""}`}
						/>
						<SnapshotItem label="City" value={detail.property.city} />
						<SnapshotItem label="Province" value={detail.property.province} />
						<SnapshotItem
							label="Property Type"
							value={formatEnumLabel(detail.property.propertyType)}
						/>
					</CardContent>
				</Card>
			) : null}

			<div>
				<Button asChild type="button" variant="ghost">
					<Link to="/lender">
						<Home className="mr-2 size-4" />
						Back to lender workspace
					</Link>
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
