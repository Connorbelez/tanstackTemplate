import { useMutation, useQuery } from "convex/react";
import {
	ArrowDownLeft,
	ArrowUpRight,
	ChevronRight,
	Link2,
	Plus,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AddLinkDialog } from "./AddLinkDialog";
import { EntityIcon } from "./entity-icon";

// ── Props ────────────────────────────────────────────────────────────

interface LinkedRecordsPanelProps {
	objectDefId: Id<"objectDefs">;
	onNavigate?: (
		recordId: string,
		recordKind: "record" | "native",
		objectDefId: string
	) => void;
	recordId: string;
	recordKind: "record" | "native";
}

// ── Component ────────────────────────────────────────────────────────

export function LinkedRecordsPanel({
	recordId,
	recordKind,
	objectDefId,
	onNavigate,
}: LinkedRecordsPanelProps) {
	const linkGroups = useQuery(api.crm.linkQueries.getLinkedRecords, {
		recordId,
		recordKind,
		direction: "both",
	});
	const objectDefs = useQuery(api.crm.objectDefs.listObjects);
	const linkTypeDefs = useQuery(api.crm.linkQueries.getLinkTypesForObject, {
		objectDefId,
	});
	const deleteLink = useMutation(api.crm.recordLinks.deleteLink);
	const objectDefMap = new Map(
		(objectDefs ?? []).map((objectDef) => [objectDef._id, objectDef])
	);
	const totalLinks = (linkGroups ?? []).reduce(
		(total, group) => total + group.links.length,
		0
	);

	// Remove confirmation state
	const [pendingRemoveLinkId, setPendingRemoveLinkId] =
		useState<Id<"recordLinks"> | null>(null);
	const [removing, setRemoving] = useState(false);

	// Add link dialog state
	const [addLinkOpen, setAddLinkOpen] = useState(false);
	const [addLinkContext, setAddLinkContext] = useState<{
		linkTypeDefId: Id<"linkTypeDefs">;
		direction: "outbound" | "inbound";
	} | null>(null);

	// Loading state
	if (
		linkGroups === undefined ||
		linkTypeDefs === undefined ||
		objectDefs === undefined
	) {
		return (
			<div className="space-y-3 rounded-lg border p-3">
				<div className="h-5 w-32 animate-pulse rounded bg-muted" />
				<div className="h-5 w-48 animate-pulse rounded bg-muted" />
				<div className="h-5 w-40 animate-pulse rounded bg-muted" />
			</div>
		);
	}

	// ── Handlers ──────────────────────────────────────────────────────

	function handleAddLink(
		linkTypeDefId: Id<"linkTypeDefs">,
		direction: "outbound" | "inbound"
	) {
		setAddLinkContext({ linkTypeDefId, direction });
		setAddLinkOpen(true);
	}

	async function handleConfirmRemove() {
		if (!pendingRemoveLinkId) {
			return;
		}
		setRemoving(true);
		try {
			await deleteLink({ linkId: pendingRemoveLinkId });
			setPendingRemoveLinkId(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to remove link";
			toast.error(message);
		} finally {
			setRemoving(false);
		}
	}

	// Resolve the selected linkTypeDef for the add dialog
	const selectedLinkTypeDef = addLinkContext
		? linkTypeDefs.find((ltd) => ltd._id === addLinkContext.linkTypeDefId)
		: null;

	// ── Empty state ──────────────────────────────────────────────────

	if (linkGroups.length === 0) {
		return (
			<div className="space-y-4 rounded-lg border p-3">
				<PanelHeader totalCount={0} />
				<div className="rounded-md border border-dashed px-4 py-6 text-center">
					<Link2 className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
					<p className="font-medium text-sm">No linked records yet</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Create a relationship to surface related records here.
					</p>
				</div>
				{linkTypeDefs.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{linkTypeDefs.map((ltd) => {
							const isSource =
								(ltd.sourceObjectDefId as string) === (objectDefId as string);
							const direction = isSource ? "outbound" : "inbound";
							return (
								<Button
									key={ltd._id}
									onClick={() => handleAddLink(ltd._id, direction)}
									size="sm"
									variant="outline"
								>
									<Plus className="mr-1 h-3.5 w-3.5" />
									{ltd.name}
								</Button>
							);
						})}
					</div>
				) : (
					<p className="text-muted-foreground text-xs">
						No link types are available for this object yet.
					</p>
				)}
			</div>
		);
	}

	// ── Render groups ────────────────────────────────────────────────

	return (
		<div className="space-y-3 rounded-lg border p-3">
			<PanelHeader totalCount={totalLinks} />
			{linkGroups.map((group) => (
				<LinkGroupSection
					direction={group.direction}
					key={`${group.linkTypeDefId}-${group.direction}`}
					links={group.links}
					linkTypeName={group.linkTypeName}
					objectDefMap={objectDefMap}
					onAddLink={() => handleAddLink(group.linkTypeDefId, group.direction)}
					onNavigate={onNavigate}
					onRemoveLink={setPendingRemoveLinkId}
				/>
			))}

			{/* Remove confirmation dialog */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingRemoveLinkId(null);
					}
				}}
				open={pendingRemoveLinkId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove link?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the relationship between these records. The
							records themselves will not be deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={removing}
							onClick={handleConfirmRemove}
						>
							{removing ? "Removing..." : "Remove"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Add link dialog */}
			{selectedLinkTypeDef && addLinkContext && (
				<AddLinkDialog
					direction={addLinkContext.direction}
					linkTypeDef={{
						_id: selectedLinkTypeDef._id,
						name: selectedLinkTypeDef.name,
						sourceObjectDefId: selectedLinkTypeDef.sourceObjectDefId,
						targetObjectDefId: selectedLinkTypeDef.targetObjectDefId,
						cardinality: selectedLinkTypeDef.cardinality,
					}}
					onOpenChange={(open) => {
						setAddLinkOpen(open);
						if (!open) {
							setAddLinkContext(null);
						}
					}}
					open={addLinkOpen}
					sourceRecordId={recordId}
					sourceRecordKind={recordKind}
				/>
			)}
		</div>
	);
}

