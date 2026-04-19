"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import type { DetailSectionDefinition } from "./detail-sections";
import { SectionedRecordDetails } from "./detail-sections";

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

const LISTING_BASE_SECTIONS = [
	{
		title: "Marketplace",
		description: "Publication and merchandising state for the listing.",
		fieldNames: ["status", "publishedAt", "featured"],
	},
	{
		title: "Economics",
		description: "Listing economics and mortgage-derived pricing inputs.",
		fieldNames: [
			"principal",
			"interestRate",
			"ltvRatio",
			"monthlyPayment",
			"loanType",
			"lienPosition",
			"termMonths",
			"maturityDate",
			"latestAppraisalValueAsIs",
			"latestAppraisalDate",
		],
	},
] as const satisfies readonly DetailSectionDefinition[];

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

export function ListingsDedicatedDetails({
	fields,
	record,
}: {
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly record: UnifiedRecord;
}) {
	const listingId = record._id as Id<"listings">;
	const listingWithAvailability = useQuery(
		api.listings.queries.getListingWithAvailability,
		{
			listingId,
		}
	);
	const propertyId = listingWithAvailability?.listing.propertyId;
	const mortgageId = listingWithAvailability?.listing.mortgageId;
	const appraisals = useQuery(
		api.listings.queries.getListingAppraisals,
		propertyId ? { propertyId } : "skip"
	);
	const encumbrances = useQuery(
		api.listings.queries.getListingEncumbrances,
		propertyId ? { propertyId } : "skip"
	);
	const history = useQuery(
		api.listings.queries.getListingTransactionHistory,
		mortgageId ? { mortgageId } : "skip"
	);
	const detailFields = filterDetailFields(fields, ["mortgageId", "propertyId"]);

	return (
		<div className="space-y-6">
			<SectionedRecordDetails
				fields={detailFields}
				highlightFieldNames={[
					"title",
					"propertySummary",
					"principal",
					"interestRate",
					"ltvRatio",
				]}
				record={record}
				sections={LISTING_BASE_SECTIONS}
			/>

			<DetailSectionShell
				description="Live marketplace availability and document posture from the listing domain surface."
				title="Availability"
			>
				{listingWithAvailability?.availability ? (
					<MetricGrid
						items={[
							{
								label: "Available Fractions",
								value: listingWithAvailability.availability.availableFractions,
							},
							{
								label: "Total Fractions",
								value: listingWithAvailability.availability.totalFractions,
							},
							{
								label: "Sold",
								value: `${listingWithAvailability.availability.percentageSold}%`,
							},
							{
								label: "Investors",
								value: listingWithAvailability.availability.totalInvestors,
							},
							{
								label: "MIC Position",
								value: listingWithAvailability.availability.micPosition
									.hasPosition
									? listingWithAvailability.availability.micPosition.balance
									: "No",
							},
							{
								label: "Public Documents",
								value: listingWithAvailability.listing.publicDocumentIds.length,
							},
						]}
					/>
				) : (
					<EmptyContext message="No live availability is attached to this listing yet." />
				)}
			</DetailSectionShell>

			<DetailSectionShell
				description="Appraisal and prior-encumbrance context reusing existing listing queries."
				title="Property Context"
			>
				<div className="space-y-4">
					<div>
						<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.08em]">
							Appraisals
						</p>
						<CompactList
							emptyMessage="No appraisal records found."
							items={appraisals ?? []}
							renderItem={(item) => {
								const appraisal = item as NonNullable<
									typeof appraisals
								>[number];
								return (
									<div
										className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
										key={String(appraisal._id)}
									>
										<p className="font-medium text-sm">
											{formatCurrency(appraisal.appraisedValue)}
										</p>
										<p className="text-muted-foreground text-sm">
											{appraisal.appraiserName} • {appraisal.effectiveDate}
										</p>
									</div>
								);
							}}
						/>
					</div>
					<div>
						<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.08em]">
							Prior Encumbrances
						</p>
						<CompactList
							emptyMessage="No prior encumbrances found."
							items={encumbrances ?? []}
							renderItem={(item) => {
								const encumbrance = item as NonNullable<
									typeof encumbrances
								>[number];
								return (
									<div
										className="rounded-lg border border-border/60 bg-background/80 px-3 py-3"
										key={String(encumbrance._id)}
									>
										<p className="font-medium text-sm">{encumbrance.holder}</p>
										<p className="text-muted-foreground text-sm">
											Priority {encumbrance.priority}
											{typeof encumbrance.outstandingBalance === "number"
												? ` • ${formatCurrency(encumbrance.outstandingBalance)}`
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
				description="Recent ledger transaction activity tied back to the mortgage-backed listing."
				title="Transaction History"
			>
				<CompactList
					emptyMessage="No listing transaction history is available."
					items={(history ?? []).slice(0, 6)}
					renderItem={(item) => {
						const entry = item as NonNullable<typeof history>[number];
						return (
							<div
								className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-3"
								key={String(entry._id)}
							>
								<div>
									<p className="font-medium text-sm">{entry.eventType}</p>
									<p className="text-muted-foreground text-sm">
										{entry.effectiveDate}
									</p>
								</div>
								<Badge variant="outline">
									{formatCurrency(entry.amount, 100)}
								</Badge>
							</div>
						);
					}}
				/>
			</DetailSectionShell>
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
	const detailContext = useQuery(
		api.crm.detailContextQueries.getMortgageDetailContext,
		{
			mortgageId,
		}
	);
	const cashState = useQuery(
		api.payments.cashLedger.queries.getMortgageCashState,
		{
			mortgageId,
		}
	);
	const collectionSummary = useQuery(
		api.payments.collectionPlan.admin.getMortgageCollectionOperationsSummary,
		{
			mortgageId,
		}
	);
	const mortgageHistory = useQuery(api.ledger.queries.getMortgageHistory, {
		mortgageId: record._id,
		limit: 6,
	});
	const detailFields = filterDetailFields(fields, ["propertyId"]);

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
				description="Current servicing setup, cash posture, and next collection signals."
				title="Payment Setup"
			>
				<div className="space-y-4">
					<MetricGrid
						items={[
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
								label: "Postal Code",
								value: detailContext?.property?.postalCode ?? "Unavailable",
							},
							{
								label: "Type",
								value: detailContext?.property?.propertyType ?? "Unavailable",
							},
						]}
					/>
					{cashState ? (
						<MetricGrid
							items={Object.entries(cashState.balancesByFamily)
								.slice(0, 6)
								.map(([family, balance]) => ({
									label: family,
									value: formatCurrency(balance, 100),
								}))}
						/>
					) : null}
					{collectionSummary ? (
						<MetricGrid
							items={[
								{ label: "Rules", value: collectionSummary.ruleCount },
								{
									label: "Recent Attempts",
									value: collectionSummary.recentAttempts.length,
								},
								{
									label: "Upcoming Entries",
									value: collectionSummary.upcomingEntries.length,
								},
								{
									label: "Active Workout",
									value: collectionSummary.activeWorkoutPlan ? "Yes" : "No",
								},
							]}
						/>
					) : null}
					<div>
						<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.08em]">
							Recent Obligations
						</p>
						<CompactList
							emptyMessage="No obligations found for this mortgage."
							items={detailContext?.recentObligations ?? []}
							renderItem={(item) => {
								const obligation = item as NonNullable<
									typeof detailContext
								>["recentObligations"][number];
								return (
									<div
										className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-3"
										key={String(obligation.obligationId)}
									>
										<div>
											<p className="font-medium text-sm">{obligation.type}</p>
											<p className="text-muted-foreground text-sm">
												{formatDate(obligation.dueDate)} • {obligation.status}
											</p>
										</div>
										<Badge variant="outline">
											{formatCurrency(obligation.amount, 100)}
										</Badge>
									</div>
								);
							}}
						/>
					</div>
				</div>
			</DetailSectionShell>

			<DetailSectionShell
				description="Listing projection and latest canonical valuation snapshot for this mortgage."
				title="Listing Projection"
			>
				<div className="space-y-4">
					<MetricGrid
						items={[
							{
								label: "Listing",
								value: detailContext?.listing
									? (detailContext.listing.title ??
										`${detailContext.listing.status} listing`)
									: "No active listing",
							},
							{
								label: "Listing Status",
								value: detailContext?.listing?.status ?? "Not projected",
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
