import type { Designer } from "@pdfme/ui";
import { useEffect, useRef } from "react";
import { getDesignerPlugins } from "#/lib/document-engine/pdfme-plugins";
import {
	buildPdfmeTemplate,
	mergePdfmeUpdate,
} from "#/lib/document-engine/pdfme-sync";
import type { FieldConfig } from "#/lib/document-engine/types";

interface PdfDesignerProps {
	className?: string;
	fields: FieldConfig[];
	onFieldSelect: (fieldId: string | null) => void;
	onFieldsChange: (fields: FieldConfig[]) => void;
	pageDimensions: Array<{ page: number; width: number; height: number }>;
	pdfUrl: string;
}

/**
 * WYSIWYG PDF template designer powered by pdfme.
 * Wraps pdfme's imperative Designer class in a React component.
 *
 * @pdfme/ui is dynamically imported to avoid TanStack Start's
 * server-fn Babel transform choking on pdfme's bundled fontkit code.
 */
export function PdfDesigner({
	className,
	pdfUrl,
	fields,
	onFieldsChange,
	onFieldSelect,
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
					labels: {
						interpolableField: "Variable",
						signableField: "Signable",
					},
					icons: {
						interpolableField:
							'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>',
						signableField:
							'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M2.252 13.174C1.633 14.293 3.067 15.19 3.56 14.108c.467-1.023.824-2.164 1.727-2.79.681-.472 1.222.058 1.636.624.735 1.006 1.17 2.262 2.057 3.14.53.525 1.263.337 1.728-.29.41-.552.613-1.259 1.081-1.78.269-.3.613-.147.835.126.37.458.584.998.91 1.486.227.34.541.566.882.283.406-.337.532-.952.907-1.337"/></svg>',
					},
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
			className={`overflow-hidden rounded-md border ${className ?? "h-[700px]"}`}
			data-testid="pdfme-designer"
			ref={containerRef}
		/>
	);
}
