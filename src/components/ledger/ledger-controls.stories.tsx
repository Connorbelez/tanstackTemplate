import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LedgerControls } from "./ledger-controls";

const meta = {
	title: "Ledger/LedgerControls",
	component: LedgerControls,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
	args: {
		onSeed: fn(),
		onCleanup: fn(),
	},
	decorators: [
		(Story) => (
			<div className="max-w-2xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof LedgerControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoData: Story = {
	args: {
		hasDemoData: false,
		loading: false,
	},
};

export const WithData: Story = {
	args: {
		hasDemoData: true,
		loading: false,
		mortgageCount: 2,
		entryCount: 7,
	},
};

export const Loading: Story = {
	args: {
		hasDemoData: false,
		loading: true,
	},
};

export const LoadingWithData: Story = {
	args: {
		hasDemoData: true,
		loading: true,
		mortgageCount: 2,
		entryCount: 7,
	},
};
