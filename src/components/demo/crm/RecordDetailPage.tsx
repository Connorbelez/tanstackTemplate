import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Button } from "#/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getRecordTitle } from "./cell-renderers";
import { useCrmDemoMetrics } from "./MetricsProvider";
import { RecordFieldDisplay } from "./RecordFieldDisplay";
import {
	RecordDetailsGrid,
	RecordHighlights,
	RecordHistorySection,
	RecordRelationsSection,
	RecordSummaryCard,
} from "./RecordSurfaceSections";
import { extractCrmErrorMessage } from "./utils";

type ObjectDef = Doc<"objectDefs">;

export function RecordDetailPage({
	objectDef,
	recordId,
}: {
	objectDef: ObjectDef;
	recordId: string;
}) {
	const navigate = useNavigate();
	const { setMetricNotes, setRenderTime } = useCrmDemoMetrics();
	const startedAtRef = useRef<number>(performance.now());
	const previousRecordIdRef = useRef<string | null>(null);
	const fields = useQuery(api.crm.fieldDefs.listFields, {
		objectDefId: objectDef._id,
	});
	const detail = useQuery(api.crm.recordQueries.getRecordReference, {
		objectDefId: objectDef._id,
		recordId,
		recordKind: objectDef.isSystem ? "native" : "record",
	});
	const linkedGroups = useQuery(api.crm.linkQueries.getLinkedRecords, {
		direction: "both",
		recordId,
		recordKind: objectDef.isSystem ? "native" : "record",
	});
	const activity = useQuery(api.crm.activityQueries.getRecordActivity, {
		cursor: undefined,
		limit: 30,
		recordId,
		recordKind: objectDef.isSystem ? "native" : "record",
	});
	const objects = useQuery(api.crm.objectDefs.listObjects, {});
	const deleteRecord = useMutation(api.crm.records.deleteRecord);

	if (previousRecordIdRef.current !== recordId) {
		previousRecordIdRef.current = recordId;
		startedAtRef.current = performance.now();
	}

	useEffect(() => {
		if (!detail) {
			return;
		}

		setMetricNotes(
			`Full-page detail is validating ${objectDef.isSystem ? "native" : "custom"} record rendering through the shared record surface.`
		);
		setRenderTime(Math.round(performance.now() - startedAtRef.current));
	}, [detail, objectDef.isSystem, setMetricNotes, setRenderTime]);

	const objectsById = useMemo(
		() =>
			new Map((objects ?? []).map((candidate) => [candidate._id, candidate])),
		[objects]
	);

	async function handleDelete() {
		try {
			await deleteRecord({
				recordId: recordId as Id<"records">,
			});
			toast.success(`Deleted ${objectDef.singularLabel.toLowerCase()} record.`);
			navigate({ to: "/demo/crm" });
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		}
	}

	if (detail === undefined || fields === undefined) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground text-sm">
				<LoaderCircle className="size-4 animate-spin" />
				Loading record detail...
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="space-y-3">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link to="/demo/crm">CRM Demo</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link
										to={objectDef.isSystem ? "/demo/crm/system" : "/demo/crm"}
									>
										{objectDef.pluralLabel}
									</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>
									{getRecordTitle(detail.record, fields)}
								</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex items-center gap-2">
						<Link to={objectDef.isSystem ? "/demo/crm/system" : "/demo/crm"}>
							<Button size="sm" variant="ghost">
								<ArrowLeft className="size-4" />
								Back
							</Button>
						</Link>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button disabled size="sm" variant="outline">
						Inline edit enabled below
					</Button>
					{objectDef.isSystem ? null : (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button size="sm" variant="destructive">
									<Trash2 className="size-4" />
									Delete
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete this record?</AlertDialogTitle>
									<AlertDialogDescription>
										This removes the record from the custom-object playground.
										The audit trail remains intact.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										onClick={handleDelete}
										variant="destructive"
									>
										Delete record
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					)}
				</div>
			</div>

			<RecordSummaryCard
				fields={fields}
				objectDef={objectDef}
				record={detail.record}
			/>

			<div className="grid gap-6 xl:grid-cols-[1.5fr_0.75fr]">
				<div className="space-y-6">
					<section className="space-y-4">
						<div>
							<h2 className="font-semibold text-lg">Details</h2>
							<p className="text-muted-foreground text-sm">
								The full-page surface uses the same field renderer and edit
								controls as the sidebar.
							</p>
						</div>

						<RecordDetailsGrid
							fields={fields}
							isReadOnly={objectDef.isSystem}
							record={detail.record}
							renderField={(field, value, isReadOnly) => (
								<RecordFieldDisplay
									field={field}
									isReadOnly={isReadOnly}
									recordId={detail.record._id}
									value={value}
								/>
							)}
						/>
					</section>

					<section className="space-y-4">
						<div>
							<h2 className="font-semibold text-lg">Relations</h2>
							<p className="text-muted-foreground text-sm">
								Linked records created through the Link Explorer appear here and
								use the same drill-in contract as the sidebar.
							</p>
						</div>
						<RecordRelationsSection
							groups={linkedGroups}
							objectsById={objectsById}
						/>
					</section>

					<section className="space-y-4">
						<div>
							<h2 className="font-semibold text-lg">History</h2>
							<p className="text-muted-foreground text-sm">
								Recent CRM audit activity for this record.
							</p>
						</div>
						<RecordHistorySection activity={activity} />
					</section>
				</div>

				<div className="space-y-6">
					<RecordHighlights fields={fields} record={detail.record} />
				</div>
			</div>
		</div>
	);
}
