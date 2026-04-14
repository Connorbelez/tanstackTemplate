import { getListingDetailMock } from "#/components/demo/listings/listing-detail-mock-data";
import type {
	BrokerLandingContent,
	BrokerListingSummary,
	BrokerOnboardingDraft,
	BrokerStatCallout,
	BrokerThemeConfig,
	BrokerValuePoint,
	MortgageApplicationDraft,
} from "./types";

const FIRST_MORTGAGE_TITLE_PREFIX = /^First Mortgage — /;
const SECOND_MORTGAGE_TITLE_PREFIX = /^2nd Mortgage — /;

function createListingSummary(
	id: string,
	statusLabel: BrokerListingSummary["statusLabel"],
	statusTone: BrokerListingSummary["statusTone"]
): BrokerListingSummary {
	const detail = getListingDetailMock(id);
	if (!detail) {
		throw new Error(`Missing broker demo listing for ${id}`);
	}

	const principal =
		detail.atAGlance.find((item) => item.label === "Principal")?.value ?? "$0";
	const rate =
		detail.atAGlance.find((item) => item.label === "Interest Rate")?.value ??
		"N/A";
	const ltv =
		detail.atAGlance.find((item) => item.label === "LTV")?.value ?? "N/A";
	const term =
		detail.atAGlance.find((item) => item.label === "Term")?.value ?? "N/A";

	return {
		id: detail.id,
		title: detail.title
			.replace(FIRST_MORTGAGE_TITLE_PREFIX, "")
			.replace(SECOND_MORTGAGE_TITLE_PREFIX, ""),
		propertyType:
			detail.badges.find(
				(badge) => badge.id !== "first" && badge.id !== "second"
			)?.label ?? "Mortgage Opportunity",
		location: detail.map.locationText,
		positionLabel:
			detail.badges.find(
				(badge) => badge.id === "first" || badge.id === "second"
			)?.label ?? "1st",
		statusLabel,
		statusTone,
		amountLabel: principal,
		rateLabel: rate.replace(" Fixed", ""),
		ltvLabel: ltv,
		termLabel: term,
		summary: detail.summary,
	};
}

export const brokerTheme: BrokerThemeConfig = {
	brokerName: "Meridian Capital",
	poweredByLabel: "Powered by FairLend",
	subdomainLabel: "meridian.fairlend.ca",
	logoLetter: "M",
	colorPrimary: "#1B4332",
	colorPrimaryForeground: "#FFFFFF",
	colorAccent: "#2D6A4F",
	colorBackground: "#FAFAF8",
	colorSurface: "#FFFFFF",
	colorSurfaceMuted: "#F4F4F1",
	colorBorder: "#E7E5E4",
	colorText: "#1C1917",
	colorTextMuted: "#6B645D",
	colorSuccess: "#15803D",
	colorWarning: "#A16207",
	radiusCard: "24px",
	radiusButton: "12px",
	fontDisplay: '"Inter Tight", sans-serif',
	fontBody: '"Inter", sans-serif',
	fontMono: '"JetBrains Mono", monospace',
};

export const brokerListings: BrokerListingSummary[] = [
	createListingSummary("first-mortgage-north-york", "Active", "active"),
	createListingSummary("first-mortgage-condo-scarborough", "Active", "active"),
	createListingSummary("second-mortgage-vaughan", "Filling", "filling"),
];

