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
	const stats = useQuery(api.demo.governedTransitions.getJournalStats);

	const logs: Log[] = (journal ?? []).map((entry) => ({
		id: entry._id,
		timestamp: new Date(entry.timestamp).toISOString(),
		level: (entry.outcome === "rejected" ? "error" : "info") as
			| "info"
			| "error",
		service: entry.source.channel,
		message: `${entry.eventType}: ${entry.previousState} → ${entry.newState}${entry.reason ? ` (${entry.reason})` : ""}`,
		duration: "",
		status: entry.outcome,
		tags: [
			entry.eventType,
			entry.outcome,
			entry.source.channel,
			...(entry.effectsScheduled ?? []),
		],
	}));

	const subtitle = stats
		? `${stats.total} total · ${stats.transitioned} transitioned · ${stats.rejected} rejected`
		: undefined;

	return (
		<InteractiveLogsTable
			logs={logs}
			subtitle={subtitle}
			title="Transition Journal"
		/>
	);
}
