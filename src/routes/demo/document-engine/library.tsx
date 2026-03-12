import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileText, Trash2 } from "lucide-react";
import { PdfUploadDialog } from "#/components/document-engine/pdf-upload-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/document-engine/library")({
	component: LibraryPage,
});

function LibraryPage() {
	const pdfs = useQuery(api.documentEngine.basePdfs.list);
	const removePdf = useMutation(api.documentEngine.basePdfs.remove);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-semibold text-lg">Base PDF Library</h2>
					<p className="text-muted-foreground text-sm">
						Upload and manage PDF documents used as template bases.
					</p>
				</div>
				<PdfUploadDialog />
			</div>

			{pdfs && pdfs.length === 0 && (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<FileText className="mb-4 size-12 text-muted-foreground" />
						<p className="text-muted-foreground">
							No PDFs uploaded yet. Upload one to get started.
						</p>
					</CardContent>
				</Card>
			)}

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{pdfs?.map((pdf) => (
					<Card key={pdf._id}>
						<CardHeader className="pb-3">
							<div className="flex items-start justify-between">
								<div className="min-w-0 flex-1">
									<CardTitle className="truncate text-base">
										{pdf.name}
									</CardTitle>
									<CardDescription>
										{pdf.pageCount} page{pdf.pageCount !== 1 ? "s" : ""}
										{" · "}
										{(pdf.fileSize / 1024).toFixed(0)} KB
									</CardDescription>
								</div>
								<Button
									onClick={() => removePdf({ id: pdf._id })}
									size="icon"
									variant="ghost"
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-2 text-xs">
								<div className="flex flex-wrap gap-1">
									{pdf.pageDimensions.map((dim) => (
										<Badge key={dim.page} variant="outline">
											p{dim.page + 1}: {Math.round(dim.width)}x
											{Math.round(dim.height)}
										</Badge>
									))}
								</div>
								<p className="truncate font-mono text-muted-foreground">
									SHA: {pdf.fileHash.slice(0, 16)}...
								</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
