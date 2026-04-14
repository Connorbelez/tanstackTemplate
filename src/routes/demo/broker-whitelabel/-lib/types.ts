export type BrokerAuthIntent =
	| "none"
	| "lender"
	| "borrower"
	| "mortgage-applicant";

export type BrokerListingStatusTone = "active" | "filling";

export interface BrokerThemeConfig {
	brokerName: string;
	colorAccent: string;
	colorBackground: string;
	colorBorder: string;
	colorPrimary: string;
	colorPrimaryForeground: string;
	colorSuccess: string;
	colorSurface: string;
	colorSurfaceMuted: string;
	colorText: string;
	colorTextMuted: string;
	colorWarning: string;
	fontBody: string;
	fontDisplay: string;
	fontMono: string;
	logoLetter: string;
	poweredByLabel: string;
	radiusButton: string;
	radiusCard: string;
	subdomainLabel: string;
}

export interface BrokerTrustMetric {
	detail?: string;
	id: string;
	label: string;
	value: string;
}

export interface BrokerHowItWorksStep {
	description: string;
	id: string;
	label: string;
}

export interface BrokerSectionContent {
	body: string;
	heading: string;
}

export interface BrokerHeroContent {
	activeListingsLabel: string;
	headline: string;
	previewBody: string;
	previewEyebrow: string;
	previewHighlights: string[];
	previewTitle: string;
	primaryCtaLabel: string;
	secondaryCtaLabel: string;
	subheadline: string;
}

export interface BrokerAuthOption {
	buttonLabel: string;
	description: string;
	id: Exclude<BrokerAuthIntent, "none">;
	label: string;
	title: string;
}

export interface BrokerListingSummary {
	amountLabel: string;
	id: string;
	location: string;
	ltvLabel: string;
	positionLabel: string;
	propertyType: string;
	rateLabel: string;
	statusLabel: string;
	statusTone: BrokerListingStatusTone;
	summary: string;
	termLabel: string;
	title: string;
}

export interface BrokerBorrowerPreApprovalContent {
	addressLabel: string;
	addressPlaceholder: string;
	amountLabel: string;
	amountPlaceholder: string;
	body: string;
	emailLabel: string;
	eyebrow: string;
	fullNameLabel: string;
	heading: string;
	phoneLabel: string;
	submitLabel: string;
	successBody: string;
	successTitle: string;
	validationMessage: string;
}

export interface BrokerLandingContent {
	about: BrokerSectionContent;
	authOptions: BrokerAuthOption[];
	borrowerPreApproval: BrokerBorrowerPreApprovalContent;
	contact: BrokerSectionContent;
	featuredListings: BrokerListingSummary[];
	hero: BrokerHeroContent;
	howItWorks: BrokerHowItWorksStep[];
	trustMetrics: BrokerTrustMetric[];
}

export interface BrokerValuePoint {
	description: string;
	id: string;
	title: string;
}

export interface BrokerStatCallout {
	id: string;
	label: string;
	value: string;
}

export interface BrokerOnboardingFieldSet {
	accreditedInvestor: string;
	brokerageName: string;
	city: string;
	email: string;
	experienceLevel: string;
	firstName: string;
	lastName: string;
	mortgageAmount: string;
	notes: string;
	phone: string;
	propertyCity: string;
	propertyType: string;
	targetAllocation: string;
	timeline: string;
}

export interface BrokerOnboardingDraft {
	currentStep: number;
	fields: BrokerOnboardingFieldSet;
	intent: BrokerAuthIntent;
	isSubmitted: boolean;
}

/** Landing-page mortgage application demo (Paper “Mortgage Application Form” layout). */
export interface MortgageApplicationFieldSet {
	amortizationYears: string;
	annualGrossIncome: string;
	creditCheckConsent: boolean;
	documentNotes: string;
	employerName: string;
	employmentStatus: string;
	estimatedPropertyValue: string;
	mortgageAmount: string;
	otherIncomeAmount: string;
	otherIncomeSources: string;
	paymentFrequency: string;
	propertyAddress: string;
	propertyType: string;
	yearsAtEmployer: string;
}

export interface MortgageApplicationDraft {
	currentStep: number;
	fields: MortgageApplicationFieldSet;
	isSubmitted: boolean;
}

export interface BrokerWhiteLabelState {
	content: BrokerLandingContent;
	currentIntent: BrokerAuthIntent;
	listings: BrokerListingSummary[];
	mortgageApplication: MortgageApplicationDraft;
	onboarding: BrokerOnboardingDraft;
	sourceListingId?: string;
	theme: BrokerThemeConfig;
}
