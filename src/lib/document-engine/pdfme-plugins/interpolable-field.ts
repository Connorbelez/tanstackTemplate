import type {
	PDFRenderProps,
	Plugin,
	PropPanel,
	Schema,
	UIRenderProps,
} from "@pdfme/common";

// ── Custom schema for interpolable (variable-bound) fields ──────
export interface InterpolableSchema extends Schema {
	fieldKind: "interpolable";
	fieldLabel?: string;
	variableKey?: string;
}

const INTERPOLABLE_COLOR = "#3b82f6"; // blue-500
const INTERPOLABLE_BG = "#dbeafe"; // blue-100

// ── PDF renderer: draw formatted variable value into the field ───
async function pdf(props: PDFRenderProps<InterpolableSchema>) {
	const { schema, value, page, pdfLib } = props;
	if (!value) {
		return;
	}

	const { x, y } = schema.position;
	const { width, height } = schema;
	const fontSize = Math.min(height * 0.6, 12);

	const embeddedFont = await pdfLib.PDFDocument.prototype.embedFont.call(
		page.doc,
		pdfLib.StandardFonts.Helvetica
	);
	page.drawText(value, {
		x,
		y: page.getHeight() - y - height + (height - fontSize) / 2,
		size: fontSize,
		maxWidth: width,
		font: embeddedFont,
		color: pdfLib.rgb(0, 0, 0),
	});
}

// ── UI renderer: show blue-tinted overlay with variable label ────
function ui(props: UIRenderProps<InterpolableSchema>) {
	const { rootElement, schema, mode } = props;

	const container = document.createElement("div");
	container.style.cssText = `
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: ${INTERPOLABLE_BG};
		border: 1.5px solid ${INTERPOLABLE_COLOR};
		border-radius: 2px;
		overflow: hidden;
		box-sizing: border-box;
		cursor: ${mode === "designer" ? "move" : "default"};
	`;

	const label = document.createElement("span");
	label.style.cssText = `
		font-size: 10px;
		font-family: ui-monospace, monospace;
		color: ${INTERPOLABLE_COLOR};
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0 4px;
		user-select: none;
	`;

	const displayText = schema.variableKey
		? `{{${schema.variableKey}}}`
		: schema.fieldLabel || "Interpolable";
	label.textContent = displayText;

	container.appendChild(label);
	rootElement.appendChild(container);
}

// ── Property panel: minimal (position/size handled by pdfme) ────
const propPanel: PropPanel<InterpolableSchema> = {
	schema: {
		variableKey: {
			title: "Variable Key",
			type: "string",
			widget: "input",
			span: 24,
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
		type: "interpolableField",
		content: "",
		position: { x: 0, y: 0 },
		width: 50,
		height: 8,
		fieldKind: "interpolable" as const,
		variableKey: "",
		fieldLabel: "",
	},
};

export const interpolableFieldPlugin: Plugin<InterpolableSchema> = {
	pdf: pdf as Plugin<InterpolableSchema>["pdf"],
	ui,
	propPanel,
};
