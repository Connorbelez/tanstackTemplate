import { useQuery } from "convex/react";
import { CheckCircle, Circle } from "lucide-react";
import {
	N8nWorkflowBlock,
	type WorkflowConnection,
	type WorkflowNode,
} from "#/components/ui/n8n-workflow-block-shadcnui";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const STATE_POSITIONS: Record<string, { x: number; y: number }> = {
	draft: { x: 50, y: 200 },
	submitted: { x: 300, y: 200 },
	under_review: { x: 550, y: 200 },
	approved: { x: 800, y: 100 },
	rejected: { x: 800, y: 300 },
	needs_info: { x: 550, y: 400 },
	funded: { x: 1050, y: 100 },
	closed: { x: 1300, y: 100 },
};

const STATE_COLORS: Record<string, string> = {
	draft: "blue",
	submitted: "indigo",
	under_review: "amber",
	approved: "emerald",
	rejected: "purple",
	needs_info: "amber",
	funded: "emerald",
	closed: "emerald",
};

interface Props {
	highlightEntityId?: Id<"demo_gt_entities"> | null;
}

export function GovernedTransitionsMachineView({ highlightEntityId }: Props) {
	const machineDef = useQuery(
		api.demo.governedTransitions.getMachineDefinition
	);
	const entities = useQuery(api.demo.governedTransitions.listEntities);

	if (!machineDef) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				Loading...
			</p>
		);
	}

	const highlightedEntity = entities?.find((e) => e._id === highlightEntityId);
	const activeNodeId = highlightedEntity ? highlightedEntity.status : undefined;

	// Map states to WorkflowNode format
	const nodes: WorkflowNode[] = machineDef.allStates.map((stateName) => {
		const stateDef = machineDef.states[stateName];
		const isFinal = stateDef?.type === "final";
		const isInitial = machineDef.initial === stateName;

		let nodeType: WorkflowNode["type"] = "action";
		if (isInitial) {
			nodeType = "trigger";
		} else if (isFinal) {
			nodeType = "condition";
		}

		let description = `${Object.keys(stateDef?.on ?? {}).length} transitions`;
		if (isFinal) {
			description = "Terminal state";
		} else if (isInitial) {
			description = "Initial state";
		}

		return {
			id: stateName,
			type: nodeType,
			title: stateName.replace(/_/g, " "),
			description,
			icon: isFinal ? CheckCircle : Circle,
			color: STATE_COLORS[stateName] ?? "blue",
			position: STATE_POSITIONS[stateName] ?? { x: 50, y: 50 },
		};
	});

	// Map transitions to WorkflowConnection format
	const connections: WorkflowConnection[] = [];
	for (const stateName of machineDef.allStates) {
		const stateDef = machineDef.states[stateName];
		if (!stateDef) {
			continue;
		}
		for (const eventDef of Object.values(stateDef.on)) {
			connections.push({ from: stateName, to: eventDef.target });
		}
	}

	return (
		<N8nWorkflowBlock
			activeNodeId={activeNodeId}
			connections={connections}
			nodes={nodes}
			readOnly={true}
			title="Loan Application Lifecycle"
		/>
	);
}
