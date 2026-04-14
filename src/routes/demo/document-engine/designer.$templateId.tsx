import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowLeft,
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
import { FieldConfigPanel } from "#/components/document-engine/field-config-panel";
import { PdfDesigner } from "#/components/document-engine/pdf-designer";
import { SignatoryPanel } from "#/components/document-engine/signatory-panel";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { setVariableOptions } from "#/lib/document-engine/pdfme-plugins/interpolable-field";
import { setSignatoryOptions } from "#/lib/document-engine/pdfme-plugins/signable-field";
import { fieldConfigsToPdfmeSchemas } from "#/lib/document-engine/pdfme-sync";
import { getSignatoryLabel } from "#/lib/document-engine/signatory-utils";
import type { FieldConfig, SignatoryConfig } from "#/lib/document-engine/types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute(
	"/demo/document-engine/designer/$templateId"
)({
	component: DesignerPage,
});

function DesignerPage() {
	const { templateId } = Route.useParams();
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
		{ templateId: templateId as Id<"documentTemplates"> }
	);

	const [fields, setFields] = useState<FieldConfig[]>([]);
	const [showHistory, setShowHistory] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [signatories, setSignatories] = useState<SignatoryConfig[]>([]);
	const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync local state from template on load (with pdfme migration)
	const initializedRef = useRef(false);
	useEffect(() => {
		if (template && !initializedRef.current) {
			const draftFields = template.draft.fields as FieldConfig[];
			setFields(draftFields);
			setSignatories(template.draft.signatories as SignatoryConfig[]);
			initializedRef.current = true;
		}
	}, [template]);

	// Sync signatory options to pdfme plugin
	useEffect(() => {
		setSignatoryOptions(
			signatories.map((s) => ({
				value: s.platformRole,
				label: getSignatoryLabel(s.platformRole, s.label),
			}))
		);
	}, [signatories]);

	// Sync variable options to pdfme plugin
	useEffect(() => {
		if (variables) {
			setVariableOptions(
				variables.map((v) => ({ value: v.key, label: `${v.key} (${v.type})` }))
			);
		}
	}, [variables]);

	// Build pdfmeSchema from current fields for saving
	const buildPdfmeSchemaForSave = useCallback(() => {
		const pageCount = template?.basePdf?.pageDimensions.length ?? 1;
		return fieldConfigsToPdfmeSchemas(fields, pageCount);
	}, [fields, template?.basePdf?.pageDimensions.length]);

	// Auto-save debounced
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Cleanup auto-save timer on unmount
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
							signatories: currentSignatories,
							pdfmeSchema: fieldConfigsToPdfmeSchemas(currentFields, pageCount),
						},
					});
					setError(null);
				} catch (err) {
					const message =
						err instanceof Error ? err.message : "Auto-save failed";
					// Surface auth/permission errors — they indicate a real problem
					if (
						message.includes("Forbidden") ||
						message.includes("Unauthorized")
					) {
						setError(message);
					}
				}
			}, 500);
		},
		[pushDraftState, templateId, template?.basePdf?.pageDimensions.length]
	);

	const handleFieldsChange = useCallback(
		(newFields: FieldConfig[]) => {
			setFields(newFields);
			saveDraft(newFields, signatories);
		},
		[signatories, saveDraft]
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
			const newFields = fields.map((f) =>
				f.id === updatedField.id ? updatedField : f
			);
			handleFieldsChange(newFields);
		},
		[fields, handleFieldsChange]
	);

	const handleFieldDelete = useCallback(
		(fieldId: string) => {
			const newFields = fields.filter((f) => f.id !== fieldId);
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
					signatories,
					pdfmeSchema: buildPdfmeSchemaForSave(),
				},
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Save failed");
		} finally {
			setSaving(false);
		}
	}, [
		pushDraftState,
		templateId,
		fields,
		signatories,
		buildPdfmeSchemaForSave,
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
	}, [undoDraft, templateId]);

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
			// Save first
			await pushDraftState({
				templateId: templateId as Id<"documentTemplates">,
				draft: {
					fields,
					signatories,
					pdfmeSchema: buildPdfmeSchemaForSave(),
				},
			});
			await publishTemplate({
				id: templateId as Id<"documentTemplates">,
			});
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Publish failed");
		} finally {
			setPublishing(false);
		}
	}, [
		publishTemplate,
		pushDraftState,
		templateId,
		fields,
		signatories,
		buildPdfmeSchemaForSave,
	]);

	const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;
	const availableRoles = signatories.map((s) => ({
		value: s.platformRole,
		label: getSignatoryLabel(s.platformRole, s.label),
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
			{/* Top bar */}
			<div className="flex items-center gap-4">
				<Link to="/demo/document-engine/templates">
					<Button size="icon" variant="ghost">
						<ArrowLeft className="size-4" />
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
					{template.currentPublishedVersion && (
						<Badge variant="outline">v{template.currentPublishedVersion}</Badge>
					)}
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

			{error && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
					{error}
				</div>
			)}

			{/* Main layout: designer + collapsible inspector */}
			<div className="flex flex-col gap-3 xl:flex-row xl:items-start">
				{/* Designer canvas */}
				<div className="min-w-0 flex-1">
					{pdfUrl && template.basePdf && (
						<PdfDesigner
							className="h-[calc(100vh-8.5rem)] min-h-[720px] rounded-xl border-border/70 shadow-[0_24px_80px_rgba(8,12,20,0.22)]"
							fields={fields}
							onFieldSelect={setSelectedFieldId}
							onFieldsChange={handleFieldsChange}
							pageDimensions={template.basePdf.pageDimensions}
							pdfUrl={pdfUrl}
						/>
					)}
				</div>

				{/* Right inspector rail */}
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
										{fields.length > 0 && !selectedField && (
											<div className="space-y-1 border-b px-4 pb-3">
												<span className="text-muted-foreground text-xs">
													Click a field to edit:
												</span>
												{fields.map((f) => (
													<button
														className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
														key={f.id}
														onClick={() => setSelectedFieldId(f.id)}
														type="button"
													>
														<Badge className="text-[10px]" variant="outline">
															{f.type === "interpolable" ? "var" : "sig"}
														</Badge>
														<span className="truncate">{f.label || f.id}</span>
													</button>
												))}
											</div>
										)}
										{selectedField && (
											<div className="border-b px-4 pb-2">
												<button
													className="text-muted-foreground text-xs hover:underline"
													onClick={() => setSelectedFieldId(null)}
													type="button"
												>
													&larr; Back to field list
												</button>
											</div>
										)}
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
											onChange={handleSignatoriesChange}
											signatories={signatories}
										/>
									</CardContent>
								</Card>

								<Card>
									<CardHeader className="pb-2">
										<div
											className="flex cursor-pointer items-center gap-2"
											onClick={() => setShowHistory(!showHistory)}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
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
									{showHistory && (
										<CardContent>
											{versions && versions.length === 0 && (
												<p className="text-muted-foreground text-xs">
													No versions published yet.
												</p>
											)}
											<div className="space-y-2">
												{versions?.map((ver) => (
													<div
														className="flex items-center justify-between rounded border p-2 text-xs"
														key={ver._id}
													>
														<div>
															<span className="font-medium">
																v{ver.version}
															</span>
															{ver.publishedBy && (
																<span className="ml-1 text-muted-foreground">
																	by {ver.publishedBy}
																</span>
															)}
														</div>
														<span className="text-muted-foreground">
															{new Date(ver.publishedAt).toLocaleDateString()}
														</span>
													</div>
												))}
											</div>
										</CardContent>
									)}
								</Card>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
