"use client";

import { Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useCanDo } from "#/hooks/use-can-do";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import type { DetailSectionDefinition } from "./detail-sections";
import { SectionedRecordDetails } from "./detail-sections";

const HERO_IMAGE_SPLIT_RE = /\n+/;

function formatCurrency(value: bigint | number, divisor = 1) {
	const normalizedValue =
		typeof value === "bigint" ? Number(value) / divisor : value / divisor;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(normalizedValue);
}

function formatDate(value: number | string | null | undefined) {
	if (value == null) {
		return null;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return String(value);
	}

	return date.toLocaleDateString();
}

function formatDateTime(value: number | string | null | undefined) {
	if (value == null) {
		return null;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return String(value);
	}

	return date.toLocaleString();
}

function formatEnumLabel(value: string) {
	return value
		.split("_")
		.map((segment) =>
			segment.length > 0
				? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
				: segment
		)
		.join(" ");
}

function filterDetailFields(
	fields: readonly NormalizedFieldDefinition[],
	hiddenFieldNames: readonly string[]
) {
	const hidden = new Set(hiddenFieldNames);
	return fields.filter((field) => !hidden.has(field.name));
}

function DetailSectionShell({
	children,
	description,
	title,
}: {
	readonly children: ReactNode;
	readonly description?: string;
	readonly title: string;
}) {
	return (
		<section className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
			<div className="space-y-1">
				<h3 className="font-medium text-sm tracking-[0.02em]">{title}</h3>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{children}
		</section>
	);
}

function EmptyContext({ message }: { readonly message: string }) {
	return <p className="text-muted-foreground text-sm">{message}</p>;
}

function MetricGrid({
	items,
}: {
	readonly items: ReadonlyArray<{ label: string; value: ReactNode }>;
}) {
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{items.map((item) => (
				<div
					className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
					key={item.label}
				>
					<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
						{item.label}
					</p>
					<div className="mt-1 font-medium text-sm">{item.value}</div>
				</div>
			))}
		</div>
	);
}

function CompactList({
	emptyMessage,
	items,
	renderItem,
}: {
	readonly emptyMessage: string;
	readonly items: readonly unknown[];
	readonly renderItem: (item: unknown, index: number) => ReactNode;
}) {
	if (items.length === 0) {
		return <EmptyContext message={emptyMessage} />;
	}

	return <div className="space-y-2">{items.map(renderItem)}</div>;
}

const MORTGAGE_BASE_SECTIONS = [
	{
		title: "Summary",
		description: "Primary mortgage economics, parties, and lifecycle state.",
		fieldNames: [
			"principal",
			"propertySummary",
			"borrowerSummary",
			"interestRate",
			"loanType",
			"termMonths",
			"maturityDate",
			"lienPosition",
			"status",
			"paymentSummary",
		],
	},
] as const satisfies readonly DetailSectionDefinition[];

const OBLIGATION_BASE_SECTIONS = [
	{
		title: "Payment State",
		description: "Current payment posture and lifecycle markers.",
		fieldNames: [
			"paymentNumber",
			"type",
			"amount",
			"amountSettled",
			"paymentProgressSummary",
			"dueDate",
			"gracePeriodEnd",
			"settledAt",
			"status",
		],
	},
] as const satisfies readonly DetailSectionDefinition[];

const BORROWER_BASE_SECTIONS = [
	{
		title: "Verification",
		description: "Borrower identity and lifecycle state.",
		fieldNames: ["status", "idvStatus", "verificationSummary", "onboardedAt"],
	},
] as const satisfies readonly DetailSectionDefinition[];

function heroImagesToStorageIdText(
	heroImages: ReadonlyArray<{ storageId: Id<"_storage"> }> | undefined
) {
	return heroImages?.map((image) => String(image.storageId)).join("\n") ?? "";
}

function parseHeroImageStorageIds(value: string) {
	return value
		.split(HERO_IMAGE_SPLIT_RE)
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((storageId) => ({ storageId: storageId as Id<"_storage"> }));
}

