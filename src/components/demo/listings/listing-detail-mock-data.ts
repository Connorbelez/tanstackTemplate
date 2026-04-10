import type {
	ListingBadge,
	ListingDetailMock,
	ListingDocumentItem,
	ListingLawyerOption,
	ListingPaymentHistoryMonth,
	ListingSimilarCard,
} from "./listing-detail-types";

const standardLawyers: ListingLawyerOption[] = [
	{
		id: "smith-associates",
		label: "Smith & Associates LLP",
		detail: "Toronto, ON · Real Estate · Est. $1,200",
	},
	{
		id: "jones-law",
		label: "Jones Law Professional Corp.",
		detail: "Markham, ON · Real Estate · Est. $950",
	},
	{
		id: "own-lawyer",
		label: "I have my own lawyer",
		detail: "We will coordinate directly with your selected counsel.",
	},
];

const standardDocuments: ListingDocumentItem[] = [
	{
		id: "appraisal-report",
		label: "Appraisal Report",
		meta: "PDF · 2.3 MB",
		pageLabel: "Appraisal Report — Page 1 of 8",
	},
	{
		id: "commitment-letter",
		label: "Commitment Letter",
		meta: "PDF · 640 KB",
		pageLabel: "Commitment Letter — Page 1 of 4",
	},
	{
		id: "title-search",
		label: "Title Search",
		meta: "PDF · 420 KB",
		pageLabel: "Title Search — Page 1 of 3",
	},
	{
		id: "property-survey",
		label: "Property Survey",
		meta: "PDF · 1.1 MB",
		pageLabel: "Property Survey — Page 1 of 2",
	},
	{
		id: "insurance-certificate",
		label: "Insurance Certificate",
		meta: "PDF · 220 KB",
		pageLabel: "Insurance Certificate — Page 1 of 2",
	},
];

const primaryBadges: ListingBadge[] = [
	{ id: "first", label: "1ST MORTGAGE", tone: "dark" },
	{ id: "detached", label: "Detached Home", tone: "outline" },
	{ id: "fixed", label: "Fixed Rate", tone: "outline" },
];

const paymentTimeline: ListingPaymentHistoryMonth[] = [
	{ id: "apr", label: "Apr", status: "onTime" },
	{ id: "may", label: "May", status: "onTime" },
	{ id: "jun", label: "Jun", status: "onTime" },
	{ id: "jul", label: "Jul", status: "onTime" },
	{ id: "aug", label: "Aug", status: "onTime" },
	{ id: "sep", label: "Sep", status: "late" },
	{ id: "oct", label: "Oct", status: "onTime" },
	{ id: "nov", label: "Nov", status: "onTime" },
	{ id: "dec", label: "Dec", status: "onTime" },
	{ id: "jan", label: "Jan", status: "onTime" },
	{ id: "feb", label: "Feb", status: "onTime" },
	{ id: "mar", label: "Mar", status: "onTime" },
];

const similarListings: ListingSimilarCard[] = [
	{
		id: "first-mortgage-condo-scarborough",
		title: "First Mortgage — Condo, Scarborough",
		price: "$320,000",
		metrics: ["9.25%", "70% LTV"],
		tone: "stone",
		badges: [
			{ id: "first", label: "1st", tone: "dark" },
			{ id: "condo", label: "Condo", tone: "outline" },
		],
	},
	{
		id: "second-mortgage-vaughan",
		title: "2nd Mortgage — Detached, Vaughan",
		price: "$188K",
		metrics: ["11.0%", "72% LTV"],
		tone: "mist",
		badges: [
			{ id: "second", label: "2nd", tone: "dark" },
			{ id: "detached", label: "Detached", tone: "outline" },
		],
	},
	{
		id: "first-mortgage-semi-etobicoke",
		title: "First Mortgage — Semi-Detached, Etobicoke",
		price: "$380,000",
		metrics: ["8.75%", "62% LTV"],
		tone: "warm",
		badges: [
			{ id: "first", label: "1st", tone: "dark" },
			{ id: "semi", label: "Semi", tone: "outline" },
		],
	},
];

