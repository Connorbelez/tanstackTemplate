import type { Designer } from "@pdfme/ui";
import { useEffect, useRef } from "react";
import { getDesignerPlugins } from "#/lib/document-engine/pdfme-plugins";
import {
	buildPdfmeTemplate,
	mergePdfmeUpdate,
} from "#/lib/document-engine/pdfme-sync";
import type { FieldConfig } from "#/lib/document-engine/types";

interface PdfDesignerProps {
	fields: FieldConfig[];
	onFieldSelect: (fieldId: string | null) => void;
	onFieldsChange: (fields: FieldConfig[]) => void;
	pageDimensions: Array<{ page: number; width: number; height: number }>;
	pdfUrl: string;
	selectedFieldId: string | null;
}

/**
 * WYSIWYG PDF template designer powered by pdfme.
 * Wraps pdfme's imperative Designer class in a React component.
 *
 * @pdfme/ui is dynamically imported to avoid TanStack Start's
 * server-fn Babel transform choking on pdfme's bundled fontkit code.
 */
export function PdfDesigner({
	pdfUrl,
	fields,
	onFieldsChange,
	onFieldSelect,
	selectedFieldId: _selectedFieldId,
	pageDimensions,
}: PdfDesignerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const designerRef = useRef<Designer | null>(null);
	// Prevents circular updates: pdfme change → onFieldsChange → updateTemplate → pdfme change...
	const isExternalUpdateRef = useRef(false);
	// Keep latest values in refs so the pdfme callback always sees current state
	const fieldsRef = useRef(fields);
	fieldsRef.current = fields;
	const onFieldsChangeRef = useRef(onFieldsChange);
	onFieldsChangeRef.current = onFieldsChange;
	const onFieldSelectRef = useRef(onFieldSelect);
	onFieldSelectRef.current = onFieldSelect;

	const pageCount = pageDimensions.length || 1;

	// Initialize pdfme Designer on mount (dynamic import to avoid build-time parse issues)
	useEffect(() => {
		const container = containerRef.current;
		if (!(container && pdfUrl)) {
			return;
		}

		let destroyed = false;

		import("@pdfme/ui").then(({ Designer: DesignerClass }) => {
			if (destroyed) {
				return;
			}

			const template = buildPdfmeTemplate(pdfUrl, fieldsRef.current, pageCount);

			const designer = new DesignerClass({
				domContainer: container,
				template,
				plugins: getDesignerPlugins(),
				options: {
					lang: "en",
				},
			});

			designer.onChangeTemplate((newTemplate) => {
				if (isExternalUpdateRef.current) {
					return;
				}
				const newFields = mergePdfmeUpdate(
					fieldsRef.current,
					newTemplate.schemas
				);
				onFieldsChangeRef.current(newFields);
			});

			designerRef.current = designer;
		});

		return () => {
			destroyed = true;
			designerRef.current?.destroy();
			designerRef.current = null;
		};
	}, [pdfUrl, pageCount]);

	// Sync field changes from sidebar back to pdfme
	// (only when the change did NOT originate from pdfme)
	const prevFieldsRef = useRef(fields);
	useEffect(() => {
		const designer = designerRef.current;
		if (!(designer && pdfUrl)) {
			return;
		}

		// Skip if fields reference hasn't changed (same array)
		if (prevFieldsRef.current === fields) {
			return;
		}
		prevFieldsRef.current = fields;

		// Skip if this change came from pdfme's onChangeTemplate
		if (isExternalUpdateRef.current) {
			return;
		}

		isExternalUpdateRef.current = true;
		try {
			const template = buildPdfmeTemplate(pdfUrl, fields, pageCount);
			designer.updateTemplate(template);
		} finally {
			// Use setTimeout to ensure pdfme has finished processing
			setTimeout(() => {
				isExternalUpdateRef.current = false;
			}, 0);
		}
	}, [fields, pdfUrl, pageCount]);

	return (
		<div
			className="h-[700px] overflow-hidden rounded-md border"
			data-testid="pdfme-designer"
			ref={containerRef}
		/>
	);
}
