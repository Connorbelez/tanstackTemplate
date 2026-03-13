import type { Meta, StoryObj } from "@storybook/react-vite";
import { JournalLogTable } from "./journal-log-table";

const meta = {
	title: "Ledger/JournalLogTable",
	component: JournalLogTable,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
	decorators: [
		(Story) => (
			<div className="max-w-3xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof JournalLogTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllEntryTypes: Story = {
	args: {
		entries: [
			{
				_id: "entry-1",
				sequenceNumber: 7,
				entryType: "SHARES_TRANSFERRED",
				amount: 2000,
				fromLabel: "Alice",
				toLabel: "Dave",
				source: "interactive",
			},
			{
				_id: "entry-2",
				sequenceNumber: 6,
				entryType: "SHARES_REDEEMED",
				amount: 1000,
				fromLabel: "Bob",
				toLabel: "TREASURY",
				source: "interactive",
			},
			{
				_id: "entry-3",
				sequenceNumber: 5,
				entryType: "CORRECTION",
				amount: 500,
				fromLabel: "TREASURY",
				toLabel: "Charlie",
				source: "interactive",
			},
			{
				_id: "entry-4",
				sequenceNumber: 4,
				entryType: "SHARES_ISSUED",
				amount: 3000,
				fromLabel: "TREASURY",
				toLabel: "Alice",
				source: "seed",
			},
			{
				_id: "entry-5",
				sequenceNumber: 3,
				entryType: "SHARES_ISSUED",
				amount: 5000,
				fromLabel: "TREASURY",
				toLabel: "Bob",
				source: "seed",
			},
			{
				_id: "entry-6",
				sequenceNumber: 2,
				entryType: "SHARES_ISSUED",
				amount: 2000,
				fromLabel: "TREASURY",
				toLabel: "Charlie",
				source: "seed",
			},
			{
				_id: "entry-7",
				sequenceNumber: 1,
				entryType: "MORTGAGE_MINTED",
				amount: 10_000,
				fromLabel: "WORLD",
				toLabel: "TREASURY",
				source: "seed",
			},
		],
	},
};

export const SeedOnly: Story = {
	args: {
		entries: [
			{
				_id: "entry-1",
				sequenceNumber: 3,
				entryType: "SHARES_ISSUED",
				amount: 5000,
				fromLabel: "TREASURY",
				toLabel: "Alice",
				source: "seed",
			},
			{
				_id: "entry-2",
				sequenceNumber: 2,
				entryType: "SHARES_ISSUED",
				amount: 5000,
				fromLabel: "TREASURY",
				toLabel: "Bob",
				source: "seed",
			},
			{
				_id: "entry-3",
				sequenceNumber: 1,
				entryType: "MORTGAGE_MINTED",
				amount: 10_000,
				fromLabel: "WORLD",
				toLabel: "TREASURY",
				source: "seed",
			},
		],
	},
};

export const SingleEntry: Story = {
	args: {
		entries: [
			{
				_id: "entry-1",
				sequenceNumber: 1,
				entryType: "MORTGAGE_MINTED",
				amount: 10_000,
				fromLabel: "WORLD",
				toLabel: "TREASURY",
				source: "seed",
			},
		],
	},
};

export const Empty: Story = {
	args: {
		entries: [],
	},
};

export const WithBurnEntry: Story = {
	args: {
		entries: [
			{
				_id: "entry-1",
				sequenceNumber: 3,
				entryType: "MORTGAGE_BURNED",
				amount: 10_000,
				fromLabel: "TREASURY",
				toLabel: "WORLD",
				source: "interactive",
			},
			{
				_id: "entry-2",
				sequenceNumber: 2,
				entryType: "SHARES_REDEEMED",
				amount: 10_000,
				fromLabel: "Alice",
				toLabel: "TREASURY",
				source: "interactive",
			},
			{
				_id: "entry-3",
				sequenceNumber: 1,
				entryType: "MORTGAGE_MINTED",
				amount: 10_000,
				fromLabel: "WORLD",
				toLabel: "TREASURY",
				source: "seed",
			},
		],
	},
};
