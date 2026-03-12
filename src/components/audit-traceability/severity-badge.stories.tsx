import type { Meta, StoryObj } from "@storybook/react-vite";
import { SeverityBadge } from "./shared";

const meta = {
	title: "AuditTraceability/SeverityBadge",
	component: SeverityBadge,
	parameters: { layout: "centered" },
	tags: ["autodocs"],
} satisfies Meta<typeof SeverityBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { severity: "info" } };
export const Warning: Story = { args: { severity: "warning" } };
export const ErrorSeverity: Story = { args: { severity: "error" } };
export const Critical: Story = { args: { severity: "critical" } };
