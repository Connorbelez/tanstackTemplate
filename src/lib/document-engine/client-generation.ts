import { generate } from "@pdfme/generator";
import { getGeneratorPlugins } from "./pdfme-plugins";
import { buildPdfmeTemplate } from "./pdfme-sync";
import type { FieldConfig } from "./types";

/**
 * Verify a PDF's SHA-256 hash matches the expected value.
 * Runs in the browser using Web Crypto API.
 */
export async function verifyPdfHash(
	pdfBytes: ArrayBuffer,
	expectedHash: string
): Promise<void> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", pdfBytes);
	const currentHash = Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	if (currentHash !== expectedHash) {
		throw new Error(
			"PDF integrity check failed: base PDF has been modified since this template version was published"
		);
	}
}

/**
 * Generate an interpolated PDF in the browser using pdfme.
 *
 * Fetches the base PDF, verifies its hash, builds a pdfme template
 * from the field configs, and runs generate() with formatted values.
 * Returns the generated PDF as a Blob ready for upload.
 */
export async function generatePdfInBrowser(opts: {
	basePdfUrl: string;
	basePdfHash: string;
	fields: FieldConfig[];
	formattedValues: Record<string, string>;
	pageCount: number;
}): Promise<Blob> {
	// Fetch the base PDF
	const response = await fetch(opts.basePdfUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch base PDF: ${response.status}`);
	}
	const pdfArrayBuffer = await response.arrayBuffer();

	// Verify integrity
	await verifyPdfHash(pdfArrayBuffer, opts.basePdfHash);

	// Build pdfme template with base PDF bytes
	const template = buildPdfmeTemplate(
		pdfArrayBuffer,
		opts.fields,
		opts.pageCount
	);

	// Build inputs: map field name → formatted value for interpolable fields
	const inputs: Record<string, string> = {};
	for (const field of opts.fields) {
		if (field.type === "interpolable" && field.variableKey) {
			inputs[field.id] = opts.formattedValues[field.variableKey] ?? "";
		}
	}

	// Run pdfme generate in the browser (native environment for fontkit/WASM)
	const result = await generate({
		template,
		inputs: [inputs],
		plugins: getGeneratorPlugins(),
	});

	return new Blob([result], { type: "application/pdf" });
}
