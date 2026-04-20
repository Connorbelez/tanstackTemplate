import type {
	ListingBadge,
	ListingBorrowerSignal,
	ListingComparable,
	ListingDetailData,
	ListingDocumentItem,
	ListingHeroImage,
	ListingPaymentHistoryMonth,
	ListingSimilarCard,
} from "./listing-detail-types";
import type { MarketplaceListingDetailSnapshot } from "./marketplace-types";

const HERO_TONES: readonly ListingHeroImage["tone"][] = [
	"stone",
	"mist",
	"pearl",
	"warm",
	"sand",
	"sage",
];
const WORD_BOUNDARY_PATTERN = /[_\s-]+/g;

function pickHeroTone(index: number): ListingHeroImage["tone"] {
	return HERO_TONES[index % HERO_TONES.length] ?? "stone";
}

function formatCurrency(value: number) {
	return new Intl.NumberFormat("en-CA", {
		currency: "CAD",
		maximumFractionDigits: 0,
		style: "currency",
	}).format(value);
}

function formatCompactCurrency(value: number) {
	return new Intl.NumberFormat("en-CA", {
		currency: "CAD",
		maximumFractionDigits: 1,
		notation: "compact",
		style: "currency",
	}).format(value);
}

function formatPercent(value: number, digits = 2) {
	return `${value.toFixed(digits)}%`;
}

function formatDate(value: string) {
	const parsed = new Date(
		value.includes("T") ? value : `${value}T00:00:00.000Z`
	);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}

	return new Intl.DateTimeFormat("en-CA", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
		year: "numeric",
	}).format(parsed);
}

function titleCase(value: string) {
	return value
		.split(WORD_BOUNDARY_PATTERN)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");
}

