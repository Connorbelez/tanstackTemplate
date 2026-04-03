import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useState } from "react";
import {
	AvatarCell,
	BadgeCell,
	CurrencyCell,
	DateCell,
	FileCell,
	ImageCell,
	LinkCell,
	MultiSelectCell,
	PercentCell,
	SelectCell,
	TextCell,
} from "./cell-renderers";

const options = [
	{ value: "active", label: "Active", color: "#16a34a" },
	{ value: "review", label: "Review", color: "#2563eb" },
	{ value: "blocked", label: "Blocked", color: "#dc2626" },
];

function CellRenderersPreview() {
	const [stage, setStage] = useState("review");
	const [tags, setTags] = useState(["active", "blocked"]);

	return (
		<div className="grid gap-4 md:grid-cols-2">
			<PreviewRow label="Text">
				<TextCell value="Dedicated route scaffold for a system entity record." />
			</PreviewRow>
			<PreviewRow label="Badge">
				<BadgeCell color="#2563eb" value="Under review" />
			</PreviewRow>
			<PreviewRow label="Currency">
				<CurrencyCell isCents value={12_450_000} />
			</PreviewRow>
			<PreviewRow label="Percent">
				<PercentCell colorScale="performance" value={68.4} />
			</PreviewRow>
			<PreviewRow label="Date">
				<DateCell value="2026-04-02T12:30:00.000Z" />
			</PreviewRow>
			<PreviewRow label="Avatar">
				<AvatarCell name="North River LP" subtitle="Lead borrower" />
			</PreviewRow>
			<PreviewRow label="Link">
				<LinkCell href="https://example.com/records/123" label="Open record" />
			</PreviewRow>
			<PreviewRow label="Image">
				<ImageCell
					alt="Property"
					src="https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=200&q=80"
				/>
			</PreviewRow>
			<PreviewRow label="Select">
				<SelectCell onValueChange={setStage} options={options} value={stage} />
			</PreviewRow>
			<PreviewRow label="Multi-select">
				<MultiSelectCell
					onValuesChange={setTags}
					options={options}
					values={tags}
				/>
			</PreviewRow>
			<PreviewRow label="File">
				<FileCell
					fileName="underwriting-package.pdf"
					fileSize="2.4 MB"
					href="https://example.com/files/underwriting-package.pdf"
				/>
			</PreviewRow>
		</div>
	);
}

function PreviewRow({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<div className="space-y-2 rounded-lg border bg-background p-4">
			<p className="font-medium text-sm">{label}</p>
			<div>{children}</div>
		</div>
	);
}

const meta = {
	title: "Admin/CellRenderers",
	component: CellRenderersPreview,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof CellRenderersPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
