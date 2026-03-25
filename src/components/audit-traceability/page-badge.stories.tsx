import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageBadge } from "./shared";

const meta = {
	title: "AuditTraceability/PageBadge",
	component: PageBadge,
	parameters: { layout: "centered" },
	tags: ["autodocs"],
} satisfies Meta<typeof PageBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HashChain: Story = {
	args: { action: "audit.viewed.hash-chain" },
};

export const Pipeline: Story = {
	args: { action: "audit.viewed.pipeline" },
};

export const AuditTrail: Story = {
	args: { action: "audit.viewed.audit-trail" },
};

export const Export: Story = {
	args: { action: "audit.viewed.export" },
};
