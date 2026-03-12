import type { PlatformRole } from "#/lib/document-engine/types";

export const SIGNATORY_COLORS: Record<PlatformRole, string> = {
	fairlend_broker: "#d97706",
	lender_lawyer: "#7c3aed",
	lender: "#dc2626",
	seller_lawyer: "#059669",
	borrower_lawyer: "#0891b2",
	borrower: "#2563eb",
};

export const SIGNATORY_BG_COLORS: Record<PlatformRole, string> = {
	fairlend_broker: "#fef3c7",
	lender_lawyer: "#ede9fe",
	lender: "#fee2e2",
	seller_lawyer: "#d1fae5",
	borrower_lawyer: "#cffafe",
	borrower: "#dbeafe",
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
	fairlend_broker: "FairLend Broker",
	lender_lawyer: "Lender's Lawyer",
	lender: "Lender",
	seller_lawyer: "Seller's Lawyer",
	borrower_lawyer: "Borrower's Lawyer",
	borrower: "Borrower",
};
