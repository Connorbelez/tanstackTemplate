import { Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { useAuthorization } from "#/lib/auth";
import {
	defaultDocumentAssetName,
	uploadDocumentAsset,
} from "#/lib/documents/uploadDocumentAsset";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { OriginationDocumentClass } from "./document-drafts";

interface DocumentDraftComposerProps {
	caseId: string;
	documentClass: OriginationDocumentClass;
	sourceMode: "static" | "templated";
}

export function DocumentDraftComposer({
	caseId,
	documentClass,
	sourceMode,
}: DocumentDraftComposerProps) {
	const typedCaseId = caseId as Id<"adminOriginationCases">;
	const canReviewDocumentEngine = useAuthorization({
		kind: "permission",
		permission: "document:review",
	}).allowed;
	const templates = useQuery(
		api.admin.origination.caseDocuments.listAttachableTemplates,
		{}
	);
	const templateGroups = useQuery(
		api.admin.origination.caseDocuments.listAttachableTemplateGroups,
		{}
	);
	const generateUploadUrl = useMutation(api.documents.assets.generateUploadUrl);
	const extractPdfMetadata = useAction(api.documents.assets.extractPdfMetadata);
	const createAsset = useMutation(api.documents.assets.create);
	const createStaticDraft = useMutation(
		api.admin.origination.caseDocuments.createStaticDraft
	);
	const attachTemplateVersion = useMutation(
		api.admin.origination.caseDocuments.attachTemplateVersion
	);
	const attachTemplateGroup = useMutation(
		api.admin.origination.caseDocuments.attachTemplateGroup
	);

	const [displayName, setDisplayName] = useState("");
	const [description, setDescription] = useState("");
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const [selectedGroupId, setSelectedGroupId] = useState("");
	const [mode, setMode] = useState<"template" | "template_group">("template");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const publishedTemplates = useMemo(() => templates ?? [], [templates]);

	async function handleStaticUpload() {
		const file = fileRef.current?.files?.[0];
		if (!file) {
			setError("Choose a PDF to upload.");
			return;
		}

		setSubmitting(true);
		setError(null);
		try {
			const resolvedName = displayName.trim() || defaultDocumentAssetName(file);
			if (!resolvedName) {
				throw new Error("Document name is required.");
			}

			const createdAsset = await uploadDocumentAsset(
				{
					createAsset,
					extractPdfMetadata,
					generateUploadUrl,
				},
				{
					description: description.trim() || undefined,
					file,
					name: resolvedName,
				}
			);
			await createStaticDraft({
				assetId: createdAsset.assetId,
				caseId: typedCaseId,
				description: description.trim() || undefined,
				displayName: resolvedName,
				documentClass,
			});
			setDescription("");
			setDisplayName("");
			if (fileRef.current) {
				fileRef.current.value = "";
			}
		} catch (uploadError) {
			setError(
				uploadError instanceof Error ? uploadError.message : "Upload failed"
			);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleTemplateAttach() {
		setSubmitting(true);
		setError(null);
		try {
			if (mode === "template_group") {
				if (!selectedGroupId) {
					throw new Error("Choose a template group.");
				}
				await attachTemplateGroup({
					caseId: typedCaseId,
					documentClass,
					groupId: selectedGroupId as Id<"documentTemplateGroups">,
				});
			} else {
				if (!selectedTemplateId) {
					throw new Error("Choose a template.");
				}
				await attachTemplateVersion({
					caseId: typedCaseId,
					documentClass,
					templateId: selectedTemplateId as Id<"documentTemplates">,
				});
			}
			setSelectedGroupId("");
			setSelectedTemplateId("");
		} catch (attachError) {
			setError(
				attachError instanceof Error
					? attachError.message
					: "Unable to stage templated doc"
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
			{sourceMode === "static" ? (
				<>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor={`${documentClass}-displayName`}>
								Display name
							</Label>
							<Input
								id={`${documentClass}-displayName`}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="Document name"
								value={displayName}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={`${documentClass}-file`}>PDF upload</Label>
							<Input
								accept="application/pdf"
								id={`${documentClass}-file`}
								ref={fileRef}
								type="file"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`${documentClass}-description`}>Description</Label>
						<Textarea
							id={`${documentClass}-description`}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="Optional operator note"
							value={description}
						/>
					</div>
					<Button
						disabled={submitting}
						onClick={handleStaticUpload}
						type="button"
					>
						{submitting ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Uploading
							</>
						) : (
							<>
								<Upload className="mr-2 size-4" />
								Upload static PDF
							</>
						)}
					</Button>
				</>
			) : (
				<>
					<div className="flex flex-wrap gap-2">
						{canReviewDocumentEngine ? (
							<Button asChild size="sm" type="button" variant="outline">
								<Link
									search={EMPTY_ADMIN_DETAIL_SEARCH}
									to="/admin/document-engine/templates"
								>
									Manage templates
								</Link>
							</Button>
						) : null}
						{canReviewDocumentEngine ? (
							<Button asChild size="sm" type="button" variant="outline">
								<Link
									search={EMPTY_ADMIN_DETAIL_SEARCH}
									to="/admin/document-engine/groups"
								>
									Manage groups
								</Link>
							</Button>
						) : null}
						{canReviewDocumentEngine && selectedTemplateId ? (
							<Button asChild size="sm" type="button" variant="outline">
								<Link
									params={{ templateId: selectedTemplateId }}
									search={EMPTY_ADMIN_DETAIL_SEARCH}
									to="/admin/document-engine/designer/$templateId"
								>
									Open designer
								</Link>
							</Button>
						) : null}
					</div>
					<div className="space-y-2">
						<Label>Attach source</Label>
						<Select
							onValueChange={(value) =>
								setMode(value as "template" | "template_group")
							}
							value={mode}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="template">Single template</SelectItem>
								<SelectItem value="template_group">Template group</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{mode === "template" ? (
						<div className="space-y-2">
							<Label>Template</Label>
							<Select
								onValueChange={setSelectedTemplateId}
								value={selectedTemplateId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Choose a published template" />
								</SelectTrigger>
								<SelectContent>
									{publishedTemplates.map((template) => (
										<SelectItem
											key={template.templateId}
											value={template.templateId}
										>
											{template.name}
											{template.currentPublishedVersion
												? ` v${template.currentPublishedVersion}`
												: ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : (
						<div className="space-y-2">
							<Label>Template group</Label>
							<Select
								onValueChange={setSelectedGroupId}
								value={selectedGroupId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Choose a template group" />
								</SelectTrigger>
								<SelectContent>
									{(templateGroups ?? []).map((group) => (
										<SelectItem key={group.groupId} value={group.groupId}>
											{group.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<Button
						disabled={submitting}
						onClick={handleTemplateAttach}
						type="button"
						variant="outline"
					>
						{submitting ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Attaching
							</>
						) : (
							"Attach templated doc"
						)}
					</Button>
				</>
			)}
			{error ? <p className="text-destructive text-sm">{error}</p> : null}
		</div>
	);
}
