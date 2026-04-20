"use client";

import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
import { Input } from "#/components/ui/input";
import { ScrollArea } from "#/components/ui/scroll-area";
import type { AdminRelationNavigationTarget } from "#/lib/admin-relation-navigation";
import { resolveAdminObjectDef } from "#/lib/admin-view-context";
import { cn } from "#/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { useOptionalRecordSidebar } from "./RecordSidebarProvider";

type ObjectDef = Doc<"objectDefs">;

export interface RelatedEntityTarget {
	readonly entityType: string;
	readonly recordId: string;
	readonly recordKind?: "native" | "record";
}

export interface RelatedEntityItem {
	readonly badges?: readonly string[];
	readonly id: string;
	readonly label: string;
	readonly metadata?: string;
	readonly searchText?: string;
	readonly target?: RelatedEntityTarget;
}

export interface RelatedEntityGroup {
	readonly defaultOpen?: boolean;
	readonly description?: string;
	readonly emptyMessage: string;
	readonly items: readonly RelatedEntityItem[];
	readonly searchPlaceholder?: string;
	readonly title: string;
}

interface RelatedEntityExplorerProps {
	readonly groups: readonly RelatedEntityGroup[];
	readonly objectDefs?: readonly ObjectDef[];
	readonly onNavigateRelation?: (target: AdminRelationNavigationTarget) => void;
}

function resolveNavigationTarget(args: {
	item: RelatedEntityItem;
	objectDefs?: readonly ObjectDef[];
}): AdminRelationNavigationTarget | null {
	if (!args.item.target) {
		return null;
	}

	const objectDef = args.objectDefs
		? resolveAdminObjectDef(args.item.target.entityType, args.objectDefs)
		: undefined;
	if (!objectDef) {
		return null;
	}

	return {
		objectDefId: String(objectDef._id),
		recordId: args.item.target.recordId,
		recordKind: args.item.target.recordKind ?? "native",
	};
}

function RelatedEntityGroupSection({
	group,
	objectDefs,
	onNavigateRelation,
}: {
	readonly group: RelatedEntityGroup;
	readonly objectDefs?: readonly ObjectDef[];
	readonly onNavigateRelation?: (target: AdminRelationNavigationTarget) => void;
}) {
	const sidebar = useOptionalRecordSidebar();
	const [open, setOpen] = useState(group.defaultOpen ?? true);
	const [query, setQuery] = useState("");
	const normalizedQuery = query.trim().toLowerCase();
	const visibleItems = group.items.filter((item) => {
		if (normalizedQuery.length === 0) {
			return true;
		}

		const haystack = [
			item.label,
			item.metadata ?? "",
			item.searchText ?? "",
			...(item.badges ?? []),
		]
			.join(" ")
			.toLowerCase();

		return haystack.includes(normalizedQuery);
	});

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<div className="rounded-xl border border-border/70 bg-background/80">
				<CollapsibleTrigger className="w-full" type="button">
					<div className="flex items-start justify-between gap-3 px-4 py-4 text-left">
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<h4 className="font-medium text-sm">{group.title}</h4>
								<Badge variant="secondary">{group.items.length}</Badge>
							</div>
							{group.description ? (
								<p className="text-muted-foreground text-sm">
									{group.description}
								</p>
							) : null}
						</div>
						<div className="mt-0.5 text-muted-foreground">
							{open ? (
								<ChevronDown className="size-4" />
							) : (
								<ChevronRight className="size-4" />
							)}
						</div>
					</div>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="space-y-3 border-border/70 border-t px-4 py-4">
						<div className="relative">
							<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								aria-label={`Search ${group.title}`}
								className="pl-9"
								onChange={(event) => setQuery(event.target.value)}
								placeholder={
									group.searchPlaceholder ??
									`Search ${group.title.toLowerCase()}`
								}
								value={query}
							/>
						</div>

						{visibleItems.length > 0 ? (
							<ScrollArea className="max-h-72 rounded-lg border border-border/60">
								<div className="space-y-2 p-3">
									{visibleItems.map((item) => {
										const navigationTarget = resolveNavigationTarget({
											item,
											objectDefs,
										});
										const isInteractive = navigationTarget !== null;

										return (
											<button
												className={cn(
													"w-full rounded-lg border border-border/60 bg-background px-3 py-3 text-left transition-colors",
													isInteractive &&
														"hover:border-primary/40 hover:bg-muted/30",
													!isInteractive && "cursor-default"
												)}
												disabled={!isInteractive}
												key={item.id}
												onClick={() => {
													if (!navigationTarget) {
														return;
													}

													if (sidebar) {
														sidebar.push({
															entityType: item.target?.entityType,
															objectDefId: navigationTarget.objectDefId,
															recordId: navigationTarget.recordId,
															recordKind: navigationTarget.recordKind,
														});
														return;
													}

													onNavigateRelation?.(navigationTarget);
												}}
												type="button"
											>
												<div className="flex items-start justify-between gap-3">
													<div className="space-y-1">
														<p className="font-medium text-sm">{item.label}</p>
														{item.metadata ? (
															<p className="text-muted-foreground text-sm">
																{item.metadata}
															</p>
														) : null}
													</div>
													<div className="flex shrink-0 flex-col items-end gap-2">
														{item.badges?.length ? (
															<div className="flex flex-wrap justify-end gap-1">
																{item.badges.map((badge) => (
																	<Badge
																		key={`${item.id}-${badge}`}
																		variant="outline"
																	>
																		{badge}
																	</Badge>
																))}
															</div>
														) : null}
														{isInteractive ? (
															<span className="text-primary text-xs">
																Open detail sheet
															</span>
														) : null}
													</div>
												</div>
											</button>
										);
									})}
								</div>
							</ScrollArea>
						) : (
							<div className="rounded-lg border border-border/70 border-dashed px-4 py-6 text-center">
								<p className="text-muted-foreground text-sm">
									{normalizedQuery.length > 0
										? `No ${group.title.toLowerCase()} match "${query.trim()}".`
										: group.emptyMessage}
								</p>
							</div>
						)}
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

export function RelatedEntityExplorer({
	groups,
	objectDefs,
	onNavigateRelation,
}: RelatedEntityExplorerProps) {
	if (groups.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			{groups.map((group) => (
				<RelatedEntityGroupSection
					group={group}
					key={group.title}
					objectDefs={objectDefs}
					onNavigateRelation={onNavigateRelation}
				/>
			))}
		</div>
	);
}
