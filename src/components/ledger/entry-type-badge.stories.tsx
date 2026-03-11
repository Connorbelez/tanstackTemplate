import type { Meta, StoryObj } from "@storybook/react-vite";
import { EntryTypeBadge } from "./entry-type-badge";

const meta = {
	title: "Ledger/EntryTypeBadge",
	component: EntryTypeBadge,
	parameters: { layout: "centered" },
	tags: ["autodocs"],
} satisfies Meta<typeof EntryTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MortgageMinted: Story = {
	args: { entryType: "MORTGAGE_MINTED" },
};
export const SharesIssued: Story = {
	args: { entryType: "SHARES_ISSUED" },
};
export const SharesTransferred: Story = {
	args: { entryType: "SHARES_TRANSFERRED" },
};
export const SharesRedeemed: Story = {
	args: { entryType: "SHARES_REDEEMED" },
};
export const MortgageBurned: Story = {
	args: { entryType: "MORTGAGE_BURNED" },
};
export const Correction: Story = {
	args: { entryType: "CORRECTION" },
};
export const UnknownType: Story = {
	args: { entryType: "UNKNOWN_TYPE" },
};
