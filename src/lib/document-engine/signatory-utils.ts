import type { DomainRole } from "./types";
import { isDomainRole } from "./types";

// ── Domain role maps (the known 6) ──────────────────────────────
export const DOMAIN_SIGNATORY_COLORS: Record<DomainRole, string> = {
	fairlend_broker: "#d97706",
	lender_lawyer: "#7c3aed",
	lender: "#dc2626",
	seller_lawyer: "#059669",
	borrower_lawyer: "#0891b2",
	borrower: "#2563eb",
};

export const DOMAIN_SIGNATORY_BG_COLORS: Record<DomainRole, string> = {
	fairlend_broker: "#fef3c7",
	lender_lawyer: "#ede9fe",
	lender: "#fee2e2",
	seller_lawyer: "#d1fae5",
	borrower_lawyer: "#cffafe",
	borrower: "#dbeafe",
};

export const DOMAIN_LABELS: Record<DomainRole, string> = {
	fairlend_broker: "FairLend Broker",
	lender_lawyer: "Lender's Lawyer",
	lender: "Lender",
	seller_lawyer: "Seller's Lawyer",
	borrower_lawyer: "Borrower's Lawyer",
	borrower: "Borrower",
};

// ── Custom signatory palette (for non-domain roles) ─────────────
const CUSTOM_PALETTE: Array<{ color: string; bg: string }> = [
	{ color: "#b91c1c", bg: "#fecaca" },
	{ color: "#a16207", bg: "#fef08a" },
	{ color: "#15803d", bg: "#bbf7d0" },
	{ color: "#0e7490", bg: "#a5f3fc" },
	{ color: "#7e22ce", bg: "#e9d5ff" },
	{ color: "#be185d", bg: "#fbcfe8" },
	{ color: "#0369a1", bg: "#bae6fd" },
	{ color: "#854d0e", bg: "#fde68a" },
];

function hashIndex(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 31 + str.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % CUSTOM_PALETTE.length;
}

// ── Getter functions ────────────────────────────────────────────

const DEFAULT_COLOR = "#6b7280"; // gray-500
const DEFAULT_BG = "#f3f4f6"; // gray-100

export function getSignatoryColor(role: string): string {
	if (isDomainRole(role)) {
		return DOMAIN_SIGNATORY_COLORS[role];
	}
	if (!role) {
		return DEFAULT_COLOR;
	}
	return CUSTOM_PALETTE[hashIndex(role)].color;
}

export function getSignatoryBgColor(role: string): string {
	if (isDomainRole(role)) {
		return DOMAIN_SIGNATORY_BG_COLORS[role];
	}
	if (!role) {
		return DEFAULT_BG;
	}
	return CUSTOM_PALETTE[hashIndex(role)].bg;
}

export function getSignatoryLabel(role: string, customLabel?: string): string {
	if (customLabel) {
		return customLabel;
	}
	if (isDomainRole(role)) {
		return DOMAIN_LABELS[role];
	}
	if (!role) {
		return "(None)";
	}
	// Title-case: "signatory_1" → "Signatory 1"
	return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
