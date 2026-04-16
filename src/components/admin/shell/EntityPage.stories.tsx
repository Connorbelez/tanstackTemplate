import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { EntityPage } from "./EntityPage";

function SummaryCard({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	return (
		<div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
			<p className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
				{label}
			</p>
			<p className="mt-2 font-medium text-sm">{value}</p>
		</div>
	);
}

function EntityPageStory({
	compact = false,
	isLoading = false,
	showCustomSections = false,
}: {
	readonly compact?: boolean;
	readonly isLoading?: boolean;
	readonly showCustomSections?: boolean;
}) {
	return (
		<div className={compact ? "max-w-[420px]" : "max-w-7xl"}>
			<EntityPage
				actions={<Button size="sm">Primary action</Button>}
				backAction={
					<Button size="sm" variant="outline">
						Back to Listings
					</Button>
				}
				customSections={
					showCustomSections ? (
						<section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
							<h2 className="font-medium text-sm tracking-[0.02em]">
								Entity-Specific Section
							</h2>
							<p className="mt-3 text-muted-foreground text-sm">
								Custom sections can be injected without changing the shared page
								layout.
							</p>
						</section>
					) : undefined
				}
				headerBadges={
					<>
						<Badge variant="secondary">Listing</Badge>
						<Badge variant="outline">published</Badge>
					</>
				}
				iconName="box"
				mainContent={
					isLoading ? (
						<div className="rounded-2xl border border-border/70 bg-card p-6">
							<div className="space-y-3">
								<div className="h-6 w-40 animate-pulse rounded bg-muted" />
								<div className="h-32 animate-pulse rounded-xl bg-muted/70" />
								<div className="h-32 animate-pulse rounded-xl bg-muted/70" />
							</div>
						</div>
					) : (
						<div className="rounded-2xl border border-border/70 bg-card p-6">
							<h2 className="font-medium text-sm tracking-[0.02em]">Details</h2>
							<div className="mt-4 grid gap-3 md:grid-cols-2">
								<SummaryCard label="Principal" value="$12,500,000" />
								<SummaryCard label="APR" value="9.1%" />
								<SummaryCard label="LTV" value="64%" />
								<SummaryCard label="City" value="Toronto" />
							</div>
						</div>
					)
				}
				summary={
					<div className="space-y-4">
						<section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
							<h2 className="font-medium text-sm tracking-[0.02em]">
								At a Glance
							</h2>
							<div className="mt-3 grid gap-3">
								<SummaryCard label="Record ID" value="listing_123" />
								<SummaryCard label="Available Fractions" value="6,200" />
								<SummaryCard label="Updated" value="Apr 16, 2026" />
							</div>
						</section>
					</div>
				}
				supportingText="Marketplace projection with reusable detail tabs, summary context, and extension slots."
				title="King Street Bridge Loan"
			/>
		</div>
	);
}

const meta = {
	title: "Admin/EntityPage",
	component: EntityPageStory,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof EntityPageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
	args: {
		isLoading: true,
	},
};

export const WithCustomSections: Story = {
	args: {
		showCustomSections: true,
	},
};

export const Compact: Story = {
	args: {
		compact: true,
		showCustomSections: true,
	},
};
