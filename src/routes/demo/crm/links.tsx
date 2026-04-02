import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Link2, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	crmCreateLinkType,
	crmCreateRecordLink,
	crmGetLinkedRecords,
	crmListLinkTypes,
} from "#/components/demo/crm/functionRefs";
import { useRecordSidebar } from "#/components/demo/crm/RecordSidebarProvider";
import { RecordTableSurface } from "#/components/demo/crm/RecordTableSurface";
import type { CrmDemoRecordKind } from "#/components/demo/crm/types";
import { extractCrmErrorMessage } from "#/components/demo/crm/utils";
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
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type ObjectDef = Doc<"objectDefs">;

export const Route = createFileRoute("/demo/crm/links")({
	component: CrmLinksPage,
});

function CrmLinksPage() {
	const objects = useQuery(api.crm.objectDefs.listObjects, {});
	const linkTypes = useQuery(crmListLinkTypes, {});
	const createLinkType = useMutation(crmCreateLinkType);
	const createLink = useMutation(crmCreateRecordLink);
	const { openRecord } = useRecordSidebar();
	const [sourceObjectId, setSourceObjectId] = useState<Id<"objectDefs">>();
	const [targetObjectId, setTargetObjectId] = useState<Id<"objectDefs">>();
	const [selectedSourceRecord, setSelectedSourceRecord] = useState<{
		recordId: string;
		recordKind: CrmDemoRecordKind;
	}>();
	const [selectedTargetRecord, setSelectedTargetRecord] = useState<{
		recordId: string;
		recordKind: CrmDemoRecordKind;
	}>();
	const [selectedLinkTypeId, setSelectedLinkTypeId] =
		useState<Id<"linkTypeDefs">>();
	const [linkTypeName, setLinkTypeName] = useState("");
	const [cardinality, setCardinality] = useState<
		"one_to_one" | "one_to_many" | "many_to_many"
	>("many_to_many");
	const [isCreatingType, setIsCreatingType] = useState(false);
	const [isCreatingLink, setIsCreatingLink] = useState(false);

	const activeObjects = objects ?? [];

	useEffect(() => {
		if (
			sourceObjectId &&
			activeObjects.some((item) => item._id === sourceObjectId)
		) {
			return;
		}

		setSourceObjectId(activeObjects[0]?._id);
	}, [activeObjects, sourceObjectId]);

	useEffect(() => {
		if (
			targetObjectId &&
			activeObjects.some((item) => item._id === targetObjectId) &&
			targetObjectId !== sourceObjectId
		) {
			return;
		}

		const fallbackTarget = activeObjects.find(
			(item) => item._id !== sourceObjectId
		)?._id;
		setTargetObjectId(fallbackTarget ?? activeObjects[0]?._id);
	}, [activeObjects, sourceObjectId, targetObjectId]);

	const sourceObject = activeObjects.find(
		(item) => item._id === sourceObjectId
	);
	const targetObject = activeObjects.find(
		(item) => item._id === targetObjectId
	);

	const compatibleLinkTypes = useMemo(
		() =>
			(linkTypes ?? []).filter(
				(linkType: Doc<"linkTypeDefs">) =>
					linkType.sourceObjectDefId === sourceObjectId &&
					linkType.targetObjectDefId === targetObjectId
			),
		[linkTypes, sourceObjectId, targetObjectId]
	);

	useEffect(() => {
		if (
			selectedLinkTypeId &&
			compatibleLinkTypes.some(
				(item: Doc<"linkTypeDefs">) => item._id === selectedLinkTypeId
			)
		) {
			return;
		}

		setSelectedLinkTypeId(compatibleLinkTypes[0]?._id);
	}, [compatibleLinkTypes, selectedLinkTypeId]);

	const linkedGroups = useQuery(
		crmGetLinkedRecords,
		selectedSourceRecord
			? {
					recordId: selectedSourceRecord.recordId,
					recordKind: selectedSourceRecord.recordKind,
					direction: "both",
				}
			: "skip"
	);

	async function handleCreateLinkType() {
		if (!(sourceObjectId && targetObjectId && linkTypeName.trim())) {
			toast.error("Select source and target objects, then name the link type.");
			return;
		}

		setIsCreatingType(true);
		try {
			const linkTypeId = await createLinkType({
				cardinality,
				name: linkTypeName.trim(),
				sourceObjectDefId: sourceObjectId,
				targetObjectDefId: targetObjectId,
			});
			setSelectedLinkTypeId(linkTypeId);
			setLinkTypeName("");
			toast.success("Created link type.");
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		} finally {
			setIsCreatingType(false);
		}
	}

	async function handleCreateLink() {
		if (!(selectedLinkTypeId && selectedSourceRecord && selectedTargetRecord)) {
			toast.error(
				"Select both records and a link type before creating a link."
			);
			return;
		}

		setIsCreatingLink(true);
		try {
			await createLink({
				linkTypeDefId: selectedLinkTypeId,
				sourceId: selectedSourceRecord.recordId,
				sourceKind: selectedSourceRecord.recordKind,
				targetId: selectedTargetRecord.recordId,
				targetKind: selectedTargetRecord.recordKind,
			});
			toast.success("Created link between the selected records.");
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		} finally {
			setIsCreatingLink(false);
		}
	}

	return (
		<div className="space-y-6">
			<Card className="border-border/70 shadow-sm">
				<CardHeader>
					<div className="flex items-start justify-between gap-4">
						<div>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Link2 className="size-4" />
								Link explorer
							</CardTitle>
							<CardDescription>
								Validate link types and polymorphic links across custom objects
								and native system records from the same CRM sandbox.
							</CardDescription>
						</div>
						<Badge variant="secondary">Chunk 06</Badge>
					</div>
				</CardHeader>
				<CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
					<div className="grid gap-4 md:grid-cols-2">
						<ObjectSelector
							label="Source object"
							objects={activeObjects}
							onChange={(value) => {
								setSourceObjectId(value as Id<"objectDefs">);
								setSelectedSourceRecord(undefined);
							}}
							value={sourceObjectId}
						/>
						<ObjectSelector
							label="Target object"
							objects={activeObjects}
							onChange={(value) => {
								setTargetObjectId(value as Id<"objectDefs">);
								setSelectedTargetRecord(undefined);
							}}
							value={targetObjectId}
						/>
					</div>

					<div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/15 p-4 md:grid-cols-[1fr_0.8fr_auto]">
						<div className="space-y-2">
							<Label htmlFor="crm-link-type-name">New link type</Label>
							<Input
								id="crm-link-type-name"
								onChange={(event) => setLinkTypeName(event.target.value)}
								placeholder="mortgage_to_borrower"
								value={linkTypeName}
							/>
						</div>
						<div className="space-y-2">
							<Label>Cardinality</Label>
							<Select
								onValueChange={(value) =>
									setCardinality(
										value as "one_to_one" | "one_to_many" | "many_to_many"
									)
								}
								value={cardinality}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Cardinality" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="one_to_one">one_to_one</SelectItem>
									<SelectItem value="one_to_many">one_to_many</SelectItem>
									<SelectItem value="many_to_many">many_to_many</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-end">
							<Button disabled={isCreatingType} onClick={handleCreateLinkType}>
								{isCreatingType ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : (
									<Plus className="size-4" />
								)}
								Add type
							</Button>
						</div>
					</div>

					<div className="grid gap-4 rounded-2xl border border-border/70 bg-background/90 p-4 lg:col-span-2 lg:grid-cols-[1fr_auto]">
						<div className="space-y-2">
							<Label>Available link types for this object pair</Label>
							<Select
								onValueChange={(value) =>
									setSelectedLinkTypeId(value as Id<"linkTypeDefs">)
								}
								value={selectedLinkTypeId}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose a link type" />
								</SelectTrigger>
								<SelectContent>
									{compatibleLinkTypes.map((linkType: Doc<"linkTypeDefs">) => (
										<SelectItem key={linkType._id} value={linkType._id}>
											{linkType.name} · {linkType.cardinality}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-end">
							<Button disabled={isCreatingLink} onClick={handleCreateLink}>
								{isCreatingLink ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : (
									<Link2 className="size-4" />
								)}
								Create link
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-6 xl:grid-cols-2">
				<RecordTableSurface
					emptyDescription="Choose a source object and select a row to act as the source side of the relationship."
					emptyTitle="Source records"
					metricNote="Link explorer previews reuse the shared UnifiedRecord table surface."
					metricSource={sourceObject?.isSystem ? "native" : "eav"}
					objectDef={sourceObject}
					onSelectRecord={setSelectedSourceRecord}
					selectedRecordId={selectedSourceRecord?.recordId}
					trackMetrics={false}
				/>
				<RecordTableSurface
					emptyDescription="Choose a target object and select a row to act as the target side of the relationship."
					emptyTitle="Target records"
					metricNote="Link explorer previews reuse the shared UnifiedRecord table surface."
					metricSource={targetObject?.isSystem ? "native" : "eav"}
					objectDef={targetObject}
					onSelectRecord={setSelectedTargetRecord}
					selectedRecordId={selectedTargetRecord?.recordId}
					trackMetrics={false}
				/>
			</div>

			<Card className="border-border/70 shadow-sm">
				<CardHeader>
					<CardTitle className="text-lg">
						Linked records for source selection
					</CardTitle>
					<CardDescription>
						Grouped results come from `crm.linkQueries.getLinkedRecords` so this
						section exercises the same read path the future relation sidebar
						will use.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{selectedSourceRecord ? null : (
						<p className="text-muted-foreground text-sm">
							Select a source record to inspect inbound and outbound links.
						</p>
					)}

					{linkedGroups?.map((group) => (
						<div
							className="rounded-2xl border border-border/70 bg-muted/15 p-4"
							key={`${group.direction}-${group.linkTypeDefId}`}
						>
							<div className="flex items-center gap-2">
								<Badge variant="outline">{group.direction}</Badge>
								<p className="font-medium text-sm">{group.linkTypeName}</p>
								<Badge variant="secondary">{group.links.length}</Badge>
							</div>
							<div className="mt-3 grid gap-2">
								{group.links.map((link) => (
									<button
										className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-left transition-colors hover:bg-background"
										key={link.linkId}
										onClick={() =>
											openRecord({
												labelValue: link.labelValue,
												objectDefId: link.objectDefId,
												recordId: link.recordId,
												recordKind: link.recordKind,
											})
										}
										type="button"
									>
										<p className="font-medium text-sm">
											{link.labelValue ?? link.recordId}
										</p>
										<p className="text-muted-foreground text-xs">
											{link.recordKind} · {link.recordId}
										</p>
									</button>
								))}
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

function ObjectSelector({
	label,
	objects,
	onChange,
	value,
}: {
	label: string;
	objects: ObjectDef[];
	onChange: (value: string) => void;
	value?: Id<"objectDefs">;
}) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Select onValueChange={onChange} value={value}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Choose an object" />
				</SelectTrigger>
				<SelectContent>
					{objects.map((objectDef) => (
						<SelectItem key={objectDef._id} value={objectDef._id}>
							{objectDef.singularLabel} ·{" "}
							{objectDef.isSystem ? "system" : "custom"}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
