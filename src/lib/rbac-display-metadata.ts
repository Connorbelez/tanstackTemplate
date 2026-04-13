/**
 * Static display metadata for roles and permissions.
 * Maps role/permission slugs to human-readable labels, descriptions, icons, and colors
 * for use in stakeholder-facing demo pages.
 */

import type { PermissionDisplayMeta } from "../../convex/auth/permissionCatalog";
import { PERMISSION_DISPLAY_METADATA as CANONICAL_PERMISSION_DISPLAY_METADATA } from "../../convex/auth/permissionCatalog";

export type { PermissionDisplayMeta } from "../../convex/auth/permissionCatalog";

export const PERMISSION_DISPLAY_METADATA: Record<
	string,
	PermissionDisplayMeta
> = CANONICAL_PERMISSION_DISPLAY_METADATA;

export interface RoleDisplayMeta {
	color: string;
	description: string;
	icon: string;
	label: string;
}

export const ROLE_DISPLAY_METADATA: Record<string, RoleDisplayMeta> = {
	admin: {
		label: "Administrator",
		description:
			"Full platform control — manages users, orgs, roles, and system settings",
		icon: "Shield",
		color: "red",
	},
	broker: {
		label: "Mortgage Broker",
		description:
			"Creates applications, manages offers, and services mortgages for borrowers",
		icon: "Briefcase",
		color: "blue",
	},
	lender: {
		label: "Lender / Investor",
		description:
			"Views marketplace listings, invests in fractions, and manages portfolio",
		icon: "Landmark",
		color: "green",
	},
	borrower: {
		label: "Borrower",
		description:
			"Submits documents, views own mortgage and payments, signs agreements",
		icon: "User",
		color: "purple",
	},
	lawyer: {
		label: "Lawyer",
		description:
			"Reviews deals and provides legal oversight during transactions",
		icon: "Scale",
		color: "amber",
	},
	jr_underwriter: {
		label: "Junior Underwriter",
		description:
			"Claims packages from queue, reviews conditions, submits recommendations",
		icon: "ClipboardCheck",
		color: "sky",
	},
	underwriter: {
		label: "Underwriter",
		description:
			"Full underwriting authority — decides outcomes and reviews junior decisions",
		icon: "FileSearch",
		color: "indigo",
	},
	sr_underwriter: {
		label: "Senior Underwriter",
		description:
			"Manages queue policies, reassigns claims, reviews sampled decisions",
		icon: "Crown",
		color: "violet",
	},
	member: {
		label: "Member",
		description:
			"Default role after sign-up — can access onboarding to request a role",
		icon: "UserPlus",
		color: "gray",
	},
};

export const PERMISSION_DOMAINS = Object.entries(
	PERMISSION_DISPLAY_METADATA
).reduce<Record<string, string[]>>((acc, [slug, meta]) => {
	if (!acc[meta.domain]) {
		acc[meta.domain] = [];
	}
	acc[meta.domain].push(slug);
	return acc;
}, {});

export const DOMAIN_LABELS: Record<string, string> = {
	access: "Route Access",
	onboarding: "Onboarding",
	platform: "Platform Admin",
	application: "Applications",
	underwriting: "Underwriting",
	offer: "Offers",
	condition: "Conditions",
	mortgage: "Mortgages",
	payment: "Payments",
	document: "Documents",
	listing: "Marketplace",
	portfolio: "Portfolio",
	deal: "Deals",
	cash_ledger: "Cash Ledger",
	ledger: "Ledger",
	accrual: "Accruals",
	dispersal: "Dispersals",
	obligation: "Obligations",
	renewal: "Renewals",
};

export const DOMAIN_COLORS: Record<string, { bg: string; text: string }> = {
	access: { bg: "bg-slate-100", text: "text-slate-700" },
	onboarding: { bg: "bg-emerald-100", text: "text-emerald-700" },
	platform: { bg: "bg-red-100", text: "text-red-700" },
	application: { bg: "bg-blue-100", text: "text-blue-700" },
	underwriting: { bg: "bg-indigo-100", text: "text-indigo-700" },
	offer: { bg: "bg-amber-100", text: "text-amber-700" },
	condition: { bg: "bg-orange-100", text: "text-orange-700" },
	mortgage: { bg: "bg-teal-100", text: "text-teal-700" },
	payment: { bg: "bg-cyan-100", text: "text-cyan-700" },
	document: { bg: "bg-purple-100", text: "text-purple-700" },
	listing: { bg: "bg-lime-100", text: "text-lime-700" },
	portfolio: { bg: "bg-green-100", text: "text-green-700" },
	deal: { bg: "bg-sky-100", text: "text-sky-700" },
	cash_ledger: { bg: "bg-stone-100", text: "text-stone-700" },
	ledger: { bg: "bg-yellow-100", text: "text-yellow-700" },
	accrual: { bg: "bg-fuchsia-100", text: "text-fuchsia-700" },
	dispersal: { bg: "bg-pink-100", text: "text-pink-700" },
	obligation: { bg: "bg-rose-100", text: "text-rose-700" },
	renewal: { bg: "bg-violet-100", text: "text-violet-700" },
};

export const ROLE_COLOR_CLASSES: Record<
	string,
	{ badge: string; bg: string; border: string }
> = {
	red: {
		badge: "bg-red-100 text-red-700 border-red-200",
		bg: "bg-red-50",
		border: "border-red-200",
	},
	blue: {
		badge: "bg-blue-100 text-blue-700 border-blue-200",
		bg: "bg-blue-50",
		border: "border-blue-200",
	},
	green: {
		badge: "bg-green-100 text-green-700 border-green-200",
		bg: "bg-green-50",
		border: "border-green-200",
	},
	purple: {
		badge: "bg-purple-100 text-purple-700 border-purple-200",
		bg: "bg-purple-50",
		border: "border-purple-200",
	},
	amber: {
		badge: "bg-amber-100 text-amber-700 border-amber-200",
		bg: "bg-amber-50",
		border: "border-amber-200",
	},
	sky: {
		badge: "bg-sky-100 text-sky-700 border-sky-200",
		bg: "bg-sky-50",
		border: "border-sky-200",
	},
	indigo: {
		badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
		bg: "bg-indigo-50",
		border: "border-indigo-200",
	},
	violet: {
		badge: "bg-violet-100 text-violet-700 border-violet-200",
		bg: "bg-violet-50",
		border: "border-violet-200",
	},
	gray: {
		badge: "bg-gray-100 text-gray-700 border-gray-200",
		bg: "bg-gray-50",
		border: "border-gray-200",
	},
};
