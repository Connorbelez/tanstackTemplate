import { useMutation, useQuery } from "convex/react";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { EntityIcon } from "./entity-icon";

// ── Props ────────────────────────────────────────────────────────────

interface AddLinkDialogProps {
	direction: "outbound" | "inbound";
	linkTypeDef: {
		_id: Id<"linkTypeDefs">;
		name: string;
		sourceObjectDefId: Id<"objectDefs">;
		targetObjectDefId: Id<"objectDefs">;
		cardinality: string;
	};
	onOpenChange: (open: boolean) => void;
	open: boolean;
	sourceRecordId: string;
	sourceRecordKind: "record" | "native";
}

// ── Component ────────────────────────────────────────────────────────

export function AddLinkDialog({
	open,
	onOpenChange,
	sourceRecordId,
	sourceRecordKind,
	linkTypeDef,
	direction,
}: AddLinkDialogProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [linking, setLinking] = useState(false);

	// Debounce search input (300ms)
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(searchQuery);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	// Reset state when dialog opens/closes
	useEffect(() => {
		if (!open) {
			setSearchQuery("");
			setDebouncedQuery("");
			setLinking(false);
		}
	}, [open]);

	// Determine which objectDefId to search for candidates
	// If outbound: we're looking for targets → search targetObjectDefId
	// If inbound: we're looking for sources → search sourceObjectDefId
	const candidateObjectDefId =
		direction === "outbound"
			? linkTypeDef.targetObjectDefId
			: linkTypeDef.sourceObjectDefId;
	const candidateObjectDef = useQuery(api.crm.objectDefs.getObject, {
		objectDefId: candidateObjectDefId,
	});

	const searchResults = useQuery(
		api.crm.recordQueries.searchRecords,
		debouncedQuery.trim().length > 0 &&
			candidateObjectDef !== undefined &&
			candidateObjectDef.isSystem !== true
			? {
					objectDefId: candidateObjectDefId,
					query: debouncedQuery.trim(),
					limit: 10,
				}
			: "skip"
	);

	const createLink = useMutation(api.crm.recordLinks.createLink);
	const candidateLabel =
		candidateObjectDef?.pluralLabel ??
		candidateObjectDef?.singularLabel ??
		"records";

	const resultLabelById = useMemo(
		() =>
			new Map(
				(searchResults ?? []).map((record) => [
					record._id,
					getRecordDisplayLabel(record.fields, record._id),
				])
			),
		[searchResults]
	);

	async function handleSelectRecord(
		targetRecordId: string,
		targetRecordKind: "record" | "native"
	) {
		setLinking(true);
		try {
			if (direction === "outbound") {
				await createLink({
					linkTypeDefId: linkTypeDef._id,
					sourceKind: sourceRecordKind,
					sourceId: sourceRecordId,
					targetKind: targetRecordKind,
					targetId: targetRecordId,
				});
			} else {
				// Inbound: the selected record becomes the source, current record is target
				await createLink({
					linkTypeDefId: linkTypeDef._id,
					sourceKind: targetRecordKind,
					sourceId: targetRecordId,
					targetKind: sourceRecordKind,
					targetId: sourceRecordId,
				});
			}
			toast.success(
				`${resultLabelById.get(targetRecordId) ?? "Record"} linked`
			);
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create link";
			toast.error(message);
		} finally {
			setLinking(false);
		}
	}

	const isSearching =
		debouncedQuery.trim().length > 0 && searchResults === undefined;
	const isNativeSearch = candidateObjectDef?.isSystem === true;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add {linkTypeDef.name} link</DialogTitle>
					<DialogDescription>
						Search {candidateLabel.toLowerCase()} to link to this record.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div className="relative">
						<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							disabled={isNativeSearch || linking}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={`Search ${candidateLabel.toLowerCase()}...`}
							value={searchQuery}
						/>
					</div>

					<div className="max-h-60 min-h-[120px] overflow-y-auto rounded-md border">
						{isNativeSearch && (
							<div className="flex h-[120px] flex-col items-center justify-center gap-1 px-4 text-center">
								<p className="font-medium text-sm">
									Search is not available for native objects yet
								</p>
								<p className="text-muted-foreground text-xs">
									{candidateObjectDef?.singularLabel ?? "This object"} must be
									linked from an existing record search flow.
								</p>
							</div>
						)}

						{!isNativeSearch && searchQuery.trim().length === 0 && (
							<div className="flex h-[120px] items-center justify-center">
								<p className="text-muted-foreground text-sm">
									Type to search {candidateLabel.toLowerCase()}
								</p>
							</div>
						)}

						{!isNativeSearch && isSearching && (
							<div className="flex h-[120px] items-center justify-center">
								<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
							</div>
						)}

						{!isNativeSearch &&
							searchResults !== undefined &&
							searchResults.length === 0 && (
								<div className="flex h-[120px] items-center justify-center">
									<p className="text-muted-foreground text-sm">
										No {candidateLabel.toLowerCase()} found
									</p>
								</div>
							)}

						{!isNativeSearch &&
							searchResults !== undefined &&
							searchResults.length > 0 && (
								<div className="divide-y">
									{searchResults.map((record) => (
										<Button
											className="h-auto w-full justify-start rounded-none px-3 py-2"
											disabled={linking}
											key={record._id}
											onClick={() =>
												handleSelectRecord(record._id, record._kind)
											}
											variant="ghost"
										>
											<div className="flex min-w-0 items-center gap-3">
												<EntityIcon
													className="h-4 w-4 shrink-0 text-muted-foreground"
													iconName={candidateObjectDef?.icon}
												/>
												<div className="min-w-0 text-left">
													<p className="truncate font-medium text-sm">
														{resultLabelById.get(record._id) ?? record._id}
													</p>
													<p className="truncate text-muted-foreground text-xs">
														{candidateObjectDef?.singularLabel ?? "Record"}
													</p>
												</div>
											</div>
										</Button>
									))}
								</div>
							)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function getRecordDisplayLabel(
	fields: Record<string, unknown>,
	fallback: string
): string {
	const priorityKeys = ["name", "label", "title"];
	for (const key of priorityKeys) {
		const value = fields[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}

	const firstStringValue = Object.values(fields).find(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0
	);

	return firstStringValue ?? fallback;
}