export const brokerLandingContent: BrokerLandingContent = {
	hero: {
		activeListingsLabel: `${brokerListings.length} active listings`,
		headline: "Invest in Canadian Mortgage Opportunities",
		subheadline:
			"Meridian Capital connects accredited investors with vetted first and second mortgage investment opportunities across the Greater Toronto Area.",
		primaryCtaLabel: "Browse Listings",
		secondaryCtaLabel: "How It Works",
		previewEyebrow: "Broker portal preview",
		previewTitle: "A branded gateway for borrowers and lenders",
		previewBody:
			"Prospects arrive through Meridian's white-label portal, review curated opportunities, and move into a guided investor or mortgage intake flow.",
		previewHighlights: [
			"Broker-branded lender onboarding",
			"Gated access to opportunity memos",
			"Mortgage pre-approval intake",
		],
	},
	trustMetrics: [
		{ id: "license", value: "FSRA", label: "Licensed #12847" },
		{ id: "experience", value: "12yr", label: "Experience" },
		{ id: "funded", value: "$42M", label: "Funded" },
		{ id: "investors", value: "180+", label: "Investors" },
	],
	featuredListings: brokerListings,
	borrowerPreApproval: {
		eyebrow: "Looking for a mortgage",
		heading: "Start your pre-approval with Meridian",
		body: "Share a few details and Meridian's desk will follow up with next steps. This demo does not submit to a live system—in production, your information would flow into the broker's FairLend intake.",
		fullNameLabel: "Full name",
		emailLabel: "Email",
		phoneLabel: "Phone number",
		addressLabel: "Property or mailing address",
		addressPlaceholder: "Street, city, province",
		amountLabel: "Desired mortgage amount",
		amountPlaceholder: "e.g. $750,000",
		submitLabel: "Request pre-approval",
		successTitle: "Request received",
		successBody:
			"Thank you. In a live Meridian portal this would open your pre-approval file and trigger broker follow-up. You can also use the full gated intake from the header when you're ready.",
		validationMessage: "Please complete all fields before submitting.",
	},
	howItWorks: [
		{
			id: "browse",
			label: "Browse",
			description:
				"Explore vetted mortgage listings with property, structure, and return details curated by Meridian's team.",
		},
		{
			id: "qualify",
			label: "Qualify",
			description:
				"Tell us whether you're a lender, borrower, or mortgage applicant and complete the right intake path.",
		},
		{
			id: "launch",
			label: "Launch",
			description:
				"Receive a guided next step from Meridian Capital with branded follow-up, document requests, and review.",
		},
	],
	about: {
		heading: "About Meridian Capital",
		body: "Meridian Capital is a Toronto-based mortgage brokerage focused on private credit opportunities for accredited investors and flexible financing options for borrowers who need responsive underwriting.",
	},
	contact: {
		heading: "Contact the Meridian team",
		body: "Questions about a listing or mortgage fit? Reach out to the Meridian Capital desk for a same-day response during business hours.",
	},
	authOptions: [
		{
			id: "lender",
			label: "I'm a lender",
			title: "Investor access",
			description:
				"Request access to opportunity memos, reserve capacity, and ongoing Meridian deal flow.",
			buttonLabel: "Continue as Lender",
		},
		{
			id: "borrower",
			label: "I'm a borrower",
			title: "Borrower intake",
			description:
				"Share your timeline and property goals so Meridian can match you with the right mortgage path.",
			buttonLabel: "Continue as Borrower",
		},
		{
			id: "mortgage-applicant",
			label: "Apply for mortgage pre-approval",
			title: "Mortgage pre-approval",
			description:
				"Start a fast, branded intake for a pre-approval or near-term financing request.",
			buttonLabel: "Start Pre-Approval",
		},
	],
};

export const brokerValuePoints: BrokerValuePoint[] = [
	{
		id: "landing",
		title: "White-Label Landing Page",
		description:
			"Your own branded {slug}.fairlend.ca experience with your logo, listings, and gated flows.",
	},
	{
		id: "network",
		title: "Investor Network Access",
		description:
			"Tap into FairLend's accredited-investor ecosystem while keeping Meridian's brand front and center.",
	},
	{
		id: "compliance",
		title: "Compliance Built In",
		description:
			"Structured intake, document capture, and auditable flows modeled for regulated mortgage operations.",
	},
	{
		id: "servicing",
		title: "End-to-End Servicing",
		description:
			"From pre-approval and deal intake through collections and reporting, the operating layer stays unified.",
	},
];

export const brokerStats: BrokerStatCallout[] = [
	{ id: "speed", value: "3.2x", label: "faster deal funding" },
	{ id: "funded", value: "$8.4M", label: "avg. funded per broker" },
	{ id: "renewal", value: "94%", label: "renewal rate" },
];

export const emptyOnboardingDraft: BrokerOnboardingDraft = {
	intent: "none",
	currentStep: 0,
	isSubmitted: false,
	fields: {
		firstName: "Alex",
		lastName: "Mercer",
		email: "alex@meridiancap.ca",
		phone: "+1 (416) 555-0164",
		city: "Toronto, ON",
		brokerageName: "Meridian Capital",
		propertyCity: "North York, ON",
		propertyType: "Detached Home",
		mortgageAmount: "$850,000",
		targetAllocation: "$150,000",
		timeline: "Within 30 days",
		experienceLevel: "Experienced with private mortgages",
		accreditedInvestor: "Yes",
		notes:
			"I'd like Meridian to advise on fit and next steps based on current listing availability.",
	},
};

const emptyMortgageApplicationFields: MortgageApplicationDraft["fields"] = {
	propertyAddress: "",
	propertyType: "",
	estimatedPropertyValue: "",
	mortgageAmount: "",
	annualGrossIncome: "",
	employmentStatus: "",
	employerName: "",
	yearsAtEmployer: "",
	otherIncomeSources: "",
	otherIncomeAmount: "",
	creditCheckConsent: false,
	amortizationYears: "",
	paymentFrequency: "",
	documentNotes: "",
};

export const emptyMortgageApplicationDraft: MortgageApplicationDraft = {
	currentStep: 0,
	isSubmitted: false,
	fields: { ...emptyMortgageApplicationFields },
};
