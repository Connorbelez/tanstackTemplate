import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { RecordDetailPage } from "#/components/demo/crm/RecordDetailPage";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/crm/$objectDefId/$recordId")({
	component: CrmRecordDetailRoute,
	errorComponent: ({ error }) => (
		<div className="mx-auto max-w-3xl">
			<Card className="border-border/70 shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<AlertCircle className="size-4 text-destructive" />
						Unable to load record
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-muted-foreground text-sm">
						{error instanceof Error
							? error.message
							: "An error occurred while loading this CRM demo record."}
					</p>
					<Button asChild size="sm" variant="outline">
						<Link to="/demo/crm">
							<ArrowLeft className="size-4" />
							Back to CRM Demo
						</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	),
});

function CrmRecordDetailRoute() {
	const { objectDefId, recordId } = Route.useParams();
	const objects = useQuery(api.crm.objectDefs.listObjects, {});
	const objectDef = objects?.find((candidate) => candidate._id === objectDefId);

	if (objects === undefined) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
				Loading CRM object metadata...
			</div>
		);
	}

	if (!objectDef) {
		return (
			<div className="mx-auto max-w-3xl">
				<Card className="border-border/70 shadow-sm">
					<CardHeader>
						<CardTitle>Unknown object</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground text-sm">
							The requested CRM object definition does not exist in this
							sandbox.
						</p>
						<Button asChild size="sm" variant="outline">
							<Link to="/demo/crm">
								<ArrowLeft className="size-4" />
								Back to CRM Demo
							</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return <RecordDetailPage objectDef={objectDef} recordId={recordId} />;
}