// ── LinkGroupSection ─────────────────────────────────────────────────

interface LinkGroupSectionProps {
	direction: "outbound" | "inbound";
	links: Array<{
		linkId: Id<"recordLinks">;
		recordId: string;
		recordKind: "record" | "native";
		objectDefId: Id<"objectDefs">;
		labelValue?: string;
	}>;
	linkTypeName: string;
	objectDefMap: Map<
		Id<"objectDefs">,
		{
			_id: Id<"objectDefs">;
			icon: string;
			singularLabel: string;
		}
	>;
	onAddLink: () => void;
	onNavigate?: (
		recordId: string,
		recordKind: "record" | "native",
		objectDefId: string
	) => void;
	onRemoveLink: (linkId: Id<"recordLinks">) => void;
}

function LinkGroupSection({
	linkTypeName,
	direction,
	links,
	objectDefMap,
	onNavigate,
	onRemoveLink,
	onAddLink,
}: LinkGroupSectionProps) {
	const DirectionIcon = direction === "outbound" ? ArrowUpRight : ArrowDownLeft;

	return (
		<Collapsible defaultOpen>
			<div className="flex items-center gap-1">
				<CollapsibleTrigger asChild>
					<Button
						className="h-8 flex-1 justify-start gap-2 px-2"
						size="sm"
						variant="ghost"
					>
						<ChevronRight className="h-3.5 w-3.5 transition-transform data-[state=open]:rotate-90 [[data-state=open]>&]:rotate-90" />
						<DirectionIcon className="h-3.5 w-3.5 text-muted-foreground" />
						<span className="truncate font-medium text-sm">{linkTypeName}</span>
						<Badge className="hidden sm:inline-flex" variant="outline">
							{direction === "outbound" ? "Outbound" : "Inbound"}
						</Badge>
						<Badge className="ml-auto" variant="secondary">
							{links.length}
						</Badge>
					</Button>
				</CollapsibleTrigger>
				<Button
					className="h-7 w-7 shrink-0"
					onClick={onAddLink}
					size="icon"
					variant="ghost"
				>
					<Plus className="h-3.5 w-3.5" />
					<span className="sr-only">Add {linkTypeName} link</span>
				</Button>
			</div>
			<CollapsibleContent>
				<div className="ml-4 space-y-1 border-l pl-3">
					{links.map((link) => (
						<LinkedRecordItem
							key={link.linkId}
							labelValue={link.labelValue}
							linkId={link.linkId}
							objectDef={objectDefMap.get(link.objectDefId)}
							objectDefId={link.objectDefId}
							onNavigate={onNavigate}
							onRemove={onRemoveLink}
							recordId={link.recordId}
							recordKind={link.recordKind}
						/>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

// ── LinkedRecordItem ─────────────────────────────────────────────────

interface LinkedRecordItemProps {
	labelValue?: string;
	linkId: Id<"recordLinks">;
	objectDef?: {
		_id: Id<"objectDefs">;
		icon: string;
		singularLabel: string;
	};
	objectDefId: Id<"objectDefs">;
	onNavigate?: (
		recordId: string,
		recordKind: "record" | "native",
		objectDefId: string
	) => void;
	onRemove: (linkId: Id<"recordLinks">) => void;
	recordId: string;
	recordKind: "record" | "native";
}

function LinkedRecordItem({
	linkId,
	recordId,
	recordKind,
	objectDefId,
	objectDef,
	labelValue,
	onNavigate,
	onRemove,
}: LinkedRecordItemProps) {
	return (
		<div className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/40">
			<button
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
				onClick={() =>
					onNavigate?.(recordId, recordKind, objectDefId as string)
				}
				type="button"
			>
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
					<EntityIcon
						className="h-4 w-4 text-muted-foreground"
						iconName={objectDef?.icon}
					/>
				</div>
				<div className="min-w-0">
					<p className="truncate font-medium text-sm">
						{labelValue || "Untitled"}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{objectDef?.singularLabel ?? recordKind}
					</p>
				</div>
			</button>
			<Badge className="hidden sm:inline-flex" variant="outline">
				{objectDef?.singularLabel ?? recordKind}
			</Badge>
			<button
				aria-label="Remove link"
				className={cn(
					"rounded-sm p-1 opacity-0 transition-opacity hover:bg-muted",
					"focus-visible:opacity-100 group-hover:opacity-100"
				)}
				onClick={() => onRemove(linkId)}
				type="button"
			>
				<Trash2 className="h-3 w-3 text-muted-foreground" />
			</button>
		</div>
	);
}

function PanelHeader({ totalCount }: { totalCount: number }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div>
				<h3 className="font-medium text-sm">Relations</h3>
				<p className="text-muted-foreground text-xs">
					Linked entities for this record
				</p>
			</div>
			<Badge variant="secondary">{totalCount}</Badge>
		</div>
	);
}
