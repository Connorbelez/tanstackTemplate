export type ListingValueTone = "default" | "positive" | "warning";

export interface ListingBadge {
	id: string;
	label: string;
	tone?: "default" | "outline" | "dark";
}

export interface ListingHeroImage {
	alt: string;
	id: string;
	label: string;
	tone: "mist" | "pearl" | "sage" | "sand" | "stone" | "warm";
	url?: string | null;
}

export interface ListingAtAGlanceItem {
	label: string;
	tone?: ListingValueTone;
	value: string;
}

export interface ListingKeyFinancialItem {
	label: string;
	note: string;
	tone?: ListingValueTone;
	value: string;
}

export interface ListingAppraisalRecord {
	date?: string;
	label: string;
	note: string;
	secondaryLabel?: string;
	secondaryValue?: string;
	value: string;
}

export interface ListingComparable {
	address: string;
	date: string;
	distance: string;
	id: string;
	price: string;
	squareFeet: string;
}

export interface ListingBorrowerSignal {
	id: string;
	label: string;
	tone: ListingValueTone;
	value: string;
}

export interface ListingPaymentHistoryMonth {
	id: string;
	label: string;
	status: "late" | "missed" | "onTime";
}

export interface ListingDocumentItem {
	description?: string | null;
	id: string;
	label: string;
	meta: string;
	pageLabel: string;
	url?: string | null;
}

export interface ListingLawyerOption {
	detail: string;
	id: string;
	label: string;
}

export interface ListingSimilarCard {
	badges: ListingBadge[];
	href?: string;
	id: string;
	imageUrl?: string | null;
	metrics: string[];
	price: string;
	title: string;
	tone: ListingHeroImage["tone"];
}

export interface ListingDetailData {
	appraisal: {
		asIf: ListingAppraisalRecord;
		asIs: ListingAppraisalRecord;
	};
	atAGlance: ListingAtAGlanceItem[];
	badges: ListingBadge[];
	borrowerSignals: {
		grade: string;
		items: ListingBorrowerSignal[];
		note: string;
		score: string;
		subtitle: string;
	};
	checkout?: {
		cardCtaLabel: string;
		defaultFractions: number;
		lawyers: ListingLawyerOption[];
		lockFee: string;
		minimumFractions: number;
		perFractionAmount: number;
		poweredBy: string;
	};
	comparables: {
		asIf: ListingComparable[];
		asIs: ListingComparable[];
	};
	documents: ListingDocumentItem[];
	heroImages: ListingHeroImage[];
	id: string;
	investment: {
		availabilityLabel: string;
		availabilityValue: number;
		availableFractions: number;
		investorCountLabel: string;
		lockedPercent?: number;
		minimumFractions?: number;
		perFractionAmount?: number;
		projectedYield: string;
		soldPercent?: number;
		totalFractions: number;
	};
	keyFinancials: ListingKeyFinancialItem[];
	listedLabel: string;
	map: {
		label: string;
		lat?: number | null;
		lng?: number | null;
		locationText: string;
	};
	mlsId?: string;
	paymentHistory: {
		lateCount: number;
		missedCount: number;
		months: ListingPaymentHistoryMonth[];
		onTimeRate: string;
	};
	referenceLabel?: string;
	similarListings: ListingSimilarCard[];
	summary: string;
	title: string;
}

export type ListingDetailMock = ListingDetailData;
