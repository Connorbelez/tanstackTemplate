import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccessLogContent } from "./shared";

const meta = {
	title: "AuditTraceability/AccessLogContent",
	component: AccessLogContent,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof AccessLogContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.now();

export const WithEntries: Story = {
	args: {
		accessLog: [
			{
				action: "audit.viewed.hash-chain",
				actorId: "user-alice",
				resourceId: "global",
				severity: "info",
				timestamp: now - 60_000,
			},
			{
				action: "audit.viewed.pipeline",
				actorId: "user-bob",
				resourceId: "global",
				severity: "info",
				timestamp: now - 120_000,
			},
			{
				action: "audit.viewed.audit-trail",
				actorId: "user-alice",
				resourceId: "mortgage-123",
				severity: "info",
				timestamp: now - 180_000,
			},
		],
	},
};

export const EmptyState: Story = {
	args: { accessLog: [] },
};

export const Loading: Story = {
	args: { accessLog: undefined },
};

export const EntitySpecific: Story = {
	args: {
		accessLog: [
			{
				action: "audit.viewed.hash-chain",
				actorId: "auditor-1",
				resourceId: "mortgage-456",
				severity: "info",
				timestamp: now - 30_000,
			},
		],
	},
};
