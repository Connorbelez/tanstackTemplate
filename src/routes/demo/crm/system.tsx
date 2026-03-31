import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Database, ServerCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ObjectInventoryCard } from "#/components/demo/crm/ObjectInventoryCard";
import { RecordDetailCard } from "#/components/demo/crm/RecordDetailCard";
import { RecordTableSurface } from "#/components/demo/crm/RecordTableSurface";
import type { CrmDemoRecordKind } from "#/components/demo/crm/types";
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
	const objects = useQuery(api.crm.objectDefs.listObjects, {});
	const [selectedObjectId, setSelectedObjectId] = useState<Id<"objectDefs">>();
	const [selectedRecord, setSelectedRecord] = useState<{
		recordId: string;
		recordKind: CrmDemoRecordKind;
	}>();

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
						setSelectedRecord(undefined);
					}}
					selectedObjectId={selectedObjectId}
					title="System object inventory"
				/>
			</div>

			<div className="space-y-6">
				<RecordTableSurface
					emptyDescription="System records will appear here once the underlying native table has org-scoped data."
					emptyTitle="Native record preview"
					metricNote="System-object preview uses the native query adapter behind crm.viewQueries.queryViewRecords."
					metricSource="native"
					objectDef={selectedObject}
					onSelectRecord={setSelectedRecord}
					selectedRecordId={selectedRecord?.recordId}
				/>

				<RecordDetailCard
					objectDef={selectedObject}
					recordId={selectedRecord?.recordId}
					recordKind={selectedRecord?.recordKind}
				/>
			</div>
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
