"use client";

import { useQuery } from "convex/react";
import { FileText, FolderOpen, Library, Variable } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../convex/_generated/api";

export function DocumentEngineDashboardPage() {
	const pdfs = useQuery(api.documentEngine.basePdfs.list);
	const variables = useQuery(api.documentEngine.systemVariables.list);
	const templates = useQuery(api.documentEngine.templates.list);
	const groups = useQuery(api.documentEngine.templateGroups.list);

	const stats = [
		{ count: pdfs?.length ?? 0, icon: Library, label: "Base PDFs" },
		{ count: variables?.length ?? 0, icon: Variable, label: "Variables" },
		{ count: templates?.length ?? 0, icon: FileText, label: "Templates" },
		{ count: groups?.length ?? 0, icon: FolderOpen, label: "Groups" },
	];

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{stats.map((stat) => (
					<Card key={stat.label}>
						<CardHeader className="flex flex-row items-center justify-between pb-2">
							<CardTitle className="font-medium text-sm">
								{stat.label}
							</CardTitle>
							<stat.icon className="size-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="font-bold text-2xl">{stat.count}</div>
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Getting Started</CardTitle>
					<CardDescription>
						Build mortgage and deal templates with variable interpolation and
						e-signature field placement.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 text-sm">
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							1
						</span>
						<p>
							<strong>Upload a Base PDF</strong> in the Library tab to create a
							reusable template foundation.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							2
						</span>
						<p>
							<strong>Define Supported Variables</strong> that map to the
							mortgage and deal contract used by origination.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							3
						</span>
						<p>
							<strong>Design and Publish Templates</strong> with interpolable
							and signable fields using the visual designer.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							4
						</span>
						<p>
							<strong>Attach Templates or Groups</strong> from origination and
							mortgage document workflows with pinned published versions.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
