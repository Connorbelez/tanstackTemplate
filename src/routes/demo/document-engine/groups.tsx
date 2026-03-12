import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FolderOpen, Plus, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { SignatoryPanel } from "#/components/document-engine/signatory-panel";
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
import type {
	DocumentTemplate,
	PlatformRole,
} from "#/lib/document-engine/types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/document-engine/groups")({
	component: GroupsPage,
});

function GroupsPage() {
	const groups = useQuery(api.documentEngine.templateGroups.list);
	const templates = useQuery(api.documentEngine.templates.list);
	const createGroup = useMutation(api.documentEngine.templateGroups.create);
	const removeGroup = useMutation(api.documentEngine.templateGroups.remove);
	const addTemplate = useMutation(
		api.documentEngine.templateGroups.addTemplate
	);
	const removeTemplate = useMutation(
		api.documentEngine.templateGroups.removeTemplate
	);
	const pinVersion = useMutation(api.documentEngine.templateGroups.pinVersion);

	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
	const [addTemplateId, setAddTemplateId] = useState("");

	const handleCreate = useCallback(async () => {
		setError(null);
		try {
			await createGroup({
				name: name.trim(),
				description: description.trim() || undefined,
			});
			setCreateOpen(false);
			setName("");
			setDescription("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create");
		}
	}, [createGroup, name, description]);

	const handleAddTemplate = useCallback(
		async (groupId: Id<"documentTemplateGroups">) => {
			if (!addTemplateId) {
				return;
			}
			setError(null);
			try {
				await addTemplate({
					groupId,
					templateId: addTemplateId as Id<"documentTemplates">,
				});
				setAddTemplateId("");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to add");
			}
		},
		[addTemplate, addTemplateId]
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-semibold text-lg">Template Groups</h2>
					<p className="text-muted-foreground text-sm">
						Group templates for multi-document generation with shared
						signatories.
					</p>
				</div>
				<Dialog onOpenChange={setCreateOpen} open={createOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 size-4" />
							New Group
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create Template Group</DialogTitle>
						</DialogHeader>
						<div className="space-y-4">
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="grp-name"
								>
									Name
								</label>
								<Input
									id="grp-name"
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. Loan Closing Package"
									value={name}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="grp-desc"
								>
									Description (optional)
								</label>
								<Textarea
									id="grp-desc"
									onChange={(e) => setDescription(e.target.value)}
									value={description}
								/>
							</div>
							{error && <p className="text-destructive text-sm">{error}</p>}
							<Button
								className="w-full"
								disabled={!name.trim()}
								onClick={handleCreate}
							>
								Create Group
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			{error && expandedGroupId && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
					{error}
				</div>
			)}

			{groups && groups.length === 0 && (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<FolderOpen className="mb-4 size-12 text-muted-foreground" />
						<p className="text-muted-foreground">
							No groups yet. Create one to bundle templates together.
						</p>
					</CardContent>
				</Card>
			)}

			<div className="space-y-4">
				{groups?.map((group) => {
					const isExpanded = expandedGroupId === group._id;
					const groupTemplateIds = new Set(
						group.templateRefs.map((r) => r.templateId)
					);

					return (
						<Card key={group._id}>
							<CardHeader>
								<div className="flex items-start justify-between">
									{/* biome-ignore lint/a11y/useKeyWithClickEvents: Expandable section toggle */}
									<div
										className="min-w-0 flex-1 cursor-pointer"
										onClick={() =>
											setExpandedGroupId(isExpanded ? null : group._id)
										}
										role="button"
										tabIndex={0}
									>
										<CardTitle className="text-base">{group.name}</CardTitle>
										{group.description && (
											<CardDescription>{group.description}</CardDescription>
										)}
										<div className="mt-1 flex gap-2">
											<Badge variant="secondary">
												{group.templateRefs.length} template
												{group.templateRefs.length !== 1 ? "s" : ""}
											</Badge>
											<Badge variant="outline">
												{group.signatories.length} signator
												{group.signatories.length !== 1 ? "ies" : "y"}
											</Badge>
										</div>
									</div>
									<Button
										onClick={() => removeGroup({ id: group._id })}
										size="icon"
										variant="ghost"
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							</CardHeader>

							{isExpanded && (
								<CardContent className="space-y-4">
									{/* Templates in group */}
									<div>
										<h4 className="mb-2 font-medium text-sm">Templates</h4>
										{group.templateRefs.length === 0 ? (
											<p className="text-muted-foreground text-xs">
												No templates added yet.
											</p>
										) : (
											<div className="space-y-2">
												{group.templateRefs.map((ref) => {
													const tpl = templates?.find(
														(t) => t._id === ref.templateId
													);
													return (
														<div
															className="flex items-center gap-2 rounded border p-2"
															key={ref.templateId}
														>
															<span className="flex-1 text-sm">
																{tpl?.name ?? "Unknown"}
															</span>
															<VersionPinSelector
																groupId={group._id}
																onPin={pinVersion}
																pinnedVersion={
																	ref.pinnedVersion as number | undefined
																}
																templateId={ref.templateId}
															/>
															<Badge variant="outline">#{ref.order + 1}</Badge>
															<Button
																onClick={() =>
																	removeTemplate({
																		groupId: group._id,
																		templateId: ref.templateId,
																	})
																}
																size="icon"
																variant="ghost"
															>
																<X className="size-3" />
															</Button>
														</div>
													);
												})}
											</div>
										)}

										{/* Add template picker */}
										<div className="mt-3 flex gap-2">
											<Select
												onValueChange={setAddTemplateId}
												value={addTemplateId}
											>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue placeholder="Add template..." />
												</SelectTrigger>
												<SelectContent>
													{templates
														?.filter((t) => !groupTemplateIds.has(t._id))
														.map((t) => (
															<SelectItem key={t._id} value={t._id}>
																{t.name}
															</SelectItem>
														))}
												</SelectContent>
											</Select>
											<Button
												disabled={!addTemplateId}
												onClick={() => handleAddTemplate(group._id)}
												size="sm"
												variant="outline"
											>
												<Plus className="size-3" />
											</Button>
										</div>
									</div>

									{/* Signatories (read-only after first template) */}
									{group.signatories.length > 0 && (
										<SignatoryPanel
											onChange={() => {
												/* read-only */
											}}
											readOnly
											signatories={
												group.signatories as Array<{
													platformRole: PlatformRole;
													role: "signatory" | "approver" | "viewer";
													order: number;
												}>
											}
										/>
									)}

									{/* Required Variables (aggregated from group templates) */}
									{group.templateRefs.length > 0 && (
										<RequiredVariables
											templateRefs={group.templateRefs}
											templates={templates}
										/>
									)}
								</CardContent>
							)}
						</Card>
					);
				})}
			</div>
		</div>
	);
}

