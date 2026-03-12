import type { Plugin, PropPanel, Schema, UIRenderProps } from "@pdfme/common";
import type { PlatformRole, SignableType } from "../types";

// ── Custom schema for signable (Documenso-bound) fields ─────────
export interface SignableSchema extends Schema {
	fieldKind: "signable";
	fieldLabel?: string;
	platformRole?: string;
	signableType?: string;
}

// ── Signatory color maps (duplicated to avoid cross-layer import) ──
const SIGNATORY_COLORS: Record<string, string> = {
	fairlend_broker: "#d97706",
	lender_lawyer: "#7c3aed",
	lender: "#dc2626",
	seller_lawyer: "#059669",
	borrower_lawyer: "#0891b2",
	borrower: "#2563eb",
};

const SIGNATORY_BG_COLORS: Record<string, string> = {
	fairlend_broker: "#fef3c7",
	lender_lawyer: "#ede9fe",
	lender: "#fee2e2",
	seller_lawyer: "#d1fae5",
	borrower_lawyer: "#cffafe",
	borrower: "#dbeafe",
};

const DEFAULT_COLOR = "#6b7280"; // gray-500
const DEFAULT_BG = "#f3f4f6"; // gray-100

const SIGNABLE_TYPE_LABELS: Record<string, string> = {
	SIGNATURE: "Sig",
	INITIALS: "Init",
	NAME: "Name",
	EMAIL: "Email",
	DATE: "Date",
	TEXT: "Text",
	NUMBER: "Num",
	RADIO: "Radio",
	CHECKBOX: "Check",
	DROPDOWN: "Drop",
};

// ── PDF renderer: no-op for signable fields ─────────────────────
// Documenso handles rendering signable fields — we only place them
// on the PDF as invisible positioning anchors. The actual field
// rendering is done by the signing platform.
function pdf() {
	// No-op: Documenso renders these fields
}

// ── UI renderer: colored overlay with type badge ────────────────
function ui(props: UIRenderProps<SignableSchema>) {
	const { rootElement, schema, mode } = props;

	const role = schema.platformRole as PlatformRole | undefined;
	const borderColor = role
		? (SIGNATORY_COLORS[role] ?? DEFAULT_COLOR)
		: DEFAULT_COLOR;
	const bgColor = role ? (SIGNATORY_BG_COLORS[role] ?? DEFAULT_BG) : DEFAULT_BG;

	const container = document.createElement("div");
	container.style.cssText = `
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		background: ${bgColor};
		border: 1.5px solid ${borderColor};
		border-radius: 2px;
		overflow: hidden;
		box-sizing: border-box;
		cursor: ${mode === "designer" ? "move" : "default"};
	`;

	// Type badge
	const signableType = (schema.signableType as SignableType) ?? "SIGNATURE";
	const badge = document.createElement("span");
	badge.style.cssText = `
		font-size: 9px;
		font-weight: 600;
		color: white;
		background: ${borderColor};
		padding: 1px 4px;
		border-radius: 2px;
		white-space: nowrap;
		user-select: none;
	`;
	badge.textContent = SIGNABLE_TYPE_LABELS[signableType] ?? signableType;

	// Label
	const label = document.createElement("span");
	label.style.cssText = `
		font-size: 10px;
		color: ${borderColor};
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		user-select: none;
	`;
	label.textContent = schema.fieldLabel || signableType;

	container.appendChild(badge);
	container.appendChild(label);
	rootElement.appendChild(container);
}

// ── Property panel: minimal ─────────────────────────────────────
const propPanel: PropPanel<SignableSchema> = {
	schema: {
		signableType: {
			title: "Field Type",
			type: "string",
			widget: "select",
			span: 24,
			props: {
				options: [
					{ label: "Signature", value: "SIGNATURE" },
					{ label: "Initials", value: "INITIALS" },
					{ label: "Name", value: "NAME" },
					{ label: "Email", value: "EMAIL" },
					{ label: "Date", value: "DATE" },
					{ label: "Text", value: "TEXT" },
					{ label: "Number", value: "NUMBER" },
					{ label: "Radio", value: "RADIO" },
					{ label: "Checkbox", value: "CHECKBOX" },
					{ label: "Dropdown", value: "DROPDOWN" },
				],
			},
		},
		fieldLabel: {
			title: "Label",
			type: "string",
			widget: "input",
			span: 24,
		},
	},
	defaultSchema: {
		name: "",
		type: "signableField",
		content: "",
		position: { x: 0, y: 0 },
		width: 40,
		height: 10,
		fieldKind: "signable" as const,
		signableType: "SIGNATURE",
		platformRole: "",
		fieldLabel: "",
	},
};

export const signableFieldPlugin: Plugin<SignableSchema> = {
	pdf,
	ui,
	propPanel,
};
