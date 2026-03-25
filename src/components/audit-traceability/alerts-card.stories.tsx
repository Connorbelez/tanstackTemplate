import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertsCard } from "./shared";

const meta = {
	title: "AuditTraceability/AlertsCard",
	component: AlertsCard,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof AlertsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighFailuresOnly: Story = {
	args: { highFailureAlerts: 3, staleAlerts: 0 },
};

export const StaleOnly: Story = {
	args: { highFailureAlerts: 0, staleAlerts: 7 },
};

export const BothAlerts: Story = {
	args: { highFailureAlerts: 2, staleAlerts: 5 },
};

export const NoAlerts: Story = {
	args: { highFailureAlerts: 0, staleAlerts: 0 },
};