function VersionPinSelector({
	groupId,
	templateId,
	pinnedVersion,
	onPin,
}: {
	groupId: Id<"documentTemplateGroups">;
	templateId: Id<"documentTemplates">;
	pinnedVersion: number | undefined;
	onPin: (args: {
		groupId: Id<"documentTemplateGroups">;
		templateId: Id<"documentTemplates">;
		pinnedVersion?: number;
	}) => void;
}) {
	const versions = useQuery(
		api.documentEngine.templateVersions.listByTemplate,
		{ templateId }
	);

	if (!versions || versions.length === 0) {
		return <Badge variant="secondary">unpublished</Badge>;
	}

	return (
		<Select
			onValueChange={(val) =>
				onPin({
					groupId,
					templateId,
					pinnedVersion: val === "latest" ? undefined : Number(val),
				})
			}
			value={pinnedVersion?.toString() ?? "latest"}
		>
			<SelectTrigger className="h-7 w-24 text-xs">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="latest">Latest</SelectItem>
				{versions.map((ver) => (
					<SelectItem key={ver.version} value={ver.version.toString()}>
						v{ver.version}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function RequiredVariables({
	templates,
	templateRefs,
}: {
	templates: DocumentTemplate[] | undefined;
	templateRefs: Array<{ templateId: Id<"documentTemplates">; order: number }>;
}) {
	if (!templates) {
		return null;
	}

	const variableKeys = new Set<string>();
	for (const ref of templateRefs) {
		const tpl = templates.find((t) => t._id === ref.templateId);
		if (!tpl) {
			continue;
		}
		for (const field of tpl.draft.fields) {
			if (field.type === "interpolable" && field.variableKey) {
				variableKeys.add(field.variableKey);
			}
		}
	}

	if (variableKeys.size === 0) {
		return null;
	}

	return (
		<div>
			<h4 className="mb-2 font-medium text-sm">Required Variables</h4>
			<div className="flex flex-wrap gap-1">
				{[...variableKeys].sort().map((key) => (
					<Badge key={key} variant="secondary">
						<code className="text-xs">{key}</code>
					</Badge>
				))}
			</div>
		</div>
	);
}