function ordinal(value: number) {
	if (value % 100 >= 11 && value % 100 <= 13) {
		return `${value}th`;
	}

	switch (value % 10) {
		case 1:
			return `${value}st`;
		case 2:
			return `${value}nd`;
		case 3:
			return `${value}rd`;
		default:
			return `${value}th`;
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function buildBadges(detail: NonNullable<MarketplaceListingDetailSnapshot>) {
	let mortgageTypeBadgeLabel = "OTHER POSITION";
	if (detail.listing.mortgageTypeLabel === "First") {
		mortgageTypeBadgeLabel = "1ST MORTGAGE";
	} else if (detail.listing.mortgageTypeLabel === "Second") {
		mortgageTypeBadgeLabel = "2ND MORTGAGE";
	}

	const badges: ListingBadge[] = [
		{
			id: "mortgage-type",
			label: mortgageTypeBadgeLabel,
			tone: "dark",
		},
		{
			id: "property-type",
			label: detail.listing.propertyTypeLabel,
			tone: "outline",
		},
		{
			id: "rate-type",
			label:
				detail.listing.rateType === "fixed" ? "Fixed Rate" : "Variable Rate",
			tone: "outline",
		},
	];

	if (detail.investment.soldPercent > 0) {
		badges.push({
			id: "sold",
			label: `${Math.round(detail.investment.soldPercent)}% Sold`,
			tone: "default",
		});
	}

	return badges;
}

function buildHeroImages(
	detail: NonNullable<MarketplaceListingDetailSnapshot>
): ListingHeroImage[] {
	if (detail.listing.heroImages.length === 0) {
		return [
			{
				alt: detail.listing.title,
				id: `${detail.listing.id}:fallback`,
				label: "No photos available",
				tone: "stone",
				url: null,
			},
		];
	}

	return detail.listing.heroImages.map((image, index) => ({
		alt: image.caption ?? detail.listing.title,
		id: image.id,
		label: image.caption ?? `Photo ${index + 1}`,
		tone: pickHeroTone(index),
		url: image.url,
	}));
}

function buildComparables(
	detail: NonNullable<MarketplaceListingDetailSnapshot>
): ListingDetailData["comparables"] {
	const latestAppraisal = detail.appraisals[0];
	const rows: ListingComparable[] = (latestAppraisal?.comparables ?? []).map(
		(comparable) => ({
			address: comparable.address,
			date: comparable.saleDate
				? formatDate(comparable.saleDate)
				: "Unavailable",
			distance: comparable.propertyType ?? "—",
			id: comparable.id,
			price:
				comparable.salePrice !== null
					? formatCurrency(comparable.salePrice)
					: "Unavailable",
			squareFeet:
				comparable.squareFootage !== null
					? comparable.squareFootage.toLocaleString("en-CA")
					: "—",
		})
	);

	return {
		asIf: rows,
		asIs: rows,
	};
}

function buildBorrowerSignals(
	detail: NonNullable<MarketplaceListingDetailSnapshot>
): ListingDetailData["borrowerSignals"] {
	const borrowerSignal = asRecord(detail.listing.borrowerSignal);
	const participants = asArray(borrowerSignal?.participants).map(asRecord);
	const borrowerCount =
		readNumber(borrowerSignal?.borrowerCount) ?? participants.length;
	const hasGuarantor = readBoolean(borrowerSignal?.hasGuarantor) ?? false;
	const primaryBorrowerName =
		readString(borrowerSignal?.primaryBorrowerName) ?? "Not disclosed";
	const verifiedParticipants = participants.filter((participant) =>
		readString(participant?.idvStatus)
	).length;

	const items: ListingBorrowerSignal[] = [
		{
			id: "primary-borrower",
			label: "Primary borrower",
			tone: "default",
			value: primaryBorrowerName,
		},
		{
			id: "borrower-count",
			label: "Participants",
			tone: "default",
			value: `${borrowerCount} linked`,
		},
		{
			id: "verification",
			label: "Identity checks",
			tone: verifiedParticipants > 0 ? "positive" : "warning",
			value:
				borrowerCount > 0
					? `${verifiedParticipants}/${borrowerCount} surfaced`
					: "Awaiting data",
		},
		{
			id: "guarantor",
			label: "Guarantor",
			tone: hasGuarantor ? "positive" : "default",
			value: hasGuarantor ? "Present" : "None",
		},
	];

	let verificationGrade = "C";
	if (borrowerCount === 0) {
		verificationGrade = "N/A";
	} else if (verifiedParticipants >= borrowerCount) {
		verificationGrade = "A";
	} else if (verifiedParticipants > 0) {
		verificationGrade = "B";
	}

	return {
		grade: verificationGrade,
		items,
		note: "Operational profile",
		score:
			borrowerCount > 0
				? `${verifiedParticipants}/${borrowerCount}`
				: "Awaiting data",
		subtitle:
			borrowerCount > 0
				? "Borrower composition derived from the active mortgage file."
				: "Borrower profile details have not been published yet.",
	};
}

function buildPaymentHistory(
	detail: NonNullable<MarketplaceListingDetailSnapshot>
): ListingDetailData["paymentHistory"] {
	const paymentHistory = asRecord(detail.listing.paymentHistory);
	const byStatus = asRecord(paymentHistory?.byStatus) ?? {};
	const totalObligations = readNumber(paymentHistory?.totalObligations) ?? 0;
	const lateCount =
		(readNumber(byStatus.overdue) ?? 0) +
		(readNumber(byStatus.partially_settled) ?? 0);
	const missedCount = readNumber(byStatus.waived) ?? 0;
	const onTimeCount = Math.max(0, totalObligations - lateCount - missedCount);

	const onTimeRate =
		totalObligations > 0
			? `${Math.round((onTimeCount / totalObligations) * 100)}%`
			: "N/A";

	const months: ListingPaymentHistoryMonth[] = [];

	return {
		lateCount,
		missedCount,
		months,
		onTimeRate,
	};
}

function buildDocuments(
	detail: NonNullable<MarketplaceListingDetailSnapshot>
): ListingDocumentItem[] {
	return detail.documents.map((document) => ({
		description: document.description,
		id: String(document.assetId),
		label: document.displayName,
		meta: titleCase(document.class),
		pageLabel: document.description ?? "Document available for download",
		url: document.url,
	}));
}

function buildSimilarListings(
	detail: NonNullable<MarketplaceListingDetailSnapshot>
): ListingSimilarCard[] {
	return detail.similarListings.map((listing, index) => ({
		badges: [
			{
				id: `${listing.id}-mortgage-type`,
				label: listing.mortgageTypeLabel,
				tone: "dark",
			},
			{
				id: `${listing.id}-property-type`,
				label: listing.propertyTypeLabel,
				tone: "outline",
			},
		],
		id: listing.id,
		imageUrl: listing.heroImageUrl,
		metrics: [formatPercent(listing.interestRate), `${listing.ltvRatio}% LTV`],
		price: formatCompactCurrency(listing.principal),
		title: listing.title,
		tone: pickHeroTone(index),
	}));
}

export function buildMarketplaceListingDetailModel(
	detail: NonNullable<MarketplaceListingDetailSnapshot>
): ListingDetailData {
	const latestAppraisal = detail.appraisals[0];
	const perFractionAmount =
		detail.investment.totalFractions > 0
			? Math.round(detail.listing.principal / detail.investment.totalFractions)
			: detail.listing.principal;
	const encumbranceCount = detail.encumbrances.length;
	const positionLabel = ordinal(detail.listing.lienPosition);

	return {
		appraisal: {
			asIf: latestAppraisal?.valueAsIfComplete
				? {
						label: "As-If Complete",
						note: "Projected value from the latest published appraisal package.",
						secondaryLabel: "Effective",
						secondaryValue: formatDate(latestAppraisal.effectiveDate),
						value: formatCurrency(latestAppraisal.valueAsIfComplete),
					}
				: {
						label: "Projected Value",
						note: "No as-if-complete valuation has been published.",
						value: "Unavailable",
					},
			asIs: latestAppraisal
				? {
						date: formatDate(latestAppraisal.reportDate),
						label: "As-Is Appraisal",
						note: titleCase(latestAppraisal.type),
						secondaryLabel: "Effective",
						secondaryValue: formatDate(latestAppraisal.effectiveDate),
						value: formatCurrency(latestAppraisal.valueAsIs),
					}
				: {
						label: "As-Is Appraisal",
						note: "No appraisal has been published for this listing.",
						value: "Unavailable",
					},
		},
		atAGlance: [
			{ label: "Principal", value: formatCurrency(detail.listing.principal) },
			{
				label: "Interest Rate",
				value: `${formatPercent(detail.listing.interestRate)} ${titleCase(detail.listing.rateType)}`,
			},
			{
				label: "LTV",
				tone: detail.listing.ltvRatio <= 65 ? "positive" : "default",
				value: formatPercent(detail.listing.ltvRatio),
			},
			{ label: "Term", value: `${detail.listing.termMonths} months` },
			{
				label: "Available",
				tone: detail.investment.availableFractions > 0 ? "positive" : "warning",
				value: `${detail.investment.availableFractions}/${detail.investment.totalFractions} frac.`,
			},
			{
				label: "Prior Charges",
				value:
					encumbranceCount > 0
						? `${encumbranceCount} disclosed`
						: "None published",
			},
		],
		badges: buildBadges(detail),
		borrowerSignals: buildBorrowerSignals(detail),
		comparables: buildComparables(detail),
		documents: buildDocuments(detail),
		heroImages: buildHeroImages(detail),
		id: detail.listing.id,
		investment: {
			availabilityLabel: `${detail.investment.availableFractions.toLocaleString("en-CA")} of ${detail.investment.totalFractions.toLocaleString("en-CA")} available`,
			availabilityValue:
				detail.investment.totalFractions > 0
					? Math.round(
							(detail.investment.availableFractions /
								detail.investment.totalFractions) *
								100
						)
					: 0,
			availableFractions: detail.investment.availableFractions,
			investorCountLabel:
				detail.investment.investorCount > 0
					? `${detail.investment.investorCount} investors currently committed`
					: "No investors have locked fractions yet.",
			lockedPercent: detail.investment.lockedPercent,
			minimumFractions: detail.investment.availableFractions > 0 ? 1 : 0,
			perFractionAmount,
			projectedYield: `${formatPercent(detail.listing.interestRate)} APR`,
			soldPercent: detail.investment.soldPercent,
			totalFractions: detail.investment.totalFractions,
		},
		keyFinancials: [
			{
				label: "Principal Amount",
				note: "CAD",
				value: formatCurrency(detail.listing.principal),
			},
			{
				label: "Interest Rate",
				note: titleCase(detail.listing.rateType),
				value: formatPercent(detail.listing.interestRate),
			},
			{
				label: "LTV",
				note:
					detail.listing.ltvRatio <= 65 ? "Lower leverage" : "Published ratio",
				tone: detail.listing.ltvRatio <= 65 ? "positive" : "default",
				value: formatPercent(detail.listing.ltvRatio),
			},
			{
				label: "Lien Position",
				note:
					encumbranceCount > 0
						? `${encumbranceCount} prior encumbrance${encumbranceCount === 1 ? "" : "s"}`
						: "No prior charges published",
				value: `${positionLabel} position`,
			},
			{
				label: "Term Length",
				note: "Original note term",
				value: `${detail.listing.termMonths} mo`,
			},
			{
				label: "Monthly Payment",
				note: titleCase(detail.listing.paymentFrequency),
				value: formatCurrency(detail.listing.monthlyPayment),
			},
			{
				label: "Payment Frequency",
				note: `${detail.listing.paymentFrequency.replaceAll("_", " ")} schedule`,
				value: titleCase(detail.listing.paymentFrequency),
			},
			{
				label: "Maturity Date",
				note: "Current published maturity",
				value: formatDate(detail.listing.maturityDate),
			},
		],
		listedLabel: `Matures ${formatDate(detail.listing.maturityDate)}`,
		map: {
			label: "Approximate location",
			lat: detail.listing.approximateLatitude,
			lng: detail.listing.approximateLongitude,
			locationText: detail.listing.locationLabel,
		},
		paymentHistory: buildPaymentHistory(detail),
		referenceLabel: `FairLend listing ${detail.listing.id.slice(-6)}`,
		similarListings: buildSimilarListings(detail),
		summary: detail.listing.summary,
		title: detail.listing.title,
	};
}
