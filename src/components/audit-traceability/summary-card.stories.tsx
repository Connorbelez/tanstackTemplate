import type { Meta, StoryObj } from "@storybook/react-vite";
import { SummaryCard } from "./shared";

const meta = {
	title: "AuditTraceability/SummaryCard",
	component: SummaryCard,
	parameters: { layout: "centered" },
	tags: ["autodocs"],
} satisfies Meta<typeof SummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Entities: Story = {
	args: { label: "Entities", value: 12 },
};

export const AuditEvents: Story = {
	args: { label: "Audit Events", value: 247 },
};

export const ChainsVerified: Story = {
	args: { label: "Chains Verified", value: 8 },
};

export const ChainsFailed: Story = {
	args: { label: "Chains Failed", value: 0 },
};

export const LargeValue: Story = {
	args: { label: "Total Records", value: 1_234_567 },
};
