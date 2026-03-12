import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GenerationResults } from "#/components/document-engine/generation-results";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { generatePdfInBrowser } from "#/lib/document-engine/client-generation";
import { getSignatoryLabel } from "#/lib/document-engine/signatory-utils";
import type { FieldConfig } from "#/lib/document-engine/types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/document-engine/generate")({
	component: GeneratePage,
});

function GeneratePage() {
	const templates = useQuery(api.documentEngine.templates.list);
	const groups = useQuery(api.documentEngine.templateGroups.list);
	const variables = useQuery(api.documentEngine.systemVariables.list);

	const prepareGeneration = useAction(
		api.documentEngine.generation.prepareGeneration
	);
	const getUploadUrl = useMutation(
		api.documentEngine.generation.generateUploadUrl
	);
	const generateFromGroup = useAction(
		api.documentEngine.generation.generateFromGroup
	);

	const [mode, setMode] = useState<"template" | "group">("template");
	const [selectedId, setSelectedId] = useState("");
	const [variableValues, setVariableValues] = useState<Record<string, string>>(
		{}
	);
	const [signatoryMapping, setSignatoryMapping] = useState<
		Array<{ platformRole: string; name: string; email: string }>
	>([]);
	const [generating, setGenerating] = useState(false);
	const [result, setResult] = useState<Record<string, unknown> | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Get the selected template/group to determine required variables and signatories
	const selectedTemplate = templates?.find((t) => t._id === selectedId);
	const selectedGroup = groups?.find((g) => g._id === selectedId);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Collects variables from templates or group
	const requiredKeys: string[] = (() => {
		if (mode === "template" && selectedTemplate) {
			return selectedTemplate.draft.fields
				.filter((f) => f.type === "interpolable" && f.variableKey)
				.map((f) => f.variableKey as string);
		}
		// For groups, collect from all templates
		if (mode === "group" && selectedGroup && templates) {
			const templateIds = new Set(
				selectedGroup.templateRefs.map((r) => r.templateId)
			);
			const keys = new Set<string>();
			for (const tpl of templates) {
				if (templateIds.has(tpl._id)) {
					for (const f of tpl.draft.fields) {
						if (f.type === "interpolable" && f.variableKey) {
							keys.add(f.variableKey);
						}
					}
				}
			}
			return [...keys];
		}
		return [];
	})();

	// Determine signatories
	const signatoryRoles: string[] = (() => {
		if (mode === "template" && selectedTemplate) {
			return selectedTemplate.draft.signatories.map((s) => s.platformRole);
		}
		if (mode === "group" && selectedGroup) {
			return selectedGroup.signatories.map((s) => s.platformRole);
		}
		return [];
	})();

	// Initialize signatory mapping when selection changes
	const signatoryRolesKey = signatoryRoles.join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: signatoryRolesKey tracks when roles change
	useEffect(() => {
		setSignatoryMapping(
			signatoryRoles.map((role) => ({
				platformRole: role,
				name: "",
				email: "",
			}))
		);
	}, [signatoryRolesKey]);

	const publishedTemplates = templates?.filter(
		(t) => t.currentPublishedVersion
	);

	// Client-side generation flow for single templates:
	// 1. Server validates + formats → returns prepared data
	// 2. Browser runs pdfme generate() → produces PDF blob
	// 3. Upload blob to Convex storage → get storage ID
	const handleGenerateTemplate = useCallback(async () => {
		const prepared = await prepareGeneration({
			templateId: selectedId as Id<"documentTemplates">,
			variables: variableValues,
			signatoryMapping,
		});

		if (!prepared.success) {
			setResult({
				success: false,
				missingVariables: prepared.missingVariables,
				pdfRef: null,
				templateVersionUsed: prepared.templateVersionUsed,
				documensoConfig: null,
			});
			return;
		}

		// Generate PDF in the browser with pdfme
		const pdfBlob = await generatePdfInBrowser({
			basePdfUrl: prepared.basePdfUrl,
			basePdfHash: prepared.basePdfHash,
			fields: prepared.fields as FieldConfig[],
			formattedValues: prepared.formattedValues,
			pageCount: prepared.pageDimensions.length,
		});

		// Upload to Convex storage
		const uploadUrl = await getUploadUrl();
		const uploadResponse = await fetch(uploadUrl, {
			method: "POST",
			headers: { "Content-Type": "application/pdf" },
			body: pdfBlob,
		});
		if (!uploadResponse.ok) {
			throw new Error(`Upload failed: ${uploadResponse.status}`);
		}
		const { storageId } = (await uploadResponse.json()) as {
			storageId: Id<"_storage">;
		};

		setResult({
			success: true,
			missingVariables: [],
			pdfRef: storageId,
			templateVersionUsed: prepared.templateVersionUsed,
			documensoConfig: prepared.documensoConfig,
		});
	}, [
		prepareGeneration,
		getUploadUrl,
		selectedId,
		variableValues,
		signatoryMapping,
	]);

	const handleGenerate = useCallback(async () => {
		setGenerating(true);
		setError(null);
		setResult(null);

		try {
			if (mode === "template") {
				await handleGenerateTemplate();
			} else {
				const res = await generateFromGroup({
					groupId: selectedId as Id<"documentTemplateGroups">,
					variables: variableValues,
					signatoryMapping,
				});
				setResult(res as unknown as Record<string, unknown>);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Generation failed");
		} finally {
			setGenerating(false);
		}
	}, [
		mode,
		selectedId,
		variableValues,
		signatoryMapping,
		handleGenerateTemplate,
		generateFromGroup,
	]);

	return (
		<div className="space-y-6">
			<div>
				<h2 className="font-semibold text-lg">Generate Documents</h2>
				<p className="text-muted-foreground text-sm">
					Fill in variables, map signatories, and generate interpolated PDFs
					with Documenso configurations.
				</p>
			</div>

			{/* Mode + selection */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Source</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<Switch
								checked={mode === "group"}
								onCheckedChange={(checked) => {
									setMode(checked ? "group" : "template");
									setSelectedId("");
									setResult(null);
								}}
							/>
							<span className="text-sm">
								{mode === "template" ? "Single Template" : "Template Group"}
							</span>
						</div>
					</div>

					<Select onValueChange={setSelectedId} value={selectedId}>
						<SelectTrigger>
							<SelectValue
								placeholder={
									mode === "template"
										? "Select a published template..."
										: "Select a group..."
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{mode === "template"
								? publishedTemplates?.map((t) => (
										<SelectItem key={t._id} value={t._id}>
											{t.name} (v{t.currentPublishedVersion})
										</SelectItem>
									))
								: groups?.map((g) => (
										<SelectItem key={g._id} value={g._id}>
											{g.name} ({g.templateRefs.length} templates)
										</SelectItem>
									))}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			{/* Variable values */}
			{selectedId && requiredKeys.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Variable Values</CardTitle>
						<CardDescription>
							{requiredKeys.length} variable
							{requiredKeys.length !== 1 ? "s" : ""} required
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{requiredKeys.map((key) => {
							const variable = variables?.find((v) => v.key === key);
							return (
								<div key={key}>
									<div className="mb-1 flex items-center gap-2">
										<label
											className="font-medium text-sm"
											htmlFor={`var-${key}`}
										>
											{variable?.label ?? key}
										</label>
										<Badge variant="outline">
											{variable?.type ?? "string"}
										</Badge>
									</div>
									<Input
										id={`var-${key}`}
										onChange={(e) =>
											setVariableValues((prev) => ({
												...prev,
												[key]: e.target.value,
											}))
										}
										placeholder={`Enter ${key}...`}
										value={variableValues[key] ?? ""}
									/>
								</div>
							);
						})}
					</CardContent>
				</Card>
			)}

			{/* Signatory mapping */}
			{selectedId && signatoryRoles.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Signatory Mapping</CardTitle>
						<CardDescription>
							Map each role to a person's name and email.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{signatoryMapping.map((mapping, idx) => (
							<div
								className="space-y-2 rounded-md border p-3"
								key={mapping.platformRole}
							>
								<Badge>{getSignatoryLabel(mapping.platformRole)}</Badge>
								<div className="grid gap-2 sm:grid-cols-2">
									<Input
										onChange={(e) => {
											const updated = [...signatoryMapping];
											updated[idx] = {
												...mapping,
												name: e.target.value,
											};
											setSignatoryMapping(updated);
										}}
										placeholder="Full name"
										value={mapping.name}
									/>
									<Input
										onChange={(e) => {
											const updated = [...signatoryMapping];
											updated[idx] = {
												...mapping,
												email: e.target.value,
											};
											setSignatoryMapping(updated);
										}}
										placeholder="Email address"
										type="email"
										value={mapping.email}
									/>
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{/* Generate button */}
			{selectedId && (
				<Button
					className="w-full"
					disabled={generating}
					onClick={handleGenerate}
					size="lg"
				>
					{generating ? (
						<>
							<Loader2 className="mr-2 size-4 animate-spin" />
							Generating...
						</>
					) : (
						<>
							<Play className="mr-2 size-4" />
							Generate {mode === "template" ? "Document" : "Document Package"}
						</>
					)}
				</Button>
			)}

			{error && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
					{error}
				</div>
			)}

			{/* Results */}
			{result && "success" in result && (
				<GenerationResults
					results={
						result as unknown as Parameters<
							typeof GenerationResults
						>[0]["results"]
					}
				/>
			)}
			{result && "documents" in result && (
				<GenerationResults
					groupResults={
						(result as { documents: unknown[] }).documents as Parameters<
							typeof GenerationResults
						>[0]["groupResults"]
					}
					results={null}
				/>
			)}
		</div>
	);
}
