import { useMutation, useQuery } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DocumentDraftComposer } from "./DocumentDraftComposer";
import {
	DocumentDraftList,
	type OriginationDocumentDraftListItem,
} from "./DocumentDraftList";
import {
	ORIGINATION_DOCUMENT_SECTIONS,
	type OriginationDocumentClass,
} from "./document-drafts";
import { OriginationStepCard } from "./OriginationStepCard";

interface DocumentsStepProps {
	caseId: string;
	errors?: readonly string[];
}

function filterDraftsByClass(
	drafts: OriginationDocumentDraftListItem[] | undefined,
	documentClass: OriginationDocumentClass
) {
	return (drafts ?? []).filter((draft) => draft.class === documentClass);
}

export function DocumentsStep({ caseId, errors }: DocumentsStepProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const drafts = useQuery(
		api.admin.origination.caseDocuments.listCaseDocumentDrafts,
		{
			caseId: typedCaseId,
		}
	);
	const archiveDraft = useMutation(
		api.admin.origination.caseDocuments.archiveDraft
	);

	return (
		<OriginationStepCard
			description="Stage immutable public/private PDFs and pin template-backed blueprint inputs before commit. Static public docs project onto the listing; all other classes stay mortgage-owned until later deal-package phases."
			errors={errors}
			title="Documents"
		>
			<div className="grid gap-4 xl:grid-cols-2">
				{ORIGINATION_DOCUMENT_SECTIONS.map((section) => {
					const sectionDrafts = filterDraftsByClass(
						drafts,
						section.documentClass
					);
					return (
						<Card className="border-border/80" key={section.documentClass}>
							<CardHeader className="space-y-1">
								<CardTitle className="text-base">{section.label}</CardTitle>
								<p className="text-muted-foreground text-sm leading-6">
									{section.description}
								</p>
							</CardHeader>
							<CardContent className="space-y-4">
								<DocumentDraftComposer
									caseId={caseId}
									documentClass={section.documentClass}
									sourceMode={section.sourceMode}
								/>
								<DocumentDraftList
									drafts={sectionDrafts}
									onArchive={(draftId) =>
										void archiveDraft({
											draftId: draftId as Id<"originationCaseDocumentDrafts">,
										})
									}
								/>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</OriginationStepCard>
	);
}
