export type OriginationDocumentClass =
	| "private_static"
	| "private_templated_non_signable"
	| "private_templated_signable"
	| "public_static";

export interface OriginationDocumentSectionDefinition {
	description: string;
	documentClass: OriginationDocumentClass;
	label: string;
	sourceMode: "static" | "templated";
}

export const ORIGINATION_DOCUMENT_SECTIONS: readonly OriginationDocumentSectionDefinition[] =
	[
		{
			description:
				"Public-facing static PDFs that project onto the listing after commit.",
			documentClass: "public_static",
			label: "Public static docs",
			sourceMode: "static",
		},
		{
			description:
				"Private static PDFs retained on the mortgage blueprint set for later deal materialization.",
			documentClass: "private_static",
			label: "Private static docs",
			sourceMode: "static",
		},
		{
			description:
				"Private templated documents that generate later at deal lock without signing.",
			documentClass: "private_templated_non_signable",
			label: "Private templated non-signable docs",
			sourceMode: "templated",
		},
		{
			description:
				"Private templated signable packages pinned now and materialized later into provider-backed envelopes.",
			documentClass: "private_templated_signable",
			label: "Private templated signable docs",
			sourceMode: "templated",
		},
	] as const;

export function getOriginationDocumentSection(
	documentClass: OriginationDocumentClass
) {
	return ORIGINATION_DOCUMENT_SECTIONS.find(
		(section) => section.documentClass === documentClass
	);
}

export function formatOriginationDocumentClass(
	documentClass: OriginationDocumentClass
) {
	return (
		getOriginationDocumentSection(documentClass)?.label ??
		documentClass.replace(/_/g, " ")
	);
}