function buildListing(
	overrides: Partial<ListingDetailMock> &
		Pick<ListingDetailMock, "id" | "title">
): ListingDetailMock {
	return {
		id: overrides.id,
		title: overrides.title,
		listedLabel: overrides.listedLabel ?? "Listed March 1, 2026",
		mlsId: overrides.mlsId ?? "FLM-2026-0847",
		badges: overrides.badges ?? primaryBadges,
		heroImages: overrides.heroImages ?? [
			{
				id: "front-exterior",
				label: "Front Exterior",
				alt: "Front exterior view",
				tone: "stone",
			},
			{
				id: "kitchen",
				label: "Kitchen",
				alt: "Renovated kitchen",
				tone: "mist",
			},
			{
				id: "living-room",
				label: "Living Room",
				alt: "Living room with large windows",
				tone: "pearl",
			},
			{
				id: "rear-yard",
				label: "Rear Yard",
				alt: "Rear yard and deck",
				tone: "warm",
			},
			{
				id: "bedroom",
				label: "Primary Bedroom",
				alt: "Primary bedroom",
				tone: "sand",
			},
			{
				id: "bathroom",
				label: "Bathroom",
				alt: "Main bathroom",
				tone: "sage",
			},
			{
				id: "hallway",
				label: "Hallway",
				alt: "Main hallway",
				tone: "mist",
			},
			{
				id: "garage",
				label: "Garage",
				alt: "Garage and driveway",
				tone: "stone",
			},
			{
				id: "street",
				label: "Street View",
				alt: "Street-facing view",
				tone: "pearl",
			},
			{
				id: "basement",
				label: "Basement",
				alt: "Basement lower level",
				tone: "sage",
			},
			{
				id: "staircase",
				label: "Staircase",
				alt: "Interior staircase",
				tone: "warm",
			},
			{
				id: "facade-close",
				label: "Facade Detail",
				alt: "Facade close-up",
				tone: "sand",
			},
		],
		map: overrides.map ?? {
			label: "~500m privacy radius",
			locationText: "North York, ON",
		},
		summary:
			overrides.summary ??
			"A compelling first-position mortgage on a well-maintained detached home in North York. Conservative 65% LTV and an 8.50% fixed annual rate offers attractive risk-adjusted yield backed by strong borrower signals.",
		atAGlance: overrides.atAGlance ?? [
			{ label: "Principal", value: "$450,000" },
			{ label: "Interest Rate", value: "8.50% Fixed" },
			{ label: "LTV", value: "65.0%", tone: "positive" },
			{ label: "Term", value: "24 months" },
			{ label: "Per Fraction", value: "$45.00" },
			{ label: "Yield", value: "8.50% APR", tone: "positive" },
		],
		keyFinancials: overrides.keyFinancials ?? [
			{ label: "Principal Amount", value: "$450,000", note: "CAD" },
			{ label: "Interest Rate", value: "8.50%", note: "Fixed" },
			{
				label: "Loan-to-Value",
				value: "65.0%",
				note: "Low Risk",
				tone: "positive",
			},
			{ label: "Term Length", value: "24 mo", note: "2 years" },
			{ label: "Monthly Payment", value: "$3,187", note: "per month" },
			{ label: "Maturity Date", value: "Mar 2028", note: "March 15, 2028" },
			{
				label: "Origination Date",
				value: "Mar 2026",
				note: "March 1, 2026",
			},
			{
				label: "Payment Frequency",
				value: "Monthly",
				note: "12 payments/year",
			},
		],
		appraisal: overrides.appraisal ?? {
			asIs: {
				label: "As-Is Appraisal",
				value: "$690,000",
				note: "Full Interior",
				date: "Jan 12, 2026",
				secondaryLabel: "Company",
				secondaryValue: "Apex Appraisals Inc.",
			},
			asIf: {
				label: "As-If Appraisal",
				value: "$820,000",
				note: "After planned basement renovation and kitchen upgrade.",
				secondaryLabel: "Projected",
			},
		},
		comparables: overrides.comparables ?? {
			asIs: [
				{
					id: "wilowdale",
					address: "47 Willowdale Ave",
					price: "$715,000",
					date: "Nov '25",
					distance: "0.3 km",
					squareFeet: "1,850",
				},
				{
					id: "finch",
					address: "112 Finch Ave W",
					price: "$680,000",
					date: "Dec '25",
					distance: "0.7 km",
					squareFeet: "1,720",
				},
				{
					id: "sheppard",
					address: "89 Sheppard Ave E",
					price: "$702,500",
					date: "Jan '26",
					distance: "1.1 km",
					squareFeet: "1,900",
				},
			],
			asIf: [
				{
					id: "elmwood",
					address: "22 Elmwood Cres",
					price: "$835,000",
					date: "Oct '25",
					distance: "0.5 km",
					squareFeet: "2,100",
				},
				{
					id: "bayview",
					address: "8 Bayview Terrace",
					price: "$810,000",
					date: "Dec '25",
					distance: "0.9 km",
					squareFeet: "1,950",
				},
				{
					id: "hendon",
					address: "155 Hendon Ave",
					price: "$798,000",
					date: "Jan '26",
					distance: "1.3 km",
					squareFeet: "2,050",
				},
			],
		},
		borrowerSignals: overrides.borrowerSignals ?? {
			grade: "B+",
			score: "720",
			subtitle: "Above average creditworthiness",
			note: "Anonymized data",
			items: [
				{
					id: "income-stability",
					label: "Income Stability",
					value: "Strong",
					tone: "positive",
				},
				{
					id: "account-health",
					label: "Account Health",
					value: "Strong",
					tone: "positive",
				},
				{
					id: "debt-service",
					label: "Debt Service Capacity",
					value: "Moderate",
					tone: "warning",
				},
				{
					id: "payment-behavior",
					label: "Payment Behavior",
					value: "Strong",
					tone: "positive",
				},
				{
					id: "underwriting",
					label: "Underwriting Decision",
					value: "Approved",
					tone: "positive",
				},
			],
		},
		paymentHistory: overrides.paymentHistory ?? {
			onTimeRate: "96%",
			lateCount: 1,
			missedCount: 0,
			months: paymentTimeline,
		},
		documents: overrides.documents ?? standardDocuments,
		investment: overrides.investment ?? {
			availabilityLabel: "6,200 of 10,000 available",
			availabilityValue: 62,
			availableFractions: 6200,
			totalFractions: 10_000,
			projectedYield: "8.50%",
			investorCountLabel: "14 investors already own fractions of this mortgage",
		},
		checkout: overrides.checkout ?? {
			defaultFractions: 100,
			minimumFractions: 10,
			perFractionAmount: 45,
			lockFee: "$250.00",
			cardCtaLabel: "Lock 100 Fractions — Pay $250 Fee",
			poweredBy: "Stripe",
			lawyers: standardLawyers,
		},
		similarListings: overrides.similarListings ?? similarListings,
	};
}

