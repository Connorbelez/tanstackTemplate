import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LedgerActions } from "./ledger-actions";

const MOCK_MORTGAGES = [
	{
		mortgageId: "demo-mtg-greenfield",
		label: "123 Greenfield Rd — Residential",
		treasuryBalance: 0,
		positions: [
			{
				lenderId: "demo-lender-alice",
				displayName: "Alice",
				accountId: "acc-1",
				balance: 5000,
			},
			{
				lenderId: "demo-lender-bob",
				displayName: "Bob",
				accountId: "acc-2",
				balance: 3000,
			},
			{
				lenderId: "demo-lender-charlie",
				displayName: "Charlie",
				accountId: "acc-3",
				balance: 2000,
			},
		],
	},
	{
		mortgageId: "demo-mtg-riverside",
		label: "456 Riverside Dr — Commercial",
		treasuryBalance: 3000,
		positions: [
			{
				lenderId: "demo-lender-alice",
				displayName: "Alice",
				accountId: "acc-4",
				balance: 7000,
			},
		],
	},
];

const meta = {
	title: "Ledger/LedgerActions",
	component: LedgerActions,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
	args: {
		mortgages: MOCK_MORTGAGES,
		loading: false,
		onTransfer: fn(),
		onIssue: fn(),
		onRedeem: fn(),
		onTransferChange: fn(),
		onIssueChange: fn(),
		onRedeemChange: fn(),
	},
	decorators: [
		(Story) => (
			<div className="max-w-3xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof LedgerActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyForms: Story = {
	args: {
		transferForm: {
			mortgage: "",
			seller: "",
			buyer: "demo-lender-",
			amount: "",
		},
		issueForm: { mortgage: "", lender: "demo-lender-", amount: "" },
		redeemForm: { mortgage: "", lender: "", amount: "" },
	},
};

export const TransferPreFilled: Story = {
	args: {
		transferForm: {
			mortgage: "demo-mtg-greenfield",
			seller: "demo-lender-alice",
			buyer: "demo-lender-dave",
			amount: "2000",
		},
		issueForm: { mortgage: "", lender: "demo-lender-", amount: "" },
		redeemForm: { mortgage: "", lender: "", amount: "" },
	},
};

export const IssuePreFilled: Story = {
	args: {
		transferForm: {
			mortgage: "",
			seller: "",
			buyer: "demo-lender-",
			amount: "",
		},
		issueForm: {
			mortgage: "demo-mtg-riverside",
			lender: "demo-lender-eve",
			amount: "1000",
		},
		redeemForm: { mortgage: "", lender: "", amount: "" },
	},
};

export const RedeemPreFilled: Story = {
	args: {
		transferForm: {
			mortgage: "",
			seller: "",
			buyer: "demo-lender-",
			amount: "",
		},
		issueForm: { mortgage: "", lender: "demo-lender-", amount: "" },
		redeemForm: {
			mortgage: "demo-mtg-greenfield",
			lender: "demo-lender-bob",
			amount: "3000",
		},
	},
};

export const LoadingState: Story = {
	args: {
		loading: true,
		transferForm: {
			mortgage: "demo-mtg-greenfield",
			seller: "demo-lender-alice",
			buyer: "demo-lender-dave",
			amount: "2000",
		},
		issueForm: { mortgage: "", lender: "demo-lender-", amount: "" },
		redeemForm: { mortgage: "", lender: "", amount: "" },
	},
};