function parseDisplayOrder(value: string) {
	if (!value.trim()) {
		return undefined;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function buildListingCurationFormState(listing: {
	adminNotes: string | null;
	description: string | null;
	displayOrder: number | null;
	featured: boolean;
	heroImages: Array<{ storageId: Id<"_storage"> }>;
	marketplaceCopy: string | null;
	seoSlug: string | null;
	title: string | null;
}) {
	return {
		adminNotes: listing.adminNotes ?? "",
		description: listing.description ?? "",
		displayOrder:
			typeof listing.displayOrder === "number"
				? String(listing.displayOrder)
				: "",
		featured: listing.featured,
		heroImages: heroImagesToStorageIdText(listing.heroImages),
		marketplaceCopy: listing.marketplaceCopy ?? "",
		seoSlug: listing.seoSlug ?? "",
		title: listing.title ?? "",
	};
}

export function ListingsDedicatedDetails({
	record,
}: {
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly record: UnifiedRecord;
}) {
	const listingId = record._id as Id<"listings">;
	const detailContext = useQuery(
		api.crm.detailContextQueries.getListingDetailContext,
		{
			listingId,
		}
	);
	const refreshProjection = useMutation(
		api.listings.projection.refreshListingProjection
	);
	const updateListingCuration = useMutation(
		api.listings.curation.updateListingCuration
	);
	const [isRefreshingProjection, setIsRefreshingProjection] = useState(false);
	const [isSavingCuration, setIsSavingCuration] = useState(false);
	const listing = detailContext?.listing;
	const [curationForm, setCurationForm] = useState(() =>
		buildListingCurationFormState({
			adminNotes: null,
			description: null,
			displayOrder: null,
			featured: false,
			heroImages: [],
			marketplaceCopy: null,
			seoSlug: null,
			title: null,
		})
	);

	useEffect(() => {
		if (!listing) {
			return;
		}

		setCurationForm(buildListingCurationFormState(listing));
	}, [listing]);

	async function handleRefreshProjection() {
		if (
			!detailContext?.listing ||
			detailContext.listing.dataSource !== "mortgage_pipeline"
		) {
			return;
		}

		setIsRefreshingProjection(true);
		try {
			await refreshProjection({ listingId });
			toast.success("Listing projection refreshed.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to refresh the listing projection."
			);
		} finally {
			setIsRefreshingProjection(false);
		}
	}

	async function handleSaveCuration() {
		setIsSavingCuration(true);
		try {
			await updateListingCuration({
				listingId,
				patch: {
					adminNotes: curationForm.adminNotes,
					description: curationForm.description,
					displayOrder: parseDisplayOrder(curationForm.displayOrder),
					featured: curationForm.featured,
					heroImages: parseHeroImageStorageIds(curationForm.heroImages),
					marketplaceCopy: curationForm.marketplaceCopy,
					seoSlug: curationForm.seoSlug,
					title: curationForm.title,
				},
			});
			toast.success("Curated listing fields saved.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to save listing curation."
			);
		} finally {
			setIsSavingCuration(false);
		}
	}

	return (
		<div className="space-y-6">
			<DetailSectionShell
				description="Mortgage-backed listings are projector-owned for economics, property facts, appraisal summary, and public document compatibility. Only curated marketplace fields are editable here."
				title="Projection Source"
			>
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">
							{detailContext?.listing?.status ?? "draft"}
						</Badge>
						<Badge variant="outline">
							{detailContext?.listing?.dataSource === "mortgage_pipeline"
								? "Mortgage-backed projection"
								: "Listing record"}
						</Badge>
					</div>
					<MetricGrid
						items={[
							{
								label: "Linked Mortgage",
								value: detailContext?.mortgage ? (
									<Link
										className="text-primary underline-offset-4 hover:underline"
										params={{
											recordid: String(detailContext.mortgage.mortgageId),
										}}
										search={EMPTY_ADMIN_DETAIL_SEARCH}
										to="/admin/mortgages/$recordid"
									>
										{String(detailContext.mortgage.mortgageId)}
									</Link>
								) : (
									"Not linked"
								),
							},
							{
								label: "Projection Refreshed",
								value:
									formatDateTime(detailContext?.listing?.updatedAt) ??
									"Unavailable",
							},
							{
								label: "Linked Property",
								value: detailContext?.property ? (
									<Link
										className="text-primary underline-offset-4 hover:underline"
										params={{
											recordid: String(detailContext.property.propertyId),
										}}
										search={EMPTY_ADMIN_DETAIL_SEARCH}
										to="/admin/properties/$recordid"
									>
										{detailContext.property.streetAddress}
									</Link>
								) : (
									"Unavailable"
								),
							},
							{
								label: "Location",
								value: detailContext?.property
									? `${detailContext.property.city}, ${detailContext.property.province}`
									: "Unavailable",
							},
							{
								label: "Draft Title",
								value:
									detailContext?.listing?.title ??
									`${String(listingId)} (untitled listing)`,
							},
						]}
					/>
					<div className="flex flex-wrap gap-3">
						<Button
							disabled={
								isRefreshingProjection ||
								detailContext?.listing?.dataSource !== "mortgage_pipeline"
							}
							onClick={() => void handleRefreshProjection()}
							type="button"
							variant="outline"
						>
							{isRefreshingProjection
								? "Refreshing projection"
								: "Refresh projection"}
						</Button>
					</div>
				</div>
			</DetailSectionShell>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
				<div className="space-y-6">
					<DetailSectionShell
						description="Canonical mortgage economics projected onto the listing. These values refresh from the mortgage aggregate."
						title="Economics"
					>
						<MetricGrid
							items={[
								{
									label: "Principal",
									value: detailContext?.mortgage
										? formatCurrency(detailContext.mortgage.principal)
										: "Unavailable",
								},
								{
									label: "Interest Rate",
									value:
										typeof detailContext?.mortgage?.interestRate === "number"
											? `${detailContext.mortgage.interestRate}%`
											: "Unavailable",
								},
								{
									label: "LTV",
									value:
										typeof record.fields.ltvRatio === "number"
											? `${record.fields.ltvRatio}%`
											: "Unavailable",
								},
								{
									label: "Payment Amount",
									value: detailContext?.mortgage
										? formatCurrency(detailContext.mortgage.paymentAmount)
										: "Unavailable",
								},
								{
									label: "Payment Cadence",
									value: detailContext?.mortgage?.paymentFrequency
										? formatEnumLabel(detailContext.mortgage.paymentFrequency)
										: "Unavailable",
								},
								{
									label: "Maturity",
									value:
										formatDate(detailContext?.mortgage?.maturityDate) ??
										"Unavailable",
								},
							]}
						/>
					</DetailSectionShell>

					<DetailSectionShell
						description="Property facts are projection-owned and refresh from the canonical property record."
						title="Property Facts"
					>
						<MetricGrid
							items={[
								{
									label: "Address",
									value: detailContext?.property
										? `${detailContext.property.streetAddress}${detailContext.property.unit ? `, Unit ${detailContext.property.unit}` : ""}`
										: "Unavailable",
								},
								{
									label: "City",
									value: detailContext?.property?.city ?? "Unavailable",
								},
								{
									label: "Province",
									value: detailContext?.property?.province ?? "Unavailable",
								},
								{
									label: "Postal Code",
									value: detailContext?.property?.postalCode ?? "Unavailable",
								},
								{
									label: "Property Type",
									value: detailContext?.property?.propertyType
										? formatEnumLabel(detailContext.property.propertyType)
										: "Unavailable",
								},
								{
									label: "Coordinates",
									value:
										detailContext?.property?.latitude != null &&
										detailContext.property.longitude != null
											? `${detailContext.property.latitude}, ${detailContext.property.longitude}`
											: "Unavailable",
								},
							]}
						/>
					</DetailSectionShell>

					<DetailSectionShell
						description="Appraisal summary always comes from the latest canonical valuation snapshot."
						title="Appraisal Summary"
					>
						<MetricGrid
							items={[
								{
									label: "As-Is Value",
									value: detailContext?.latestValuationSnapshot
										? formatCurrency(
												detailContext.latestValuationSnapshot.valueAsIs
											)
										: "Unavailable",
								},
								{
									label: "Valuation Date",
									value:
										detailContext?.latestValuationSnapshot?.valuationDate ??
										"Unavailable",
								},
								{
									label: "Source",
									value: detailContext?.latestValuationSnapshot?.source
										? formatEnumLabel(
												detailContext.latestValuationSnapshot.source
											)
										: "Unavailable",
								},
								{
									label: "Related Document Asset",
									value:
										detailContext?.latestValuationSnapshot
											?.relatedDocumentAssetId ?? "Not attached",
								},
							]}
						/>
					</DetailSectionShell>

					<DetailSectionShell
						description="Compatibility cache only. Mortgage-owned public blueprints remain the source of truth in later phases."
						title="Public Documents"
					>
						{detailContext?.publicDocuments?.length ? (
							<CompactList
								emptyMessage="No public origination docs projected yet."
								items={detailContext.publicDocuments}
								renderItem={(item) => {
									const document = item as NonNullable<
										typeof detailContext
									>["publicDocuments"][number];
									return (
										<div
											className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
											key={String(document.fileRef)}
										>
											<p className="font-medium text-sm">
												{document.name ?? String(document.fileRef)}
											</p>
											<p className="text-muted-foreground text-sm">
												Compatibility file ref {String(document.fileRef)}
											</p>
										</div>
									);
								}}
							/>
						) : (
							<EmptyContext message="No public origination docs projected yet." />
						)}
					</DetailSectionShell>
				</div>

				<DetailSectionShell
					description="These marketplace fields remain listing-owned. Saving here never edits projected economics, property facts, appraisal summary, or public document compatibility."
					title="Curated Fields"
				>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="listing-curation-title">Title</Label>
							<Input
								id="listing-curation-title"
								onChange={(event) =>
									setCurationForm((current) => ({
										...current,
										title: event.target.value,
									}))
								}
								value={curationForm.title}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="listing-curation-description">Description</Label>
							<Textarea
								id="listing-curation-description"
								onChange={(event) =>
									setCurationForm((current) => ({
										...current,
										description: event.target.value,
									}))
								}
								rows={4}
								value={curationForm.description}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="listing-curation-marketplace-copy">
								Marketplace copy
							</Label>
							<Textarea
								id="listing-curation-marketplace-copy"
								onChange={(event) =>
									setCurationForm((current) => ({
										...current,
										marketplaceCopy: event.target.value,
									}))
								}
								rows={5}
								value={curationForm.marketplaceCopy}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="listing-curation-hero-images">
								Hero image storage IDs
							</Label>
							<Textarea
								id="listing-curation-hero-images"
								onChange={(event) =>
									setCurationForm((current) => ({
										...current,
										heroImages: event.target.value,
									}))
								}
								placeholder="One _storage id per line"
								rows={4}
								value={curationForm.heroImages}
							/>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="listing-curation-display-order">
									Display order
								</Label>
								<Input
									id="listing-curation-display-order"
									onChange={(event) =>
										setCurationForm((current) => ({
											...current,
											displayOrder: event.target.value,
										}))
									}
									type="number"
									value={curationForm.displayOrder}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="listing-curation-seo-slug">SEO slug</Label>
								<Input
									id="listing-curation-seo-slug"
									onChange={(event) =>
										setCurationForm((current) => ({
											...current,
											seoSlug: event.target.value,
										}))
									}
									value={curationForm.seoSlug}
								/>
							</div>
						</div>
						<div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-3">
							<Checkbox
								checked={curationForm.featured}
								id="listing-curation-featured"
								onCheckedChange={(checked) =>
									setCurationForm((current) => ({
										...current,
										featured: checked === true,
									}))
								}
							/>
							<div className="space-y-1">
								<Label htmlFor="listing-curation-featured">
									Featured listing
								</Label>
								<p className="text-muted-foreground text-sm">
									Merchandising only. Projection refreshes preserve this flag.
								</p>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="listing-curation-admin-notes">Admin notes</Label>
							<Textarea
								id="listing-curation-admin-notes"
								onChange={(event) =>
									setCurationForm((current) => ({
										...current,
										adminNotes: event.target.value,
									}))
								}
								rows={4}
								value={curationForm.adminNotes}
							/>
						</div>
						<Button
							disabled={isSavingCuration}
							onClick={() => void handleSaveCuration()}
							type="button"
						>
							{isSavingCuration
								? "Saving curated fields"
								: "Save curated fields"}
						</Button>
					</div>
				</DetailSectionShell>
			</div>
		</div>
	);
}

export function MortgagesDedicatedDetails({
	fields,
	record,
}: {
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly record: UnifiedRecord;
}) {
	const mortgageId = record._id as Id<"mortgages">;
	const canManagePaymentOperations = useCanDo("payment:manage");
	const detailContext = useQuery(
		api.crm.detailContextQueries.getMortgageDetailContext,
		{
			mortgageId,
		}
	);
	const retryCollectionsActivation = useAction(
		api.admin.origination.collections.retryCollectionsActivation
	);
	const mortgageHistory = useQuery(api.ledger.queries.getMortgageHistory, {
		mortgageId: record._id,
		limit: 6,
	});
	const detailFields = filterDetailFields(fields, ["propertyId"]);
	const paymentSetup = detailContext?.paymentSetup;
	const canRetryCollectionsActivation = Boolean(
		canManagePaymentOperations &&
			paymentSetup?.activationStatus === "failed" &&
			paymentSetup.originationCaseId &&
			paymentSetup.activationSelectedBankAccountId
	);

	async function handleRetryCollectionsActivation() {
		const caseId = detailContext?.paymentSetup?.originationCaseId;
		if (!caseId) {
			return;
		}

		try {
			const result = await retryCollectionsActivation({ caseId });
			if (result.status === "failed") {
				toast.error(result.message);
				return;
			}
			toast.success("Provider-managed activation retried.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to retry provider-managed activation."
			);
		}
	}

	return (
		<div className="space-y-6">
			<SectionedRecordDetails
				fields={detailFields}
				highlightFieldNames={[
					"propertySummary",
					"principal",
					"borrowerSummary",
					"paymentSummary",
				]}
				record={record}
				sections={MORTGAGE_BASE_SECTIONS}
			/>

			<DetailSectionShell
				description="Canonical borrower relationships attached to this mortgage."
				title="Borrowers"
			>
				<div className="space-y-4">
					<CompactList
						emptyMessage="No borrower links found."
						items={detailContext?.borrowers ?? []}
						renderItem={(item) => {
							const borrower = item as NonNullable<
								typeof detailContext
							>["borrowers"][number];
							return (
								<div
									className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
									key={String(borrower.borrowerId)}
								>
									<Link
										className="font-medium text-primary text-sm underline-offset-4 hover:underline"
										params={{
											recordid: String(borrower.borrowerId),
										}}
										search={EMPTY_ADMIN_DETAIL_SEARCH}
										to="/admin/borrowers/$recordid"
									>
										{borrower.name}
									</Link>
									<p className="text-muted-foreground text-sm">
										{borrower.role} • {borrower.status}
										{borrower.idvStatus ? ` • ${borrower.idvStatus}` : ""}
									</p>
								</div>
							);
						}}
					/>
				</div>
			</DetailSectionShell>

			<DetailSectionShell
				description="Canonical payment bootstrap generated during origination. Provider-managed-now cases keep this mortgage committed while the follow-up Rotessa activation moves through pending, activating, active, or failed states."
				title="Payment Setup"
			>
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">
							{paymentSetup?.activationStatus
								? formatEnumLabel(paymentSetup.activationStatus)
								: "App-owned only"}
						</Badge>
						{paymentSetup?.externalSchedule ? (
							<Badge variant="outline">
								{formatEnumLabel(paymentSetup.externalSchedule.status)}
							</Badge>
						) : null}
					</div>
					{paymentSetup?.activationStatus === "failed" ? (
						<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm">
							<p className="font-medium text-destructive">
								Immediate Rotessa activation failed
							</p>
							<p className="mt-2 text-destructive/90 leading-6">
								{paymentSetup.activationLastError ??
									"Provider-managed activation failed after the mortgage committed."}
							</p>
							<div className="mt-3 flex flex-wrap gap-3">
								<Button
									disabled={!canRetryCollectionsActivation}
									onClick={() => void handleRetryCollectionsActivation()}
									type="button"
									variant="outline"
								>
									Retry activation
								</Button>
								{paymentSetup.activationSelectedBankAccountId ? null : (
									<p className="text-muted-foreground text-xs">
										Retry stays disabled until a primary borrower bank account
										is staged on the committed origination case.
									</p>
								)}
							</div>
						</div>
					) : null}
					{paymentSetup?.activationStatus === "activating" ? (
						<div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-4 text-sm">
							<p className="font-medium text-sky-900">
								Immediate Rotessa activation is in progress
							</p>
							<p className="mt-2 text-sky-950/90 leading-6">
								The mortgage is already committed. FairLend is finishing the
								provider-managed schedule handoff now.
							</p>
						</div>
					) : null}
					<MetricGrid
						items={[
							{
								label: "Activation Status",
								value: paymentSetup?.activationStatus
									? formatEnumLabel(paymentSetup.activationStatus)
									: "App-owned only",
							},
							{
								label: "Execution Mode",
								value: detailContext?.paymentSetup?.collectionExecutionMode
									? formatEnumLabel(
											detailContext.paymentSetup.collectionExecutionMode
										)
									: "Unavailable",
							},
							{
								label: "Provider",
								value: detailContext?.paymentSetup
									?.collectionExecutionProviderCode
									? formatEnumLabel(
											detailContext.paymentSetup.collectionExecutionProviderCode
										)
									: "App-owned only",
							},
							{
								label: "Last Attempt",
								value:
									formatDateTime(paymentSetup?.activationLastAttemptAt) ??
									"Not attempted",
							},
							{
								label: "Retry Count",
								value: paymentSetup?.activationRetryCount ?? 0,
							},
							{
								label: "Obligations",
								value:
									detailContext?.paymentSetup?.obligationCount ?? "Unavailable",
							},
							{
								label: "Plan Entries",
								value:
									detailContext?.paymentSetup?.collectionPlanEntryCount ??
									"Unavailable",
							},
							{
								label: "Collection Attempts",
								value:
									detailContext?.paymentSetup?.collectionAttemptCount ??
									"Unavailable",
							},
							{
								label: "Transfer Requests",
								value:
									detailContext?.paymentSetup?.transferRequestCount ??
									"Unavailable",
							},
							{
								label: "Property",
								value: detailContext?.property ? (
									<div className="space-y-1">
										<div>{`${detailContext.property.streetAddress}, ${detailContext.property.city}, ${detailContext.property.province}`}</div>
										<Link
											className="text-primary text-xs underline-offset-4 hover:underline"
											params={{
												recordid: String(detailContext.property.propertyId),
											}}
											search={EMPTY_ADMIN_DETAIL_SEARCH}
											to="/admin/properties/$recordid"
										>
											Open property record
										</Link>
									</div>
								) : (
									"No property context"
								),
							},
							{
								label: "Selected Bank Account",
								value: paymentSetup?.activationSelectedBankAccountId
									? String(paymentSetup.activationSelectedBankAccountId)
									: "Not staged",
							},
							{
								label: "Postal Code",
								value: detailContext?.property?.postalCode ?? "Unavailable",
							},
							{
								label: "Type",
								value: detailContext?.property?.propertyType ?? "Unavailable",
							},
						]}
					/>
					{paymentSetup?.externalSchedule ? (
						<div className="rounded-lg border border-border/60 bg-background/80 px-4 py-4">
							<div className="flex flex-wrap items-center gap-2">
								<p className="font-medium text-sm">
									External schedule{" "}
									{String(paymentSetup.externalSchedule.scheduleId)}
								</p>
								<Badge variant="outline">
									{formatEnumLabel(paymentSetup.externalSchedule.status)}
								</Badge>
							</div>
							<div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
										Provider Ref
									</p>
									<p className="mt-1 text-sm">
										{paymentSetup.externalSchedule.externalScheduleRef ??
											"Unavailable"}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
										Activated
									</p>
									<p className="mt-1 text-sm">
										{formatDateTime(
											paymentSetup.externalSchedule.activatedAt
										) ?? "Unavailable"}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
										Next Poll
									</p>
									<p className="mt-1 text-sm">
										{formatDateTime(paymentSetup.externalSchedule.nextPollAt) ??
											"Unavailable"}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
										Last Sync Error
									</p>
									<p className="mt-1 text-sm">
										{paymentSetup.externalSchedule.lastSyncErrorMessage ??
											"None"}
									</p>
								</div>
							</div>
						</div>
					) : null}
					{detailContext?.paymentSetup?.scheduleRuleMissing ? (
						<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm">
							<p className="font-medium text-amber-900">
								Schedule rule fallback applied
							</p>
							<p className="mt-2 text-amber-950/90 leading-6">
								No active collection schedule rule matched this mortgage at
								bootstrap time. FairLend still created the initial app-owned
								plan entries using the default scheduling delay.
							</p>
						</div>
					) : null}
					<div className="space-y-2">
						<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
							Obligations
						</p>
						{detailContext?.paymentSetup?.obligations?.length ? (
							<div className="overflow-x-auto rounded-lg border border-border/60 bg-background/80">
								<table className="min-w-full text-left text-sm">
									<thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-[0.08em]">
										<tr>
											<th className="px-3 py-2 font-medium">Payment #</th>
											<th className="px-3 py-2 font-medium">Type</th>
											<th className="px-3 py-2 font-medium">Status</th>
											<th className="px-3 py-2 font-medium">Due Date</th>
											<th className="px-3 py-2 font-medium">Amount</th>
										</tr>
									</thead>
									<tbody>
										{detailContext.paymentSetup.obligations.map(
											(obligation) => (
												<tr
													className="border-border/50 border-t"
													key={String(obligation.obligationId)}
												>
													<td className="px-3 py-2 align-top">
														<div className="space-y-1">
															<div>{obligation.paymentNumber}</div>
															<Link
																className="text-primary text-xs underline-offset-4 hover:underline"
																params={{
																	recordid: String(obligation.obligationId),
																}}
																search={EMPTY_ADMIN_DETAIL_SEARCH}
																to="/admin/obligations/$recordid"
															>
																Open obligation
															</Link>
														</div>
													</td>
													<td className="px-3 py-2 align-top">
														{formatEnumLabel(obligation.type)}
													</td>
													<td className="px-3 py-2 align-top">
														<Badge variant="outline">
															{formatEnumLabel(obligation.status)}
														</Badge>
													</td>
													<td className="px-3 py-2 align-top">
														{formatDate(obligation.dueDate) ?? "Unavailable"}
													</td>
													<td className="px-3 py-2 align-top">
														<div>{formatCurrency(obligation.amount, 100)}</div>
														<p className="text-muted-foreground text-xs">
															Settled{" "}
															{formatCurrency(obligation.amountSettled, 100)}
														</p>
													</td>
												</tr>
											)
										)}
									</tbody>
								</table>
							</div>
						) : (
							<EmptyContext message="No obligations found for this mortgage." />
						)}
					</div>
					<div className="space-y-2">
						<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
							Collection Plan Entries
						</p>
						{detailContext?.paymentSetup?.collectionPlanEntries?.length ? (
							<div className="overflow-x-auto rounded-lg border border-border/60 bg-background/80">
								<table className="min-w-full text-left text-sm">
									<thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-[0.08em]">
										<tr>
											<th className="px-3 py-2 font-medium">Plan Entry</th>
											<th className="px-3 py-2 font-medium">Status</th>
											<th className="px-3 py-2 font-medium">Execution</th>
											<th className="px-3 py-2 font-medium">Scheduled</th>
											<th className="px-3 py-2 font-medium">Amount</th>
											<th className="px-3 py-2 font-medium">Coverage</th>
										</tr>
									</thead>
									<tbody>
										{detailContext.paymentSetup.collectionPlanEntries.map(
											(entry) => (
												<tr
													className="border-border/50 border-t"
													key={String(entry.planEntryId)}
												>
													<td className="px-3 py-2 align-top">
														<div className="space-y-1">
															<div>{String(entry.planEntryId)}</div>
															<p className="text-muted-foreground text-xs">
																{formatEnumLabel(entry.source)}
															</p>
														</div>
													</td>
													<td className="px-3 py-2 align-top">
														<Badge variant="outline">
															{formatEnumLabel(entry.status)}
														</Badge>
													</td>
													<td className="px-3 py-2 align-top">
														{entry.executionMode
															? formatEnumLabel(entry.executionMode)
															: "Unavailable"}
													</td>
													<td className="px-3 py-2 align-top">
														{formatDate(entry.scheduledDate) ?? "Unavailable"}
													</td>
													<td className="px-3 py-2 align-top">
														<div>{formatCurrency(entry.amount, 100)}</div>
														<p className="text-muted-foreground text-xs">
															{formatEnumLabel(entry.method)}
														</p>
													</td>
													<td className="px-3 py-2 align-top">
														{entry.obligationIds.length} obligation
														{entry.obligationIds.length === 1 ? "" : "s"}
													</td>
												</tr>
											)
										)}
									</tbody>
								</table>
							</div>
						) : (
							<EmptyContext message="No collection plan entries found for this mortgage." />
						)}
					</div>
				</div>
			</DetailSectionShell>

			<DetailSectionShell
				description="Listing projection and latest canonical valuation snapshot for this mortgage."
				title="Listing Projection"
			>
				<div className="space-y-4">
					{detailContext?.listing ? (
						<div className="rounded-lg border border-border/60 bg-background/80 px-4 py-4">
							<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div className="space-y-2">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="outline">
											{detailContext.listing.status}
										</Badge>
										<Badge variant="outline">
											{detailContext.listing.dataSource === "mortgage_pipeline"
												? "Mortgage-backed projection"
												: "Listing"}
										</Badge>
									</div>
									<p className="font-medium text-sm">
										{detailContext.listing.title ??
											`${detailContext.listing.status} listing`}
									</p>
									<p className="text-muted-foreground text-sm">
										Economics and property fields refresh from canonical
										mortgage, property, and valuation records.
									</p>
								</div>
								<Button asChild type="button" variant="outline">
									<Link
										params={{
											recordid: String(detailContext.listing.listingId),
										}}
										search={EMPTY_ADMIN_DETAIL_SEARCH}
										to="/admin/listings/$recordid"
									>
										Open listing
									</Link>
								</Button>
							</div>
						</div>
					) : null}
					<MetricGrid
						items={[
							{
								label: "Listing",
								value: detailContext?.listing ? (
									<Link
										className="text-primary underline-offset-4 hover:underline"
										params={{
											recordid: String(detailContext.listing.listingId),
										}}
										search={EMPTY_ADMIN_DETAIL_SEARCH}
										to="/admin/listings/$recordid"
									>
										{detailContext.listing.title ??
											`${detailContext.listing.status} listing`}
									</Link>
								) : (
									"No active listing"
								),
							},
							{
								label: "Listing Status",
								value: detailContext?.listing?.status ?? "Not projected",
							},
							{
								label: "Projection Refreshed",
								value:
									formatDateTime(detailContext?.listing?.updatedAt) ??
									"Unavailable",
							},
							{
								label: "Projected LTV",
								value:
									typeof detailContext?.listing?.ltvRatio === "number"
										? `${detailContext.listing.ltvRatio}%`
										: "Unavailable",
							},
							{
								label: "Valuation",
								value: detailContext?.latestValuationSnapshot
									? formatCurrency(
											detailContext.latestValuationSnapshot.valueAsIs
										)
									: "No valuation snapshot",
							},
							{
								label: "Valuation Date",
								value:
									detailContext?.latestValuationSnapshot?.valuationDate ??
									"Unavailable",
							},
							{
								label: "Source",
								value: detailContext?.latestValuationSnapshot?.source
									? formatEnumLabel(
											detailContext.latestValuationSnapshot.source
										)
									: "Unavailable",
							},
							{
								label: "Document Asset",
								value:
									detailContext?.latestValuationSnapshot
										?.relatedDocumentAssetId ?? "Not attached",
							},
						]}
					/>
				</div>
			</DetailSectionShell>

			<DetailSectionShell
				description="Reserved anchor for later-phase document package and signing projections."
				title="Documents"
			>
				<EmptyContext message="Document package projection has not landed yet. Later phases will attach public and private origination artifacts here without redesigning this page." />
			</DetailSectionShell>

			<DetailSectionShell
				description="Recent journal and audit evidence tied to this mortgage."
				title="Audit"
			>
				<CompactList
					emptyMessage="No recent audit or journal activity was found."
					items={[
						...(detailContext?.recentAuditEvents ?? []),
						...(mortgageHistory ?? []).map((entry) => ({
							eventId: String(entry._id),
							eventType: entry.entryType,
							outcome: "journal",
							previousState: "",
							newState: "",
							timestamp: entry.timestamp,
						})),
					]
						.sort((left, right) => right.timestamp - left.timestamp)
						.slice(0, 8)}
					renderItem={(item, index) => {
						const event = item as {
							eventId: string;
							eventType: string;
							outcome: string;
							previousState: string;
							newState: string;
							timestamp: number;
						};
						return (
							<div
								className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
								key={`${event.eventId}-${String(index)}`}
							>
								<p className="font-medium text-sm">{event.eventType}</p>
								<p className="text-muted-foreground text-sm">
									{new Date(event.timestamp).toLocaleString()}
									{event.outcome ? ` • ${event.outcome}` : ""}
									{event.previousState && event.newState
										? ` • ${event.previousState} -> ${event.newState}`
										: ""}
								</p>
							</div>
						);
					}}
				/>
			</DetailSectionShell>
		</div>
	);
}

export function ObligationsDedicatedDetails({
	fields,
	record,
}: {
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly record: UnifiedRecord;
}) {
	const obligationId = record._id as Id<"obligations">;
	const detailContext = useQuery(
		api.crm.detailContextQueries.getObligationDetailContext,
		{
			obligationId,
		}
	);
	const obligationBalance = useQuery(
		api.payments.cashLedger.queries.getObligationBalance,
		{
			obligationId,
		}
	);
	const history = useQuery(
		api.payments.cashLedger.queries.getObligationHistory,
		{
			obligationId,
		}
	);
	const detailFields = filterDetailFields(fields, ["mortgageId", "borrowerId"]);

	return (
		<div className="space-y-6">
			<SectionedRecordDetails
				fields={detailFields}
				highlightFieldNames={[
					"mortgageSummary",
					"borrowerSummary",
					"amount",
					"paymentProgressSummary",
				]}
				record={record}
				sections={OBLIGATION_BASE_SECTIONS}
			/>

			<DetailSectionShell
				description="Balance, corrective obligations, and counterparties for this payment obligation."
				title="Settlement Context"
			>
				<div className="space-y-4">
					{obligationBalance ? (
						<MetricGrid
							items={[
								{
									label: "Outstanding",
									value: formatCurrency(
										obligationBalance.outstandingBalance,
										100
									),
								},
								{
									label: "Projected Settled",
									value: formatCurrency(
										obligationBalance.projectedSettledAmount,
										100
									),
								},
								{
									label: "Journal Settled",
									value: formatCurrency(
										obligationBalance.journalSettledAmount,
										100
									),
								},
							]}
						/>
					) : null}
					{detailContext ? (
						<MetricGrid
							items={[
								{
									label: "Mortgage",
									value:
										detailContext.mortgage.property?.streetAddress ??
										"Mortgage context loaded",
								},
								{
									label: "Borrower",
									value: detailContext.borrower.name,
								},
								{
									label: "Borrower Email",
									value: detailContext.borrower.email ?? "Unavailable",
								},
							]}
						/>
					) : null}
					<div>
						<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.08em]">
							Corrective Obligations
						</p>
						<CompactList
							emptyMessage="No corrective obligations are linked to this payment."
							items={detailContext?.correctiveObligations ?? []}
							renderItem={(item) => {
								const corrective = item as NonNullable<
									typeof detailContext
								>["correctiveObligations"][number];
								return (
									<div
										className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-3"
										key={String(corrective.obligationId)}
									>
										<div>
											<p className="font-medium text-sm">{corrective.type}</p>
											<p className="text-muted-foreground text-sm">
												{corrective.status} • {formatDate(corrective.dueDate)}
											</p>
										</div>
										<Badge variant="outline">
											{formatCurrency(corrective.amount, 100)}
										</Badge>
									</div>
								);
							}}
						/>
					</div>
				</div>
			</DetailSectionShell>

			<DetailSectionShell
				description="Recent balance-affecting entries and obligation-specific audit events."
				title="Recent Activity"
			>
				<CompactList
					emptyMessage="No recent activity is available for this obligation."
					items={[
						...(detailContext?.recentAuditEvents ?? []).map((event) => ({
							id: event.eventId,
							title: event.eventType,
							subtitle: `${event.outcome} • ${new Date(event.timestamp).toLocaleString()}`,
						})),
						...(history ?? []).map((entry) => ({
							id: String(entry._id),
							title: entry.entryType,
							subtitle: `${new Date(entry.timestamp).toLocaleString()} • ${formatCurrency(entry.amount, 100)}`,
						})),
					].slice(0, 8)}
					renderItem={(item, index) => {
						const activity = item as {
							id: string;
							title: string;
							subtitle: string;
						};
						return (
							<div
								className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
								key={`${activity.id}-${String(index)}`}
							>
								<p className="font-medium text-sm">{activity.title}</p>
								<p className="text-muted-foreground text-sm">
									{activity.subtitle}
								</p>
							</div>
						);
					}}
				/>
			</DetailSectionShell>
		</div>
	);
}

export function BorrowersDedicatedDetails({
	fields,
	record,
}: {
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly record: UnifiedRecord;
}) {
	const borrowerId = record._id as Id<"borrowers">;
	const detailContext = useQuery(
		api.crm.detailContextQueries.getBorrowerDetailContext,
		{
			borrowerId,
		}
	);
	const borrowerBalance = useQuery(
		api.payments.cashLedger.queries.getBorrowerBalance,
		{
			borrowerId,
		}
	);
	const detailFields = filterDetailFields(fields, ["userId"]);

	return (
		<div className="space-y-6">
			<SectionedRecordDetails
				fields={detailFields}
				highlightFieldNames={[
					"borrowerName",
					"status",
					"idvStatus",
					"verificationSummary",
				]}
				record={record}
				sections={BORROWER_BASE_SECTIONS}
			/>

			<DetailSectionShell
				description="Profile, mortgage participation, and receivable context for the borrower."
				title="Portfolio Context"
			>
				<div className="space-y-4">
					{detailContext?.profile ? (
						<MetricGrid
							items={[
								{
									label: "Email",
									value: detailContext.profile.email ?? "Unavailable",
								},
								{
									label: "Onboarded",
									value:
										formatDate(detailContext.profile.onboardedAt) ?? "Not set",
								},
								{
									label: "Outstanding Receivable",
									value: borrowerBalance
										? formatCurrency(borrowerBalance.total, 100)
										: "Loading",
								},
							]}
						/>
					) : null}
					<div>
						<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.08em]">
							Linked Mortgages
						</p>
						<CompactList
							emptyMessage="No mortgage participation was found."
							items={detailContext?.mortgages ?? []}
							renderItem={(item) => {
								const mortgage = item as NonNullable<
									typeof detailContext
								>["mortgages"][number];
								return (
									<div
										className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
										key={String(mortgage.mortgageId)}
									>
										<p className="font-medium text-sm">
											{mortgage.property?.streetAddress ??
												`Mortgage ${String(mortgage.mortgageId)}`}
										</p>
										<p className="text-muted-foreground text-sm">
											{mortgage.role} • {mortgage.status} •{" "}
											{formatCurrency(mortgage.principal)}
											{mortgage.listing
												? ` • ${mortgage.listing.status} listing`
												: ""}
										</p>
									</div>
								);
							}}
						/>
					</div>
				</div>
			</DetailSectionShell>

			<DetailSectionShell
				description="Recent borrower audit events from the state machine journal."
				title="Recent Audit Events"
			>
				<CompactList
					emptyMessage="No recent borrower audit events were found."
					items={detailContext?.recentAuditEvents ?? []}
					renderItem={(item) => {
						const event = item as NonNullable<
							typeof detailContext
						>["recentAuditEvents"][number];
						return (
							<div
								className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
								key={event.eventId}
							>
								<p className="font-medium text-sm">{event.eventType}</p>
								<p className="text-muted-foreground text-sm">
									{new Date(event.timestamp).toLocaleString()} • {event.outcome}
									{event.previousState && event.newState
										? ` • ${event.previousState} -> ${event.newState}`
										: ""}
								</p>
							</div>
						);
					}}
				/>
			</DetailSectionShell>
		</div>
	);
}
