import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Dialog } from "./dialog";

const meta = {
	title: "Form/Dialog",
	component: Dialog,
	parameters: {
		layout: "centered",
	},
	tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		title: "User Profile",
		children: (
			<div className="space-y-4">
				<p className="text-gray-700 dark:text-gray-300">
					This is a simple dialog component with a title and content area.
				</p>
			</div>
		),
	},
};

export const WithFooter: Story = {
	args: {
		title: "Confirm Action",
		children: (
			<div className="space-y-4">
				<p className="text-gray-700 dark:text-gray-300">
					Are you sure you want to proceed with this action?
				</p>
			</div>
		),
		footer: (
			<div className="flex justify-end gap-3">
				<Button size="medium" variant="secondary">
					Cancel
				</Button>
				<Button size="medium" variant="primary">
					Confirm
				</Button>
			</div>
		),
	},
};

export const Form: Story = {
	args: {
		title: "Create Account",
		children: (
			<div className="min-w-80 space-y-4">
				<div className="flex flex-col gap-2">
					<label className="font-medium text-gray-700 text-sm dark:text-gray-200">
						Email
					</label>
					<input
						className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						placeholder="you@example.com"
						type="email"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label className="font-medium text-gray-700 text-sm dark:text-gray-200">
						Password
					</label>
					<input
						className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						placeholder="••••••••"
						type="password"
					/>
				</div>
			</div>
		),
		footer: (
			<div className="flex justify-end gap-3">
				<Button size="medium" variant="secondary">
					Cancel
				</Button>
				<Button size="medium" variant="primary">
					Create Account
				</Button>
			</div>
		),
	},
};