export const listingDetailMocks: Partial<Record<string, ListingDetailMock>> = {
	"first-mortgage-north-york": buildListing({
		id: "first-mortgage-north-york",
		title: "First Mortgage — Detached Home, North York",
	}),
	"first-mortgage-condo-scarborough": buildListing({
		id: "first-mortgage-condo-scarborough",
		title: "First Mortgage — Condo, Scarborough",
		listedLabel: "Listed February 21, 2026",
		mlsId: "FLM-2026-0711",
		badges: [
			{ id: "first", label: "1ST MORTGAGE", tone: "dark" },
			{ id: "condo", label: "Condo", tone: "outline" },
			{ id: "fixed", label: "Fixed Rate", tone: "outline" },
		],
		atAGlance: [
			{ label: "Principal", value: "$320,000" },
			{ label: "Interest Rate", value: "9.25% Fixed" },
			{ label: "LTV", value: "70%", tone: "positive" },
			{ label: "Term", value: "18 months" },
			{ label: "Per Fraction", value: "$32.00" },
			{ label: "Yield", value: "9.25% APR", tone: "positive" },
		],
		map: {
			label: "~420m privacy radius",
			locationText: "Scarborough, ON",
		},
		summary:
			"A Scarborough condo mortgage backed by a newer mid-rise unit close to transit and neighborhood retail. The 70% LTV and fixed 9.25% coupon are paired with a compact exit profile and localized resale support from the surrounding condo market.",
		appraisal: {
			asIs: {
				label: "As-Is Appraisal",
				value: "$465,000",
				note: "Condensed Interior",
				date: "Jan 28, 2026",
				secondaryLabel: "Company",
				secondaryValue: "Metro East Appraisals",
			},
			asIf: {
				label: "As-If Appraisal",
				value: "$508,000",
				note: "After balcony refresh and kitchen cabinetry updates.",
				secondaryLabel: "Projected",
			},
		},
		comparables: {
			asIs: [
				{
					id: "scarborough-birchmount",
					address: "18 Birchmount Rd",
					price: "$462,000",
					date: "Nov '25",
					distance: "0.4 km",
					squareFeet: "810",
				},
				{
					id: "scarborough-kennedy",
					address: "125 Kennedy Rd",
					price: "$471,500",
					date: "Dec '25",
					distance: "0.8 km",
					squareFeet: "835",
				},
				{
					id: "scarborough-lawrence",
					address: "311 Lawrence Ave E",
					price: "$459,900",
					date: "Jan '26",
					distance: "1.1 km",
					squareFeet: "792",
				},
			],
			asIf: [
				{
					id: "scarborough-progress",
					address: "2 Progress Ave",
					price: "$509,000",
					date: "Nov '25",
					distance: "0.5 km",
					squareFeet: "840",
				},
				{
					id: "scarborough-eglinton",
					address: "190 Eglinton Ave E",
					price: "$497,500",
					date: "Dec '25",
					distance: "0.9 km",
					squareFeet: "826",
				},
				{
					id: "scarborough-mccowan",
					address: "55 McCowan Rd",
					price: "$505,000",
					date: "Jan '26",
					distance: "1.2 km",
					squareFeet: "848",
				},
			],
		},
		investment: {
			availabilityLabel: "4,800 of 8,000 available",
			availabilityValue: 60,
			availableFractions: 4800,
			totalFractions: 8000,
			projectedYield: "9.25%",
			investorCountLabel: "11 investors already own fractions of this mortgage",
		},
		keyFinancials: [
			{ label: "Principal Amount", value: "$320,000", note: "CAD" },
			{ label: "Interest Rate", value: "9.25%", note: "Fixed" },
			{
				label: "Loan-to-Value",
				value: "70%",
				note: "Balanced",
				tone: "positive",
			},
			{ label: "Term Length", value: "18 mo", note: "1.5 years" },
			{ label: "Monthly Payment", value: "$2,467", note: "per month" },
			{ label: "Maturity Date", value: "Aug 2027", note: "August 30, 2027" },
			{
				label: "Origination Date",
				value: "Feb 2026",
				note: "February 28, 2026",
			},
			{
				label: "Payment Frequency",
				value: "Monthly",
				note: "12 payments/year",
			},
		],
	}),
	"second-mortgage-vaughan": buildListing({
		id: "second-mortgage-vaughan",
		title: "2nd Mortgage — Detached, Vaughan",
		listedLabel: "Listed February 18, 2026",
		mlsId: "FLM-2026-0679",
		badges: [
			{ id: "second", label: "2ND MORTGAGE", tone: "dark" },
			{ id: "detached", label: "Detached", tone: "outline" },
			{ id: "fixed", label: "Fixed Rate", tone: "outline" },
		],
		atAGlance: [
			{ label: "Principal", value: "$188,000" },
			{ label: "Interest Rate", value: "11.0% Fixed" },
			{ label: "LTV", value: "72%", tone: "warning" },
			{ label: "Term", value: "12 months" },
			{ label: "Per Fraction", value: "$18.80" },
			{ label: "Yield", value: "11.0% APR", tone: "positive" },
		],
		map: {
			label: "~380m privacy radius",
			locationText: "Vaughan, ON",
		},
		summary:
			"A second-position mortgage on a detached Vaughan home near the transit-oriented north end of the city. The file trades higher coupon income for a shorter term and a borrower profile supported by steady employment and recent equity gains in the local housing corridor.",
		appraisal: {
			asIs: {
				label: "As-Is Appraisal",
				value: "$655,000",
				note: "Above-grade Detached",
				date: "Feb 2, 2026",
				secondaryLabel: "Company",
				secondaryValue: "York Region Valuation Group",
			},
			asIf: {
				label: "As-If Appraisal",
				value: "$708,000",
				note: "After exterior refresh and basement completion.",
				secondaryLabel: "Projected",
			},
		},
		comparables: {
			asIs: [
				{
					id: "vaughan-vmc",
					address: "14 VMC Blvd",
					price: "$648,000",
					date: "Nov '25",
					distance: "0.3 km",
					squareFeet: "1,560",
				},
				{
					id: "vaughan-bass",
					address: "206 Bass Pro Mills Dr",
					price: "$659,500",
					date: "Dec '25",
					distance: "0.9 km",
					squareFeet: "1,610",
				},
				{
					id: "vaughan-livingstone",
					address: "87 Livingstone Ave",
					price: "$651,000",
					date: "Jan '26",
					distance: "1.2 km",
					squareFeet: "1,585",
				},
			],
			asIf: [
				{
					id: "vaughan-rutherford",
					address: "33 Rutherford Rd",
					price: "$704,000",
					date: "Nov '25",
					distance: "0.5 km",
					squareFeet: "1,680",
				},
				{
					id: "vaughan-langstaff",
					address: "1600 Langstaff Rd",
					price: "$712,500",
					date: "Dec '25",
					distance: "0.8 km",
					squareFeet: "1,705",
				},
				{
					id: "vaughan-hwy7",
					address: "7257 Hwy 7",
					price: "$699,900",
					date: "Jan '26",
					distance: "1.1 km",
					squareFeet: "1,642",
				},
			],
		},
		investment: {
			availabilityLabel: "2,600 of 5,000 available",
			availabilityValue: 52,
			availableFractions: 2600,
			totalFractions: 5000,
			projectedYield: "11.0%",
			investorCountLabel: "8 investors already own fractions of this mortgage",
		},
		keyFinancials: [
			{ label: "Principal Amount", value: "$188,000", note: "CAD" },
			{ label: "Interest Rate", value: "11.0%", note: "Fixed" },
			{
				label: "Loan-to-Value",
				value: "72%",
				note: "Higher Risk",
				tone: "warning",
			},
			{ label: "Term Length", value: "12 mo", note: "1 year" },
			{ label: "Monthly Payment", value: "$1,723", note: "per month" },
			{ label: "Maturity Date", value: "Feb 2027", note: "February 12, 2027" },
			{
				label: "Origination Date",
				value: "Feb 2026",
				note: "February 12, 2026",
			},
			{
				label: "Payment Frequency",
				value: "Monthly",
				note: "12 payments/year",
			},
		],
	}),
	"first-mortgage-semi-etobicoke": buildListing({
		id: "first-mortgage-semi-etobicoke",
		title: "First Mortgage — Semi-Detached, Etobicoke",
		listedLabel: "Listed February 9, 2026",
		mlsId: "FLM-2026-0521",
		badges: [
			{ id: "first", label: "1ST MORTGAGE", tone: "dark" },
			{ id: "semi", label: "Semi", tone: "outline" },
			{ id: "fixed", label: "Fixed Rate", tone: "outline" },
		],
		atAGlance: [
			{ label: "Principal", value: "$380,000" },
			{ label: "Interest Rate", value: "8.75% Fixed" },
			{ label: "LTV", value: "62%", tone: "positive" },
			{ label: "Term", value: "24 months" },
			{ label: "Per Fraction", value: "$38.00" },
			{ label: "Yield", value: "8.75% APR", tone: "positive" },
		],
		map: {
			label: "~450m privacy radius",
			locationText: "Etobicoke, ON",
		},
		summary:
			"A west-end Etobicoke semi-detached mortgage with stable rental appeal and a suburban family-home profile. The file emphasizes conservative leverage, a fixed 8.75% coupon, and nearby resale comparables that keep the exit story grounded in the local neighborhood market.",
		appraisal: {
			asIs: {
				label: "As-Is Appraisal",
				value: "$612,000",
				note: "Semi-Detached Family Home",
				date: "Feb 1, 2026",
				secondaryLabel: "Company",
				secondaryValue: "West End Appraisals",
			},
			asIf: {
				label: "As-If Appraisal",
				value: "$688,000",
				note: "After basement finishing and driveway repair.",
				secondaryLabel: "Projected",
			},
		},
		comparables: {
			asIs: [
				{
					id: "etobicoke-the-westway",
					address: "25 The Westway",
					price: "$609,000",
					date: "Nov '25",
					distance: "0.4 km",
					squareFeet: "1,430",
				},
				{
					id: "etobicoke-roncesvalles",
					address: "3106 Bloor St W",
					price: "$617,500",
					date: "Dec '25",
					distance: "0.9 km",
					squareFeet: "1,485",
				},
				{
					id: "etobicoke-islington",
					address: "42 Islington Ave",
					price: "$603,800",
					date: "Jan '26",
					distance: "1.3 km",
					squareFeet: "1,412",
				},
			],
			asIf: [
				{
					id: "etobicoke-lake-shore",
					address: "43 Lake Shore Blvd W",
					price: "$689,900",
					date: "Nov '25",
					distance: "0.6 km",
					squareFeet: "1,560",
				},
				{
					id: "etobicoke-park-lawn",
					address: "215 Park Lawn Rd",
					price: "$676,500",
					date: "Dec '25",
					distance: "0.8 km",
					squareFeet: "1,520",
				},
				{
					id: "etobicoke-royal-york",
					address: "101 Royal York Rd",
					price: "$683,000",
					date: "Jan '26",
					distance: "1.1 km",
					squareFeet: "1,548",
				},
			],
		},
		investment: {
			availabilityLabel: "3,900 of 7,500 available",
			availabilityValue: 52,
			availableFractions: 3900,
			totalFractions: 7500,
			projectedYield: "8.75%",
			investorCountLabel: "10 investors already own fractions of this mortgage",
		},
		keyFinancials: [
			{ label: "Principal Amount", value: "$380,000", note: "CAD" },
			{ label: "Interest Rate", value: "8.75%", note: "Fixed" },
			{
				label: "Loan-to-Value",
				value: "62%",
				note: "Low Risk",
				tone: "positive",
			},
			{ label: "Term Length", value: "24 mo", note: "2 years" },
			{ label: "Monthly Payment", value: "$2,960", note: "per month" },
			{ label: "Maturity Date", value: "Feb 2028", note: "February 28, 2028" },
			{
				label: "Origination Date",
				value: "Feb 2026",
				note: "February 28, 2026",
			},
			{
				label: "Payment Frequency",
				value: "Monthly",
				note: "12 payments/year",
			},
		],
	}),
};

export function getListingDetailMock(
	listingId: string
): ListingDetailMock | undefined {
	return listingDetailMocks[listingId];
}
