import type { Meta, StoryObj } from "@storybook/react-vite";
import { MortgageCard } from "./mortgage-card";

const meta = {
	title: "Ledger/MortgageCard",
	component: MortgageCard,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
	decorators: [
		(Story) => (
			<div className="max-w-md">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof MortgageCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullyIssued: Story = {
	args: {
		mortgageId: "mtg-greenfield",
		label: "123 Greenfield Rd — Residential",
		treasuryBalance: 0,
		positions: [
			{
				lenderId: "lender-alice",
				displayName: "Alice",
				accountId: "acc-1",
				balance: 5000,
			},
			{
				lenderId: "lender-bob",
				displayName: "Bob",
				accountId: "acc-2",
				balance: 3000,
			},
			{
				lenderId: "lender-charlie",
				displayName: "Charlie",
				accountId: "acc-3",
				balance: 2000,
			},
		],
		invariantValid: true,
		total: 10_000,
		entryCount: 4,
	},
};

export const PartiallyIssued: Story = {
	args: {
		mortgageId: "mtg-riverside",
		label: "456 Riverside Dr — Commercial",
		treasuryBalance: 3000,
		positions: [
			{
				lenderId: "lender-alice",
				displayName: "Alice",
				accountId: "acc-1",
				balance: 7000,
			},
		],
		invariantValid: true,
		total: 10_000,
		entryCount: 2,
	},
};

export const SingleLender: Story = {
	args: {
		mortgageId: "mtg-single",
		label: "789 Oak Ave — Single Lender",
		treasuryBalance: 0,
		positions: [
			{
				lenderId: "lender-sole",
				displayName: "Sole Owner",
				accountId: "acc-sole",
				balance: 10_000,
			},
		],
		invariantValid: true,
		total: 10_000,
		entryCount: 2,
	},
};

export const InvariantBroken: Story = {
	args: {
		mortgageId: "mtg-broken",
		label: "999 Error Ln — Invariant Violated",
		treasuryBalance: 3000,
		positions: [
			{
				lenderId: "lender-alice",
				displayName: "Alice",
				accountId: "acc-1",
				balance: 5000,
			},
		],
		invariantValid: false,
		total: 8000,
		entryCount: 5,
	},
};

export const FreshlyMinted: Story = {
	args: {
		mortgageId: "mtg-fresh",
		label: "100 New Build Ct — Just Minted",
		treasuryBalance: 10_000,
		positions: [],
		invariantValid: true,
		total: 10_000,
		entryCount: 1,
	},
};
