export interface DocumentSignatoryRoleOption {
	bgColor: string;
	color: string;
	label: string;
	value: string;
}

export const DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS = [
	{
		bgColor: "#fef3c7",
		color: "#d97706",
		label: "FairLend Broker",
		value: "fairlend_broker",
	},
	{
		bgColor: "#ede9fe",
		color: "#7c3aed",
		label: "Lender's Lawyer",
		value: "lender_lawyer",
	},
	{
		bgColor: "#fee2e2",
		color: "#dc2626",
		label: "Lender",
		value: "lender",
	},
	{
		bgColor: "#d1fae5",
		color: "#059669",
		label: "Seller's Lawyer",
		value: "seller_lawyer",
	},
	{
		bgColor: "#cffafe",
		color: "#0891b2",
		label: "Borrower's Lawyer",
		value: "borrower_lawyer",
	},
	{
		bgColor: "#dbeafe",
		color: "#2563eb",
		label: "Borrower",
		value: "borrower",
	},
] as const satisfies readonly DocumentSignatoryRoleOption[];

export const MORTGAGE_DOCUMENT_SIGNATORY_ROLE_OPTIONS = [
	{
		bgColor: "#fee2e2",
		color: "#dc2626",
		label: "Primary Lender",
		value: "lender_primary",
	},
	{
		bgColor: "#dbeafe",
		color: "#2563eb",
		label: "Primary Borrower",
		value: "borrower_primary",
	},
	{
		bgColor: "#cffafe",
		color: "#0891b2",
		label: "Co-borrower 1",
		value: "borrower_co_1",
	},
	{
		bgColor: "#ccfbf1",
		color: "#0f766e",
		label: "Co-borrower 2",
		value: "borrower_co_2",
	},
	{
		bgColor: "#fef3c7",
		color: "#d97706",
		label: "Broker of Record",
		value: "broker_of_record",
	},
	{
		bgColor: "#ffedd5",
		color: "#ea580c",
		label: "Assigned Broker",
		value: "assigned_broker",
	},
	{
		bgColor: "#ede9fe",
		color: "#7c3aed",
		label: "Primary Lawyer",
		value: "lawyer_primary",
	},
] as const satisfies readonly DocumentSignatoryRoleOption[];

export const MORTGAGE_DOCUMENT_SIGNATORY_ROLES =
	MORTGAGE_DOCUMENT_SIGNATORY_ROLE_OPTIONS.map((role) => role.value);

export const SUPPORTED_DEAL_DOCUMENT_VARIABLE_KEYS = [
	"assigned_broker_full_name",
	"borrower_co_1_full_name",
	"borrower_co_2_full_name",
	"borrower_primary_email",
	"borrower_primary_full_name",
	"broker_of_record_full_name",
	"lawyer_primary_full_name",
	"listing_description",
	"listing_title",
	"mortgage_amortization_months",
	"mortgage_amount",
	"mortgage_first_payment_date",
	"mortgage_interest_rate",
	"mortgage_lien_position",
	"mortgage_maturity_date",
	"mortgage_payment_amount",
	"mortgage_payment_frequency",
	"mortgage_principal",
	"mortgage_rate_type",
	"mortgage_term_months",
	"mortgage_term_start_date",
	"property_city",
	"property_postal_code",
	"property_province",
	"property_street_address",
	"property_type",
	"property_unit",
	"valuation_date",
	"valuation_value_as_is",
] as const;

export function findDocumentSignatoryRoleOption(
	role: string,
	roleOptions: readonly DocumentSignatoryRoleOption[] = DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS
) {
	return roleOptions.find((option) => option.value === role);
}

export function isSupportedDealDocumentVariableKey(key: string) {
	return (SUPPORTED_DEAL_DOCUMENT_VARIABLE_KEYS as readonly string[]).includes(
		key
	);
}
