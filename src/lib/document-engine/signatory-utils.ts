import {
	DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS,
	type DocumentSignatoryRoleOption,
	findDocumentSignatoryRoleOption,
} from "./contracts";

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

let activeRoleOptions: readonly DocumentSignatoryRoleOption[] =
	DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS;

export function setDocumentEngineRoleOptions(
	roleOptions: readonly DocumentSignatoryRoleOption[]
) {
	activeRoleOptions = roleOptions;
}

export function getSignatoryColor(
	role: string,
	roleOptions: readonly DocumentSignatoryRoleOption[] = activeRoleOptions
): string {
	if (!role) {
		return DEFAULT_COLOR;
	}
	const option = findDocumentSignatoryRoleOption(role, roleOptions);
	if (option) {
		return option.color;
	}
	return CUSTOM_PALETTE[hashIndex(role)].color;
}

export function getSignatoryBgColor(
	role: string,
	roleOptions: readonly DocumentSignatoryRoleOption[] = activeRoleOptions
): string {
	if (!role) {
		return DEFAULT_BG;
	}
	const option = findDocumentSignatoryRoleOption(role, roleOptions);
	if (option) {
		return option.bgColor;
	}
	return CUSTOM_PALETTE[hashIndex(role)].bg;
}

export function getSignatoryLabel(
	role: string,
	customLabel?: string,
	roleOptions: readonly DocumentSignatoryRoleOption[] = activeRoleOptions
): string {
	if (customLabel) {
		return customLabel;
	}
	const option = findDocumentSignatoryRoleOption(role, roleOptions);
	if (option) {
		return option.label;
	}
	if (!role) {
		return "(None)";
	}
	// Title-case: "signatory_1" → "Signatory 1"
	return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
