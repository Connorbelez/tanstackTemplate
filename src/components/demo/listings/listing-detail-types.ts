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
	id: string;
	label: string;
	meta: string;
	pageLabel: string;
}

export interface ListingLawyerOption {
	detail: string;
	id: string;
	label: string;
}

export interface ListingSimilarCard {
	badges: ListingBadge[];
	id: string;
	metrics: string[];
	price: string;
	title: string;
	tone: ListingHeroImage["tone"];
}

export interface ListingDetailMock {
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
	checkout: {
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
		investorCountLabel: string;
		projectedYield: string;
		totalFractions: number;
	};
	keyFinancials: ListingKeyFinancialItem[];
	listedLabel: string;
	map: {
		label: string;
		locationText: string;
	};
	mlsId: string;
	paymentHistory: {
		lateCount: number;
		missedCount: number;
		months: ListingPaymentHistoryMonth[];
		onTimeRate: string;
	};
	similarListings: ListingSimilarCard[];
	summary: string;
	title: string;
}
