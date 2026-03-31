import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { Blocks, LoaderCircle, RefreshCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DynamicRecordForm } from "#/components/demo/crm/DynamicRecordForm";
import {
	demoCrmGetLeadPipelineSeedState,
	demoCrmResetSandbox,
	demoCrmSeedLeadPipeline,
} from "#/components/demo/crm/functionRefs";
import { ObjectCreator } from "#/components/demo/crm/ObjectCreator";
import { ObjectInventoryCard } from "#/components/demo/crm/ObjectInventoryCard";
import { RecordDetailCard } from "#/components/demo/crm/RecordDetailCard";
import { RecordTableSurface } from "#/components/demo/crm/RecordTableSurface";
import type { CrmDemoRecordKind } from "#/components/demo/crm/types";
import { extractCrmErrorMessage } from "#/components/demo/crm/utils";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/crm/")({
	component: CrmCustomObjectsPage,
});

function CrmCustomObjectsPage() {
	const objects = useQuery(api.crm.objectDefs.listObjects, {});
	const seedState = useQuery(demoCrmGetLeadPipelineSeedState, {});
	const seedLeadPipeline = useAction(demoCrmSeedLeadPipeline);
	const resetCrmDemo = useMutation(demoCrmResetSandbox);
	const [selectedObjectId, setSelectedObjectId] = useState<Id<"objectDefs">>();
	const [refreshKey, setRefreshKey] = useState(0);
	const [isSeeding, setIsSeeding] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [selectedRecord, setSelectedRecord] = useState<{
		recordId: string;
		recordKind: CrmDemoRecordKind;
	}>();

	const customObjects = useMemo(
		() => (objects ?? []).filter((objectDef) => !objectDef.isSystem),
		[objects]
	);

	useEffect(() => {
		if (
			selectedObjectId &&
			customObjects.some((item) => item._id === selectedObjectId)
		) {
			return;
		}

		const nextObjectId = seedState?.demoObjectId ?? customObjects[0]?._id;
		setSelectedObjectId(nextObjectId);
	}, [customObjects, seedState?.demoObjectId, selectedObjectId]);

	const selectedObject = customObjects.find(
		(objectDef) => objectDef._id === selectedObjectId
	);

	async function handleSeed() {
		setIsSeeding(true);
		try {
			const result = await seedLeadPipeline();
			setSelectedObjectId(result.demoObjectId);
			setSelectedRecord(undefined);
			setRefreshKey((current) => current + 1);
			toast.success(
				result.seeded
					? "Seeded the demo lead pipeline."
					: "Demo lead pipeline already exists."
			);
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		} finally {
			setIsSeeding(false);
		}
	}

	async function handleReset() {
		setIsResetting(true);
		try {
			const result = await resetCrmDemo({});
			setSelectedObjectId(undefined);
			setSelectedRecord(undefined);
			setRefreshKey((current) => current + 1);
			toast.success(
				`Removed ${result.deletedObjects} demo objects and ${result.deletedRecords} records.`
			);
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		} finally {
			setIsResetting(false);
		}
	}

	return (
		<div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
			<div className="space-y-6">
				<ControlPlaneCard
					customObjectCount={
						seedState?.customObjectCount ?? customObjects.length
					}
					isResetting={isResetting}
					isSeeding={isSeeding}
					objectCount={customObjects.length}
					onReset={handleReset}
					onSeed={handleSeed}
					recordCount={seedState?.recordCount ?? 0}
				/>

				<ObjectCreator
					onCreated={({ objectDefId }) => {
						setSelectedObjectId(objectDefId);
						setSelectedRecord(undefined);
						setRefreshKey((current) => current + 1);
					}}
				/>

				<RecordTableSurface
					emptyDescription="Create a record in the composer to exercise the typed value tables."
					emptyTitle="Live record preview"
					key={`${selectedObjectId ?? "none"}-${refreshKey}`}
					metricNote="Custom-object preview uses the default table view and estimates EAV reads from active typed value tables."
					metricSource="eav"
					objectDef={selectedObject}
					onSelectRecord={setSelectedRecord}
					selectedRecordId={selectedRecord?.recordId}
				/>
			</div>

			<div className="space-y-6">
				<ObjectInventoryCard
					description="Every object below is backed by the same CRM object and field metadata that the admin shell will consume later."
					emptyMessage="No sandbox objects yet. Seed the demo pipeline or create one from the object studio."
					objects={customObjects}
					onSelect={setSelectedObjectId}
					selectedObjectId={selectedObjectId}
					title="Object inventory"
				/>

				<DynamicRecordForm
					key={`${selectedObjectId ?? "none"}-${refreshKey}-form`}
					objectDefId={selectedObjectId}
					objectLabel={selectedObject?.singularLabel}
					onRecordCreated={() => {
						setSelectedRecord(undefined);
						setRefreshKey((current) => current + 1);
					}}
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

function ControlPlaneCard({
	customObjectCount,
	isResetting,
	isSeeding,
	objectCount,
	onReset,
	onSeed,
	recordCount,
}: {
	customObjectCount: number;
	isResetting: boolean;
	isSeeding: boolean;
	objectCount: number;
	onReset: () => void;
	onSeed: () => void;
	recordCount: number;
}) {
	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader>
				<div className="flex items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2 text-lg">
							<Blocks className="size-4" />
							CRM playground controls
						</CardTitle>
						<CardDescription>
							Use the demo seed for a known-good pipeline, or create fresh
							sandbox objects with your own schema.
						</CardDescription>
					</div>
					<Badge variant="secondary">Custom objects</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-3 md:grid-cols-3">
					<StatCard label="Objects in org" value={String(objectCount)} />
					<StatCard
						label="Demo-safe objects"
						value={String(customObjectCount)}
					/>
					<StatCard label="Demo records" value={String(recordCount)} />
				</div>

				<div className="grid gap-4 rounded-3xl border border-border/70 bg-gradient-to-br from-muted/10 via-background to-primary/5 p-5 lg:grid-cols-[1.15fr_0.85fr]">
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<Badge variant="outline">Seed path</Badge>
							<Badge variant="secondary">demo_lead</Badge>
						</div>
						<p className="font-medium text-sm">
							Spin up a reference sales pipeline with a select field, date
							field, currency field, and a handful of typed demo records.
						</p>
						<p className="text-muted-foreground text-sm leading-6">
							This lets the rest of the ENG-261 surfaces validate against a
							known object before the admin shell is wired on top.
						</p>
					</div>

					<div className="grid gap-3">
						<Button disabled={isSeeding} onClick={onSeed}>
							{isSeeding ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<Sparkles className="size-4" />
							)}
							Seed lead pipeline
						</Button>
						<Button disabled={isResetting} onClick={onReset} variant="outline">
							{isResetting ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<RefreshCcw className="size-4" />
							)}
							Reset sandbox objects
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-border/70 bg-background/85 px-4 py-3">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
				{label}
			</p>
			<p className="mt-1 font-semibold text-xl">{value}</p>
		</div>
	);
}
