import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { FileText, FolderOpen, Library, Variable } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/document-engine/")({
	component: DashboardPage,
});

function DashboardPage() {
	const pdfs = useQuery(api.documentEngine.basePdfs.list);
	const variables = useQuery(api.documentEngine.systemVariables.list);
	const templates = useQuery(api.documentEngine.templates.list);
	const groups = useQuery(api.documentEngine.templateGroups.list);

	const stats = [
		{
			label: "Base PDFs",
			count: pdfs?.length ?? 0,
			icon: Library,
			href: "/demo/document-engine/library",
		},
		{
			label: "Variables",
			count: variables?.length ?? 0,
			icon: Variable,
			href: "/demo/document-engine/variables",
		},
		{
			label: "Templates",
			count: templates?.length ?? 0,
			icon: FileText,
			href: "/demo/document-engine/templates",
		},
		{
			label: "Groups",
			count: groups?.length ?? 0,
			icon: FolderOpen,
			href: "/demo/document-engine/groups",
		},
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
						Build document templates with variable interpolation and e-signature
						field placement.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 text-sm">
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							1
						</span>
						<p>
							<strong>Upload a Base PDF</strong> — Go to the Library tab and
							upload a PDF document that will serve as your template base.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							2
						</span>
						<p>
							<strong>Define System Variables</strong> — Create variables like
							loan_amount, borrower_name, etc. that will be interpolated into
							documents.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							3
						</span>
						<p>
							<strong>Design a Template</strong> — Create a template from a base
							PDF, place interpolable and signable fields using the visual
							designer.
						</p>
					</div>
					<div className="flex items-start gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							4
						</span>
						<p>
							<strong>Generate Documents</strong> — Fill in variable values, map
							signatories, and generate interpolated PDFs with Documenso
							envelope configs.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
