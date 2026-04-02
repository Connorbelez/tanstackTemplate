import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Database, ServerCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ObjectInventoryCard } from "#/components/demo/crm/ObjectInventoryCard";
import { useRecordSidebar } from "#/components/demo/crm/RecordSidebarProvider";
import { SystemAdapterTab } from "#/components/demo/crm/SystemAdapterTab";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/crm/system")({
	component: CrmSystemAdaptersPage,
});

function CrmSystemAdaptersPage() {
	return <CrmSystemAdaptersContent />;
}

function CrmSystemAdaptersContent() {
	const objects = useQuery(api.crm.objectDefs.listObjects, {});
	const [selectedObjectId, setSelectedObjectId] = useState<Id<"objectDefs">>();
	const { currentRecord, openRecord } = useRecordSidebar();

	const systemObjects = useMemo(
		() => (objects ?? []).filter((objectDef) => objectDef.isSystem),
		[objects]
	);

	useEffect(() => {
		if (
			selectedObjectId &&
			systemObjects.some((item) => item._id === selectedObjectId)
		) {
			return;
		}

		setSelectedObjectId(systemObjects[0]?._id);
	}, [selectedObjectId, systemObjects]);

	const selectedObject = systemObjects.find(
		(objectDef) => objectDef._id === selectedObjectId
	);

	return (
		<div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
			<div className="space-y-6">
				<Card className="border-border/70 shadow-sm">
					<CardHeader>
						<div className="flex items-start justify-between gap-4">
							<div>
								<CardTitle className="flex items-center gap-2 text-lg">
									<ServerCog className="size-4" />
									System adapter overview
								</CardTitle>
								<CardDescription>
									These object definitions mirror native Convex tables like
									mortgages, deals, and obligations through the same
									`UnifiedRecord` contract the custom-object playground uses.
								</CardDescription>
							</div>
							<Badge variant="secondary">Native tables</Badge>
						</div>
					</CardHeader>
					<CardContent className="grid gap-3 md:grid-cols-3">
						<SystemStat
							label="System objects"
							value={String(systemObjects.length)}
						/>
						<SystemStat
							label="Selected table"
							value={selectedObject?.nativeTable ?? "—"}
						/>
						<SystemStat label="Detail API" value="getRecordReference" />
					</CardContent>
				</Card>

				<ObjectInventoryCard
					description="These are the bootstrap-created system object definitions backed by native tables."
					emptyMessage="System objects have not been bootstrapped for this org yet."
					objects={systemObjects}
					onSelect={(objectDefId) => {
						setSelectedObjectId(objectDefId);
					}}
					selectedObjectId={selectedObjectId}
					title="System object inventory"
				/>
			</div>

			<SystemAdapterTab
				objectDef={selectedObject}
				onSelectRecord={openRecord}
				selectedRecordId={
					currentRecord && currentRecord.objectDefId === selectedObject?._id
						? currentRecord.recordId
						: undefined
				}
			/>
		</div>
	);
}

function SystemStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
			<div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
				<Database className="size-3.5" />
				{label}
			</div>
			<p className="mt-2 font-semibold text-xl">{value}</p>
		</div>
	);
}
