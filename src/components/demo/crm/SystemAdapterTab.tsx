import { ServerCog } from "lucide-react";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { RecordTableSurface } from "./RecordTableSurface";
import { ShapeComparison } from "./ShapeComparison";
import { SourceIndicator } from "./SourceIndicator";
import type { CrmDemoRecordReference, CrmDemoTableResult } from "./types";

type ObjectDef = Doc<"objectDefs">;

export function SystemAdapterTab({
	objectDef,
	onSelectRecord,
	selectedRecordId,
}: {
	objectDef?: ObjectDef;
	onSelectRecord?: (record: CrmDemoRecordReference) => void;
	selectedRecordId?: string;
}) {
	const [sampleRecord, setSampleRecord] = useState<
		CrmDemoTableResult["rows"][number] | undefined
	>();

	return (
		<div className="space-y-6">
			<Card className="border-border/70 shadow-sm">
				<CardHeader>
					<div className="flex items-start justify-between gap-4">
						<div>
							<CardTitle className="flex items-center gap-2 text-lg">
								<ServerCog className="size-4" />
								System adapter validation
							</CardTitle>
							<CardDescription>
								Native Convex tables should render through the same record
								surfaces as custom EAV objects.
							</CardDescription>
						</div>
						<SourceIndicator source="native" />
					</div>
				</CardHeader>
				<CardContent>
					<RecordTableSurface
						emptyDescription="System records will appear here when the native table contains org-scoped data."
						emptyTitle="Native record preview"
						enableKanban={false}
						metricNote="System object preview uses the native adapter through the shared record surface."
						metricSource="native"
						objectDef={objectDef}
						onDataLoaded={(rows) => setSampleRecord(rows[0])}
						onSelectRecord={onSelectRecord}
						selectedRecordId={selectedRecordId}
					/>
				</CardContent>
			</Card>

			<ShapeComparison record={sampleRecord} />
		</div>
	);
}
