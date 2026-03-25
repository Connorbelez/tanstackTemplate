import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { GovernedTransitionsMachineView } from "./-components/GovernedTransitionsMachineView";

export const Route = createFileRoute("/demo/governed-transitions/machine")({
	ssr: false,
	component: MachineInspector,
});

/** Rough lifecycle flow order for visual layout */
const STATE_ORDER = [
	"draft",
	"submitted",
	"under_review",
	"approved",
	"rejected",
	"needs_info",
	"funded",
	"closed",
];

function MachineInspector() {
	const machineDef = useQuery(
		api.demo.governedTransitions.getMachineDefinition
	);
	const entities = useQuery(api.demo.governedTransitions.listEntities);
	const [highlightEntityId, setHighlightEntityId] =
		useState<Id<"demo_gt_entities"> | null>(null);

	const highlightedEntity = entities?.find((e) => e._id === highlightEntityId);
	const highlightedState = highlightedEntity?.status ?? null;

	if (!machineDef) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				Loading machine definition...
			</p>
		);
	}

	// Sort states by lifecycle order, putting unknowns at the end
	const orderedStates = [...machineDef.allStates].sort((a, b) => {
		const ai = STATE_ORDER.indexOf(a);
		const bi = STATE_ORDER.indexOf(b);
		return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
	});

	// Build transition table rows
	const transitionRows: Array<{
		fromState: string;
		event: string;
		guard: string;
		toState: string;
		actions: string;
	}> = [];

	for (const stateName of orderedStates) {
		const stateDef = machineDef.states[stateName];
		if (!stateDef) {
			continue;
		}
		for (const [eventName, eventDef] of Object.entries(stateDef.on)) {
			transitionRows.push({
				fromState: stateName,
				event: eventName,
				guard: eventDef.guard ?? "--",
				toState: eventDef.target,
				actions: eventDef.actions?.join(", ") ?? "--",
			});
		}
	}

	return (
		<div className="space-y-8">
			{/* Entity highlight selector */}
			<div className="flex items-center gap-4">
				<p className="font-medium text-muted-foreground text-sm">
					Highlight entity state:
				</p>
				<div className="min-w-[200px]">
					<Select
						onValueChange={(val) =>
							setHighlightEntityId(
								val === "none" ? null : (val as Id<"demo_gt_entities">)
							)
						}
						value={highlightEntityId ?? "none"}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue placeholder="Select entity" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">None</SelectItem>
							{entities?.map((e) => (
								<SelectItem key={e._id} value={e._id}>
									{e.label} ({e.status})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Section 1: State Diagram (using workflow block) */}
			<GovernedTransitionsMachineView highlightEntityId={highlightEntityId} />

			{/* Section 2: Transition Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Transition Table</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>From State</TableHead>
								<TableHead>Event</TableHead>
								<TableHead>Guard</TableHead>
								<TableHead>To State</TableHead>
								<TableHead>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{transitionRows.map((row) => (
								<TableRow
									className={
										highlightedState === row.fromState
											? "bg-green-50 dark:bg-green-950/20"
											: ""
									}
									key={`${row.fromState}-${row.event}`}
								>
									<TableCell className="font-medium">{row.fromState}</TableCell>
									<TableCell className="font-mono text-xs">
										{row.event}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{row.guard}
									</TableCell>
									<TableCell>{row.toState}</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{row.actions}
									</TableCell>
								</TableRow>
							))}
							{transitionRows.length === 0 && (
								<TableRow>
									<TableCell
										className="py-8 text-center text-muted-foreground"
										colSpan={5}
									>
										No transitions defined
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
