import { useQuery } from "convex/react";
import { Download, FileText } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface GenerationResult {
	documensoConfig: {
		recipients: Array<{
			name: string;
			email: string;
			role: string;
			signingOrder: number;
			fields: Array<{
				type: string;
				pageNumber: number;
				positionX: number;
				positionY: number;
				width: number;
				height: number;
				required: boolean;
			}>;
		}>;
	} | null;
	missingVariables: string[];
	pdfRef: Id<"_storage"> | null;
	success: boolean;
	templateVersionUsed: number;
}

interface GenerationResultsProps {
	groupResults?: Array<{
		templateId: string;
		success: boolean;
		pdfRef: Id<"_storage"> | null;
		templateVersionUsed: number;
		missingVariables: string[];
		documensoConfig: GenerationResult["documensoConfig"];
	}> | null;
	results: GenerationResult | null;
}

function PdfDownloadLink({ pdfRef }: { pdfRef: Id<"_storage"> }) {
	const url = useQuery(api.documentEngine.basePdfs.getUrl, {
		fileRef: pdfRef,
	});
	if (!url) {
		return null;
	}
	return (
		<a download href={url} rel="noreferrer" target="_blank">
			<Button size="sm" variant="outline">
				<Download className="mr-1 size-3" />
				Download PDF
			</Button>
		</a>
	);
}

export function GenerationResults({
	results,
	groupResults,
}: GenerationResultsProps) {
	if (!(results || groupResults)) {
		return null;
	}

	// Single template result
	if (results) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<FileText className="size-4" />
						Generation Result
						{results.success ? (
							<Badge>Success</Badge>
						) : (
							<Badge variant="destructive">Missing Variables</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{!results.success && results.missingVariables.length > 0 && (
						<div>
							<p className="mb-1 font-medium text-sm">Missing Variables:</p>
							<div className="flex flex-wrap gap-1">
								{results.missingVariables.map((key) => (
									<Badge key={key} variant="outline">
										{key}
									</Badge>
								))}
							</div>
						</div>
					)}

					{results.success && results.pdfRef && (
						<div className="flex items-center gap-4">
							<PdfDownloadLink pdfRef={results.pdfRef} />
							<span className="text-muted-foreground text-xs">
								Template v{results.templateVersionUsed}
							</span>
						</div>
					)}

					{results.success && results.documensoConfig && (
						<div>
							<p className="mb-1 font-medium text-sm">
								Documenso Configuration:
							</p>
							<pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
								{JSON.stringify(results.documensoConfig, null, 2)}
							</pre>
						</div>
					)}
				</CardContent>
			</Card>
		);
	}

	// Group results
	if (groupResults) {
		return (
			<div className="space-y-4">
				{groupResults.map((result, idx) => (
					<Card key={result.templateId}>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-sm">
								Document {idx + 1}
								{result.success ? (
									<Badge>Success</Badge>
								) : (
									<Badge variant="destructive">Failed</Badge>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{result.success && result.pdfRef && (
								<PdfDownloadLink pdfRef={result.pdfRef} />
							)}
							{!result.success && result.missingVariables.length > 0 && (
								<div className="flex flex-wrap gap-1">
									{result.missingVariables.map((key) => (
										<Badge key={key} variant="outline">
											{key}
										</Badge>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	return null;
}
