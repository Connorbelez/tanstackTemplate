import { useQuery } from "convex/react";
import {
	InteractiveLogsTable,
	type Log,
} from "#/components/ui/interactive-logs-table-shadcnui";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

interface Props {
	entityId?: Id<"demo_gt_entities">;
	outcome?: "transitioned" | "rejected";
}

export function GovernedTransitionsJournalView({ entityId, outcome }: Props) {
	const journal = useQuery(api.demo.governedTransitions.getJournal, {
		entityId,
		outcome,
	});

	const logs: Log[] = (journal ?? []).map((entry) => ({
		id: entry._id,
		timestamp: new Date(entry.timestamp).toISOString(),
		level: (entry.outcome === "rejected" ? "error" : "info") as
			| "info"
			| "error",
		service: entry.source.channel,
		message: `${entry.eventType}: ${entry.previousState} → ${entry.newState}${entry.reason ? ` (${entry.reason})` : ""}`,
		duration: "—",
		status: entry.outcome,
		tags: [
			entry.eventType,
			entry.outcome,
			entry.source.channel,
			...(entry.effectsScheduled ?? []),
		],
	}));

	// Derive stats from the filtered journal data so they match visible rows
	const subtitle = journal
		? (() => {
				const total = journal.length;
				const transitioned = journal.filter(
					(e) => e.outcome === "transitioned"
				).length;
				const rejected = total - transitioned;
				return `${total} total · ${transitioned} transitioned · ${rejected} rejected`;
			})()
		: undefined;

	return (
		<InteractiveLogsTable
			logs={logs}
			subtitle={subtitle}
			title="Transition Journal"
		/>
	);
}
