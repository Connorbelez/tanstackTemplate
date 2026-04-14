import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "#/components/ui/badge";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AdminEntityViewToolbar } from "./AdminEntityViewToolbar";

function ToolbarStory({
	canUseKanban = true,
	kanbanDisabledReason,
}: {
	canUseKanban?: boolean;
	kanbanDisabledReason?: string;
}) {
	return (
		<div className="max-w-5xl rounded-lg border bg-background p-4">
			<AdminEntityViewToolbar
				canUseKanban={canUseKanban}
				description="Shared admin view controls for table and kanban layouts."
				kanbanDisabledReason={kanbanDisabledReason}
				kanbanFieldOptions={[
					{ fieldDefId: "status" as Id<"fieldDefs">, label: "Status" },
					{ fieldDefId: "priority" as Id<"fieldDefs">, label: "Priority" },
				]}
				metaSlot={
					<>
						<Badge variant="secondary">Dedicated adapter</Badge>
						<Badge variant="outline">Saved view</Badge>
						<Badge variant="outline">24 records</Badge>
					</>
				}
				onKanbanFieldChange={() => undefined}
				onViewModeChange={() => undefined}
				selectedKanbanFieldId="status"
				title="Borrowers"
				viewMode="table"
			/>
		</div>
	);
}

const meta = {
	title: "Admin/AdminEntityViewToolbar",
	component: ToolbarStory,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof ToolbarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const KanbanDisabled: Story = {
	args: {
		canUseKanban: false,
		kanbanDisabledReason: "Add a single-select field to unlock kanban layouts.",
	},
};
