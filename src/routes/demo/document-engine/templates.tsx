import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/document-engine/templates")({
	component: TemplatesPage,
});

function TemplatesPage() {
	const templates = useQuery(api.documentEngine.templates.list);
	const pdfs = useQuery(api.documentEngine.basePdfs.list);
	const createTemplate = useMutation(api.documentEngine.templates.create);
	const removeTemplate = useMutation(api.documentEngine.templates.remove);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [basePdfId, setBasePdfId] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleCreate = useCallback(async () => {
		setError(null);
		try {
			await createTemplate({
				name: name.trim(),
				description: description.trim() || undefined,
				basePdfId: basePdfId as Id<"documentBasePdfs">,
			});
			setDialogOpen(false);
			setName("");
			setDescription("");
			setBasePdfId("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create");
		}
	}, [createTemplate, name, description, basePdfId]);

	function statusBadge(template: NonNullable<typeof templates>[number]) {
		if (!template.currentPublishedVersion) {
			return <Badge variant="secondary">Draft Only</Badge>;
		}
		if (template.hasDraftChanges) {
			return (
				<Badge variant="outline">
					v{template.currentPublishedVersion} · Unpublished Changes
				</Badge>
			);
		}
		return <Badge>Published v{template.currentPublishedVersion}</Badge>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-semibold text-lg">Templates</h2>
					<p className="text-muted-foreground text-sm">
						Create and manage document templates with field placement.
					</p>
				</div>
				<Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
					<DialogTrigger asChild>
						<Button disabled={!pdfs || pdfs.length === 0}>
							<Plus className="mr-2 size-4" />
							New Template
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create Template</DialogTitle>
						</DialogHeader>
						<div className="space-y-4">
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="tpl-name"
								>
									Name
								</label>
								<Input
									id="tpl-name"
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. Loan Agreement"
									value={name}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="tpl-desc"
								>
									Description (optional)
								</label>
								<Textarea
									id="tpl-desc"
									onChange={(e) => setDescription(e.target.value)}
									placeholder="What this template is for..."
									value={description}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="tpl-pdf"
								>
									Base PDF
								</label>
								<Select onValueChange={setBasePdfId} value={basePdfId}>
									<SelectTrigger id="tpl-pdf">
										<SelectValue placeholder="Select a PDF..." />
									</SelectTrigger>
									<SelectContent>
										{pdfs?.map((pdf) => (
											<SelectItem key={pdf._id} value={pdf._id}>
												{pdf.name} ({pdf.pageCount} pages)
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{error && <p className="text-destructive text-sm">{error}</p>}
							<Button
								className="w-full"
								disabled={!(name.trim() && basePdfId)}
								onClick={handleCreate}
							>
								Create Template
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			{templates && templates.length === 0 && (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<FileText className="mb-4 size-12 text-muted-foreground" />
						<p className="text-muted-foreground">
							{pdfs?.length === 0
								? "Upload a base PDF first, then create a template."
								: "No templates yet. Create one to get started."}
						</p>
					</CardContent>
				</Card>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				{templates?.map((template) => (
					<Card key={template._id}>
						<CardHeader className="pb-3">
							<div className="flex items-start justify-between">
								<div className="min-w-0 flex-1">
									<CardTitle className="truncate text-base">
										{template.name}
									</CardTitle>
									{template.description && (
										<CardDescription>{template.description}</CardDescription>
									)}
								</div>
								{statusBadge(template)}
							</div>
						</CardHeader>
						<CardContent>
							<div className="flex items-center justify-between">
								<div className="text-muted-foreground text-xs">
									{template.draft.fields.length} fields ·{" "}
									{template.draft.signatories.length} signatories
								</div>
								<div className="flex gap-2">
									<Link
										params={{ templateId: template._id }}
										to="/demo/document-engine/designer/$templateId"
									>
										<Button size="sm" variant="outline">
											<Pencil className="mr-1 size-3" />
											Design
										</Button>
									</Link>
									<Button
										onClick={() => removeTemplate({ id: template._id })}
										size="icon"
										variant="ghost"
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
