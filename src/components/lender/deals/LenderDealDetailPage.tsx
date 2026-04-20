"use client";

import { Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileText, Home, Percent, Wallet } from "lucide-react";
import { toast } from "sonner";
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

function formatBadgeVariant(
	status: string | null | undefined
): "destructive" | "outline" | "secondary" {
	switch (status) {
		case "completed":
		case "signed":
		case "signature_partially_signed":
		case "signature_sent":
		case "sent":
		case "partially_signed":
			return "secondary";
		case "declined":
		case "voided":
		case "provider_error":
		case "signature_declined":
		case "signature_voided":
		case "generation_failed":
			return "destructive";
		default:
			return "outline";
	}
}

type PortalDealDetail = FunctionReturnType<
	typeof api.deals.queries.getPortalDealDetail
>;
type DealDocumentListItem = NonNullable<
	NonNullable<PortalDealDetail>["documentInstances"]
>[number];

function groupDocuments(documents: DealDocumentListItem[]) {
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
		signableDocuments: documents.filter(
			(document) => document.class === "private_templated_signable"
		),
	};
}

interface LenderDealDetailPageProps {
	dealId: string;
}

export function LenderDealDetailPage({ dealId }: LenderDealDetailPageProps) {
	const detail = useQuery(api.deals.queries.getPortalDealDetail, {
		dealId: dealId as Id<"deals">,
	});
	const createEmbeddedSigningSession = useAction(
		api.documents.signature.sessions.createEmbeddedSigningSession
	);
	const syncSignableDocumentEnvelope = useAction(
		api.documents.signature.webhooks.syncSignableDocumentEnvelope
	);

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

	const groupedDocuments = groupDocuments(detail.documentInstances);
	const resolvedDealId = detail.deal.dealId;

	async function syncEnvelope(args: {
		instanceId: Id<"dealDocumentInstances">;
		quiet?: boolean;
	}) {
		try {
			await syncSignableDocumentEnvelope({
				dealId: resolvedDealId,
				instanceId: args.instanceId,
			});
			if (!args.quiet) {
				toast.success("Signing status refreshed.");
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to refresh signing status."
			);
		}
	}

	function signingDialogId(instanceId: Id<"dealDocumentInstances">) {
		return `signing-dialog-${String(instanceId)}`;
	}

	function signingFrameId(instanceId: Id<"dealDocumentInstances">) {
		return `signing-frame-${String(instanceId)}`;
	}

	async function launchEmbeddedSigning(
		instanceId: Id<"dealDocumentInstances">
	) {
		try {
			const session = await createEmbeddedSigningSession({
				dealId: resolvedDealId,
				instanceId,
			});
			const frame = document.getElementById(
				signingFrameId(instanceId)
			) as HTMLIFrameElement | null;
			const dialog = document.getElementById(
				signingDialogId(instanceId)
			) as HTMLDialogElement | null;
			if (frame) {
				frame.src = session.url;
			}
			dialog?.showModal();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to launch embedded signing."
			);
		}
	}

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
					<CardTitle>Signable Documents</CardTitle>
					<CardDescription>
						Provider-backed envelopes, recipient routing, and embedded signing
						for lock-time signable package members.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{groupedDocuments.signableDocuments.length > 0 ? (
						groupedDocuments.signableDocuments.map((document) => (
							<div
								className="space-y-3 rounded-lg border border-border/60 p-3"
								key={document.instanceId}
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="space-y-2">
										<div className="space-y-1">
											<p className="font-medium text-sm">
												{document.displayName}
											</p>
											<p className="text-muted-foreground text-xs">
												{document.packageLabel ?? "Deal package document"} •{" "}
												{formatEnumLabel(document.status)}
											</p>
										</div>
										<div className="flex flex-wrap items-center gap-2">
											<Badge variant={formatBadgeVariant(document.status)}>
												{formatEnumLabel(document.status)}
											</Badge>
											{document.signing?.status ? (
												<Badge
													variant={formatBadgeVariant(document.signing.status)}
												>
													{formatEnumLabel(document.signing.status)}
												</Badge>
											) : null}
											{document.signing?.generatedDocumentSigningStatus ? (
												<Badge
													variant={formatBadgeVariant(
														document.signing.generatedDocumentSigningStatus
													)}
												>
													{formatEnumLabel(
														document.signing.generatedDocumentSigningStatus
													)}
												</Badge>
											) : null}
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										{document.signing?.canLaunchEmbeddedSigning ? (
											<Button
												onClick={() =>
													void launchEmbeddedSigning(document.instanceId)
												}
												size="sm"
												type="button"
											>
												Sign in portal
											</Button>
										) : null}
										{document.signing?.envelopeId ? (
											<Button
												onClick={() =>
													void syncEnvelope({ instanceId: document.instanceId })
												}
												size="sm"
												type="button"
												variant="outline"
											>
												Refresh status
											</Button>
										) : null}
									</div>
								</div>

								{document.signing?.recipients.length ? (
									<div className="flex flex-wrap gap-2">
										{document.signing.recipients.map((recipient) => (
											<div
												className="rounded-full border border-border/60 px-3 py-1 text-xs"
												key={`${document.instanceId}-${recipient.platformRole}`}
											>
												<span className="font-medium">{recipient.name}</span>
												<span className="text-muted-foreground">
													{" "}
													• {formatEnumLabel(recipient.status)}
												</span>
												{recipient.isCurrentViewer ? (
													<span className="text-muted-foreground"> • You</span>
												) : null}
											</div>
										))}
									</div>
								) : (
									<p className="text-muted-foreground text-sm">
										Recipient routing has not been resolved for this signable
										document yet.
									</p>
								)}

								<div className="grid gap-2 text-muted-foreground text-xs sm:grid-cols-2">
									<p>
										Last provider sync:{" "}
										{formatDate(document.signing?.lastProviderSyncAt ?? null)}
									</p>
									<p>
										Viewer signing access:{" "}
										{document.signing?.canLaunchEmbeddedSigning
											? "Available"
											: "Unavailable"}
									</p>
								</div>

								{document.signing?.lastError || document.lastError ? (
									<p className="text-destructive text-sm">
										{document.signing?.lastError ?? document.lastError}
									</p>
								) : null}

								<dialog
									className="max-h-[90vh] w-[min(1000px,calc(100%-2rem))] rounded-xl border border-border/70 bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
									id={signingDialogId(document.instanceId)}
									onClose={() => {
										const frame = window.document.getElementById(
											signingFrameId(document.instanceId)
										) as HTMLIFrameElement | null;
										if (frame) {
											frame.src = "about:blank";
										}
										void syncEnvelope({
											instanceId: document.instanceId,
											quiet: true,
										});
									}}
								>
									<div className="space-y-4 p-4">
										<div className="flex items-start justify-between gap-4">
											<div className="space-y-1">
												<h2 className="font-semibold text-lg">
													Embedded Signing
												</h2>
												<p className="text-muted-foreground text-sm">
													The signing session is issued by Convex and rendered
													inline here.
												</p>
											</div>
											<Button
												onClick={() => {
													const dialog = window.document.getElementById(
														signingDialogId(document.instanceId)
													) as HTMLDialogElement | null;
													dialog?.close();
												}}
												type="button"
												variant="outline"
											>
												Close
											</Button>
										</div>
										<iframe
											className="h-[70vh] w-full rounded-lg border border-border/60"
											id={signingFrameId(document.instanceId)}
											src="about:blank"
											title={`Embedded signing for ${document.displayName}`}
										/>
									</div>
								</dialog>
							</div>
						))
					) : (
						<p className="text-muted-foreground text-sm">
							No signable package documents are available yet.
						</p>
					)}
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
