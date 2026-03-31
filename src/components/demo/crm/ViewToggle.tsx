import { KanbanSquare, Rows3 } from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { RecordViewMode } from "./types";

interface ViewToggleProps {
	canUseKanban: boolean;
	mode: RecordViewMode;
	onModeChange: (mode: RecordViewMode) => void;
}

export function ViewToggle({
	canUseKanban,
	mode,
	onModeChange,
}: ViewToggleProps) {
	return (
		<div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/30 p-1">
			<Button
				className={cn(
					"rounded-lg border-transparent",
					mode === "table"
						? "bg-background shadow-sm"
						: "bg-transparent shadow-none"
				)}
				onClick={() => onModeChange("table")}
				size="sm"
				variant="ghost"
			>
				<Rows3 className="size-4" />
				Table
			</Button>
			<Button
				className={cn(
					"rounded-lg border-transparent",
					mode === "kanban"
						? "bg-background shadow-sm"
						: "bg-transparent shadow-none"
				)}
				disabled={!canUseKanban}
				onClick={() => onModeChange("kanban")}
				size="sm"
				title={canUseKanban ? "Switch to kanban" : "No kanban view available"}
				variant="ghost"
			>
				<KanbanSquare className="size-4" />
				Kanban
			</Button>
		</div>
	);
}
