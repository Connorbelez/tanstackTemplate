import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	History,
	Loader2,
	Redo2,
	Save,
	Send,
	Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { DocumentSignatoryRoleOption } from "#/lib/document-engine/contracts";
import { setVariableOptions } from "#/lib/document-engine/pdfme-plugins/interpolable-field";
import { setSignatoryOptions } from "#/lib/document-engine/pdfme-plugins/signable-field";
import { fieldConfigsToPdfmeSchemas } from "#/lib/document-engine/pdfme-sync";
import {
	getSignatoryLabel,
	setDocumentEngineRoleOptions,
} from "#/lib/document-engine/signatory-utils";
import type { FieldConfig, SignatoryConfig } from "#/lib/document-engine/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FieldConfigPanel } from "./field-config-panel";
import { PdfDesigner } from "./pdf-designer";
import { SignatoryPanel } from "./signatory-panel";

interface TemplateDesignerWorkspaceProps {
	allowCustomRoles?: boolean;
	backToTemplatesPath:
		| "/admin/document-engine/templates"
		| "/demo/document-engine/templates";
	roleOptions: readonly DocumentSignatoryRoleOption[];
	templateId: string;
}

export function TemplateDesignerWorkspace({
	allowCustomRoles = true,
	backToTemplatesPath,
	roleOptions,
	templateId,
}: TemplateDesignerWorkspaceProps) {
	const template = useQuery(api.documentEngine.templates.get, {
		id: templateId as Id<"documentTemplates">,
	});
	const pdfUrl = useQuery(
		api.documentEngine.basePdfs.getUrl,
		template?.basePdf?.fileRef ? { fileRef: template.basePdf.fileRef } : "skip"
	);
	const variables = useQuery(api.documentEngine.systemVariables.list);
	const pushDraftState = useMutation(
		api.documentEngine.templateTimeline.pushDraftState
	);
	const undoDraft = useMutation(api.documentEngine.templateTimeline.undoDraft);
	const redoDraft = useMutation(api.documentEngine.templateTimeline.redoDraft);
	const publishTemplate = useMutation(api.documentEngine.templates.publish);
	const versions = useQuery(
		api.documentEngine.templateVersions.listByTemplate,
		{
			templateId: templateId as Id<"documentTemplates">,
		}
	);

	const [fields, setFields] = useState<FieldConfig[]>([]);
	const [showHistory, setShowHistory] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [signatories, setSignatories] = useState<SignatoryConfig[]>([]);
	const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const initializedRef = useRef(false);
	useEffect(() => {
		if (template && !initializedRef.current) {
			const draftFields = template.draft.fields as FieldConfig[];
			setFields(draftFields);
			setSignatories(template.draft.signatories as SignatoryConfig[]);
			initializedRef.current = true;
		}
	}, [template]);

	useEffect(() => {
		setDocumentEngineRoleOptions(roleOptions);
		setSignatoryOptions(
			signatories.map((signatory) => ({
				label: getSignatoryLabel(
					signatory.platformRole,
					signatory.label,
					roleOptions
				),
				value: signatory.platformRole,
			}))
		);
	}, [roleOptions, signatories]);

	useEffect(() => {
		if (variables) {
			setVariableOptions(
				variables.map((variable) => ({
					label: `${variable.key} (${variable.type})`,
					value: variable.key,
				}))
			);
		}
	}, [variables]);

	const buildPdfmeSchemaForSave = useCallback(() => {
		const pageCount = template?.basePdf?.pageDimensions.length ?? 1;
		return fieldConfigsToPdfmeSchemas(fields, pageCount);
	}, [fields, template?.basePdf?.pageDimensions.length]);

	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		return () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
			}
		};
	}, []);

	const saveDraft = useCallback(
		(currentFields: FieldConfig[], currentSignatories: SignatoryConfig[]) => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
			}
			saveTimerRef.current = setTimeout(async () => {
				try {
					const pageCount = template?.basePdf?.pageDimensions.length ?? 1;
					await pushDraftState({
						templateId: templateId as Id<"documentTemplates">,
						draft: {
							fields: currentFields,
							pdfmeSchema: fieldConfigsToPdfmeSchemas(currentFields, pageCount),
							signatories: currentSignatories,
						},
					});
					setError(null);
				} catch (saveError) {
					const message =
						saveError instanceof Error ? saveError.message : "Auto-save failed";
					if (
						message.includes("Forbidden") ||
						message.includes("Unauthorized")
					) {
						setError(message);
					}
				}
			}, 500);
		},
		[pushDraftState, template?.basePdf?.pageDimensions.length, templateId]
	);

	const handleFieldsChange = useCallback(
		(newFields: FieldConfig[]) => {
			setFields(newFields);
			saveDraft(newFields, signatories);
		},
		[saveDraft, signatories]
	);

	const handleSignatoriesChange = useCallback(
		(newSignatories: SignatoryConfig[]) => {
			setSignatories(newSignatories);
			saveDraft(fields, newSignatories);
		},
		[fields, saveDraft]
	);

	const handleFieldUpdate = useCallback(
		(updatedField: FieldConfig) => {
			const newFields = fields.map((field) =>
				field.id === updatedField.id ? updatedField : field
			);
			handleFieldsChange(newFields);
		},
		[fields, handleFieldsChange]
	);

	const handleFieldDelete = useCallback(
		(fieldId: string) => {
			const newFields = fields.filter((field) => field.id !== fieldId);
			handleFieldsChange(newFields);
			if (selectedFieldId === fieldId) {
				setSelectedFieldId(null);
			}
		},
		[fields, handleFieldsChange, selectedFieldId]
	);

	const handleManualSave = useCallback(async () => {
		setSaving(true);
		setError(null);
		try {
			await pushDraftState({
				templateId: templateId as Id<"documentTemplates">,
				draft: {
					fields,
					pdfmeSchema: buildPdfmeSchemaForSave(),
					signatories,
				},
			});
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : "Save failed");
		} finally {
			setSaving(false);
		}
	}, [
		buildPdfmeSchemaForSave,
		fields,
		pushDraftState,
		signatories,
		templateId,
	]);

	const handleUndo = useCallback(async () => {
		const result = await undoDraft({
			templateId: templateId as Id<"documentTemplates">,
		});
		if (result) {
			const state = result as {
				fields: FieldConfig[];
				signatories: SignatoryConfig[];
			};
			setFields(state.fields);
			setSignatories(state.signatories);
		}
	}, [templateId, undoDraft]);

	const handleRedo = useCallback(async () => {
		const result = await redoDraft({
			templateId: templateId as Id<"documentTemplates">,
		});
		if (result) {
			const state = result as {
				fields: FieldConfig[];
				signatories: SignatoryConfig[];
			};
			setFields(state.fields);
			setSignatories(state.signatories);
		}
	}, [redoDraft, templateId]);

	const handlePublish = useCallback(async () => {
		setPublishing(true);
		setError(null);
		try {
			await pushDraftState({
				templateId: templateId as Id<"documentTemplates">,
				draft: {
					fields,
					pdfmeSchema: buildPdfmeSchemaForSave(),
					signatories,
				},
			});
			await publishTemplate({
				id: templateId as Id<"documentTemplates">,
			});
		} catch (publishError) {
			setError(
				publishError instanceof Error ? publishError.message : "Publish failed"
			);
		} finally {
			setPublishing(false);
		}
	}, [
		buildPdfmeSchemaForSave,
		fields,
		publishTemplate,
		pushDraftState,
		signatories,
		templateId,
	]);

	const selectedField =
		fields.find((field) => field.id === selectedFieldId) ?? null;
	const availableRoles = signatories.map((signatory) => ({
		label: getSignatoryLabel(
			signatory.platformRole,
			signatory.label,
			roleOptions
		),
		value: signatory.platformRole,
	}));

	if (!template) {
		return (
			<div className="flex items-center justify-center py-20">
				<Loader2 className="size-6 animate-spin" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-4">
				<Link to={backToTemplatesPath}>
					<Button size="icon" variant="ghost">
						<ChevronLeft className="size-4" />
					</Button>
				</Link>
				<div className="min-w-0 flex-1">
					<h2 className="truncate font-semibold text-lg">{template.name}</h2>
					<p className="text-muted-foreground text-xs">
						{template.basePdf?.name} · {fields.length} fields ·{" "}
						{signatories.length} signatories
					</p>
				</div>
				<div className="flex items-center gap-2">
					{template.currentPublishedVersion ? (
						<Badge variant="outline">v{template.currentPublishedVersion}</Badge>
					) : null}
					<Button onClick={handleUndo} size="icon" variant="outline">
						<Undo2 className="size-4" />
					</Button>
					<Button onClick={handleRedo} size="icon" variant="outline">
						<Redo2 className="size-4" />
					</Button>
					<Button
						disabled={saving}
						onClick={handleManualSave}
						variant="outline"
					>
						{saving ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Save className="mr-2 size-4" />
						)}
						Save
					</Button>
					<Button
						disabled={publishing || fields.length === 0}
						onClick={handlePublish}
					>
						{publishing ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Send className="mr-2 size-4" />
						)}
						Publish
					</Button>
				</div>
			</div>

			{error ? (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
					{error}
				</div>
			) : null}

			<div className="flex flex-col gap-3 xl:flex-row xl:items-start">
				<div className="min-w-0 flex-1">
					{pdfUrl && template.basePdf ? (
						<PdfDesigner
							className="h-[calc(100vh-8.5rem)] min-h-[720px] rounded-xl border-border/70 shadow-[0_24px_80px_rgba(8,12,20,0.22)]"
							fields={fields}
							onFieldSelect={setSelectedFieldId}
							onFieldsChange={handleFieldsChange}
							pageDimensions={template.basePdf.pageDimensions}
							pdfUrl={pdfUrl}
						/>
					) : null}
				</div>

				<div
					className={`shrink-0 transition-[width] duration-200 ease-out xl:sticky xl:top-4 ${
						sidebarCollapsed ? "w-full xl:w-14" : "w-full xl:w-[22rem] 2xl:w-96"
					}`}
				>
					<div className="flex h-full flex-col rounded-2xl border border-border/70 bg-background/65 p-2 shadow-[0_18px_40px_rgba(8,12,20,0.18)] backdrop-blur xl:max-h-[calc(100vh-8.5rem)]">
						<div className="flex items-center justify-between gap-2 px-1 pb-2">
							{sidebarCollapsed ? (
								<span className="sr-only">Inspector collapsed</span>
							) : (
								<div className="min-w-0">
									<p className="font-medium text-sm">Inspector</p>
									<p className="text-muted-foreground text-xs">
										Fields, signatories, and version history
									</p>
								</div>
							)}
							<Button
								aria-expanded={!sidebarCollapsed}
								className="shrink-0"
								onClick={() => setSidebarCollapsed((current) => !current)}
								size="icon"
								title={
									sidebarCollapsed ? "Expand inspector" : "Collapse inspector"
								}
								variant="outline"
							>
								{sidebarCollapsed ? (
									<ChevronLeft className="size-4 rotate-180" />
								) : (
									<ChevronRight className="size-4" />
								)}
							</Button>
						</div>

						{sidebarCollapsed ? (
							<div className="flex flex-1 items-center justify-center xl:pt-2">
								<div className="flex flex-col items-center gap-3 text-muted-foreground">
									<Badge className="px-2 py-1 text-[10px]" variant="outline">
										{fields.length}
									</Badge>
									<History className="size-4" />
								</div>
							</div>
						) : (
							<div className="flex-1 space-y-4 overflow-y-auto pr-1">
								<Card>
									<CardHeader className="pb-2">
										<CardTitle className="text-sm">Field Properties</CardTitle>
									</CardHeader>
									<CardContent className="p-0">
										{fields.length > 0 && !selectedField ? (
											<div className="space-y-1 border-b px-4 pb-3">
												<span className="text-muted-foreground text-xs">
													Click a field to edit:
												</span>
												{fields.map((field) => (
													<button
														className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
														key={field.id}
														onClick={() => setSelectedFieldId(field.id)}
														type="button"
													>
														<Badge className="text-[10px]" variant="outline">
															{field.type === "interpolable" ? "var" : "sig"}
														</Badge>
														<span className="truncate">
															{field.label || field.id}
														</span>
													</button>
												))}
											</div>
										) : null}
										{selectedField ? (
											<div className="border-b px-4 pb-2">
												<button
													className="text-muted-foreground text-xs hover:underline"
													onClick={() => setSelectedFieldId(null)}
													type="button"
												>
													&larr; Back to field list
												</button>
											</div>
										) : null}
										<FieldConfigPanel
											availableRoles={availableRoles}
											field={selectedField}
											onDelete={handleFieldDelete}
											onUpdate={handleFieldUpdate}
										/>
									</CardContent>
								</Card>

								<Card>
									<CardHeader className="pb-2">
										<CardTitle className="text-sm">Signatories</CardTitle>
									</CardHeader>
									<CardContent>
										<SignatoryPanel
											allowCustomRoles={allowCustomRoles}
											onChange={handleSignatoriesChange}
											roleOptions={roleOptions}
											signatories={signatories}
										/>
									</CardContent>
								</Card>

								<Card>
									<CardHeader className="pb-2">
										<div
											className="flex cursor-pointer items-center gap-2"
											onClick={() => setShowHistory(!showHistory)}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													setShowHistory(!showHistory);
												}
											}}
											role="button"
											tabIndex={0}
										>
											{showHistory ? (
												<ChevronDown className="size-4" />
											) : (
												<ChevronRight className="size-4" />
											)}
											<History className="size-4" />
											<CardTitle className="text-sm">Version History</CardTitle>
										</div>
									</CardHeader>
									{showHistory ? (
										<CardContent>
											{versions && versions.length === 0 ? (
												<p className="text-muted-foreground text-xs">
													No versions published yet.
												</p>
											) : null}
											<div className="space-y-2">
												{versions?.map((version) => (
													<div
														className="flex items-center justify-between rounded border p-2 text-xs"
														key={version._id}
													>
														<div>
															<span className="font-medium">
																v{version.version}
															</span>
															{version.publishedBy ? (
																<span className="ml-1 text-muted-foreground">
																	by {version.publishedBy}
																</span>
															) : null}
														</div>
														<span className="text-muted-foreground">
															{new Date(
																version.publishedAt
															).toLocaleDateString()}
														</span>
													</div>
												))}
											</div>
										</CardContent>
									) : null}
								</Card>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
