import type { Meta, StoryObj } from "@storybook/react-vite";
import { ControlCard } from "./shared";

const meta = {
	title: "AuditTraceability/ControlCard",
	component: ControlCard,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof ControlCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PassStatus: Story = {
	args: {
		title: "Hash Chain Integrity",
		standard: "OSFI B-13 §5 / SOC 2 CC8.1",
		status: "PASS",
		children: (
			<p className="text-sm">All 5 entity chains verified — 42 events total.</p>
		),
	},
};

export const WarnStatus: Story = {
	args: {
		title: "Outbox Delivery Pipeline",
		standard: "OSFI B-13 §3 / SOC 2 CC7.2",
		status: "WARN",
		children: (
			<p className="text-sm">3 stale entries pending for over 5 minutes.</p>
		),
	},
};

export const FailStatus: Story = {
	args: {
		title: "Hash Chain Integrity",
		standard: "OSFI B-13 §5 / SOC 2 CC8.1",
		status: "FAIL",
		children: (
			<p className="text-red-600 text-sm">
				Chain broken at event #7 — hash mismatch detected.
			</p>
		),
	},
};

export const InfoStatus: Story = {
	args: {
		title: "Component Isolation",
		standard: "OSFI B-13 §5 / SOC 2 CC6.1",
		status: "INFO",
		children: (
			<p className="text-muted-foreground text-sm">
				Audit trail runs inside a defineComponent() boundary with isolated
				tables.
			</p>
		),
	},
};
