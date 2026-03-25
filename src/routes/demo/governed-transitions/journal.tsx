import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { GovernedTransitionsJournalView } from "./-components/GovernedTransitionsJournalView";

export const Route = createFileRoute("/demo/governed-transitions/journal")({
	ssr: false,
	component: JournalViewer,
});

type OutcomeFilter = "all" | "transitioned" | "rejected";

function JournalViewer() {
	const [entityFilter, setEntityFilter] =
		useState<Id<"demo_gt_entities"> | null>(null);
	const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");

	// Fetch journal with the same filters used by GovernedTransitionsJournalView
	// so stats cards stay in sync with visible rows
	const journal = useQuery(api.demo.governedTransitions.getJournal, {
		entityId: entityFilter ?? undefined,
		outcome: outcomeFilter === "all" ? undefined : outcomeFilter,
	});
	const stats = journal
		? {
				total: journal.length,
				transitioned: journal.filter((e) => e.outcome === "transitioned")
					.length,
				rejected: journal.filter((e) => e.outcome === "rejected").length,
			}
		: undefined;
	const entities = useQuery(api.demo.governedTransitions.listEntities);

	return (
		<div className="space-y-6">
			{/* Stats Bar */}
			<div className="grid grid-cols-3 gap-4">
				<Card>
					<CardContent className="pt-4">
						<p className="font-medium text-muted-foreground text-xs">Total</p>
						<p className="font-bold text-2xl">{stats?.total ?? 0}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="font-medium text-green-600 text-xs">Transitioned</p>
						<p className="font-bold text-2xl text-green-600">
							{stats?.transitioned ?? 0}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="font-medium text-red-600 text-xs">Rejected</p>
						<p className="font-bold text-2xl text-red-600">
							{stats?.rejected ?? 0}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Filter Controls */}
			<div className="flex flex-wrap items-center gap-4">
				<div className="min-w-[200px]">
					<Select
						onValueChange={(val) =>
							setEntityFilter(
								val === "all" ? null : (val as Id<"demo_gt_entities">)
							)
						}
						value={entityFilter ?? "all"}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue placeholder="Filter by entity" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Entities</SelectItem>
							{entities?.map((e) => (
								<SelectItem key={e._id} value={e._id}>
									{e.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
					{(["all", "transitioned", "rejected"] as const).map((outcome) => (
						<Button
							className={`h-7 text-xs ${
								outcomeFilter === outcome ? "bg-background shadow-sm" : ""
							}`}
							key={outcome}
							onClick={() => setOutcomeFilter(outcome)}
							size="sm"
							variant={outcomeFilter === outcome ? "default" : "ghost"}
						>
							{outcome.charAt(0).toUpperCase() + outcome.slice(1)}
						</Button>
					))}
				</div>
			</div>

			{/* Journal Table */}
			<GovernedTransitionsJournalView
				entityId={entityFilter ?? undefined}
				outcome={outcomeFilter === "all" ? undefined : outcomeFilter}
			/>
		</div>
	);
}
