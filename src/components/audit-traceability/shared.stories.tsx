import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusIcon } from "./shared";

// ── StatusIcon ───────────────────────────────────────────────────

const statusIconMeta = {
	title: "AuditTraceability/StatusIcon",
	component: StatusIcon,
	parameters: { layout: "centered" },
	tags: ["autodocs"],
} satisfies Meta<typeof StatusIcon>;

export default statusIconMeta;
type StatusIconStory = StoryObj<typeof statusIconMeta>;

export const Pass: StatusIconStory = { args: { status: "PASS" } };
export const Warn: StatusIconStory = { args: { status: "WARN" } };
export const Fail: StatusIconStory = { args: { status: "FAIL" } };
export const Info: StatusIconStory = { args: { status: "INFO" } };
