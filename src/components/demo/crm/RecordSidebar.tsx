import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, ExternalLink, LoaderCircle } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useRef } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { api } from "../../../../convex/_generated/api";
import { getRecordTitle } from "./cell-renderers";
import { useCrmDemoMetrics } from "./MetricsProvider";
import { RecordFieldDisplay } from "./RecordFieldDisplay";
import { useRecordSidebar } from "./RecordSidebarProvider";
import {
	RecordDetailsGrid,
	RecordHistorySection,
	RecordRelationsSection,
} from "./RecordSurfaceSections";

export function RecordSidebar() {
	const {
		close,
		currentRecord,
		drillIntoRecord,
		goBack,
		isOpen,
		navigationStack,
	} = useRecordSidebar();
	const { setMetricNotes, setRenderTime } = useCrmDemoMetrics();
	const objects = useQuery(api.crm.objectDefs.listObjects, {});
	const objectDef = useMemo(
		() =>
			(objects ?? []).find(
				(candidate) => candidate._id === currentRecord?.objectDefId
			),
		[objects, currentRecord?.objectDefId]
	);
	const fields = useQuery(
		api.crm.fieldDefs.listFields,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const detail = useQuery(
		api.crm.recordQueries.getRecordReference,
		objectDef && currentRecord
			? {
					objectDefId: objectDef._id,
					recordId: currentRecord.recordId,
					recordKind: currentRecord.recordKind,
				}
			: "skip"
	);
	const activity = useQuery(
		api.crm.activityQueries.getRecordActivity,
		currentRecord
			? {
					cursor: undefined,
					limit: 20,
					recordId: currentRecord.recordId,
					recordKind: currentRecord.recordKind,
				}
			: "skip"
	);
	const linkedGroups = useQuery(
		api.crm.linkQueries.getLinkedRecords,
		currentRecord
			? {
					direction: "both",
					recordId: currentRecord.recordId,
					recordKind: currentRecord.recordKind,
				}
			: "skip"
	);
	const startedAtRef = useRef<number>(performance.now());
	const previousRecordKeyRef = useRef<string | null>(null);
	const objectsById = useMemo(
		() =>
			new Map((objects ?? []).map((candidate) => [candidate._id, candidate])),
		[objects]
	);
	const isReadOnly = currentRecord?.recordKind === "native";
	const recordKey = currentRecord
		? `${currentRecord.objectDefId}:${currentRecord.recordKind}:${currentRecord.recordId}`
		: null;
	const isLoadingDetail =
		!objectDef || detail === undefined || fields === undefined;
	const objectLabel = objectDef?.singularLabel ?? "Record";

	if (previousRecordKeyRef.current !== recordKey) {
		previousRecordKeyRef.current = recordKey;
		startedAtRef.current = performance.now();
	}

	useEffect(() => {
		if (!(currentRecord && detail)) {
			return;
		}

		setMetricNotes(
			`Sidebar detail is reading ${currentRecord.recordKind === "native" ? "native" : "custom"} record state through crm.recordQueries.getRecordReference.`
		);
		setRenderTime(Math.round(performance.now() - startedAtRef.current));
	}, [currentRecord, detail, setMetricNotes, setRenderTime]);

	if (!(isOpen && currentRecord)) {
		return null;
	}

	function handleOpenFullPageClick(event: MouseEvent<HTMLAnchorElement>) {
		if (
			event.button === 0 &&
			!event.defaultPrevented &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey
		) {
			close();
		}
	}

	return (
		<Sheet onOpenChange={(open) => !open && close()} open={isOpen}>
			<SheetContent className="w-full gap-0 p-0 sm:max-w-2xl" side="right">
				<SheetHeader className="border-border/70 border-b bg-background/95 px-6 py-5">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="outline">{objectLabel}</Badge>
								{navigationStack.length > 1 ? (
									<Button onClick={goBack} size="sm" variant="ghost">
										<ArrowLeft className="size-4" />
										Back
									</Button>
								) : null}
							</div>
							<SheetTitle className="text-left text-xl">
								{detail && fields
									? getRecordTitle(detail.record, fields)
									: (currentRecord.labelValue ?? currentRecord.recordId)}
							</SheetTitle>
							<SheetDescription className="text-left">
								Open the same unified record model used by the full-page detail
								route.
							</SheetDescription>
						</div>

						<Button asChild size="sm" variant="outline">
							<Link
								onClick={handleOpenFullPageClick}
								params={{
									objectDefId: currentRecord.objectDefId,
									recordId: currentRecord.recordId,
								}}
								to="/demo/crm/$objectDefId/$recordId"
							>
								<ExternalLink className="size-4" />
								Open Full Page
							</Link>
						</Button>
					</div>
				</SheetHeader>

				{isLoadingDetail ? (
					<div className="flex flex-1 items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
						<LoaderCircle className="size-4 animate-spin" />
						Loading record detail...
					</div>
				) : (
					<Tabs className="min-h-0 flex-1" defaultValue="details">
						<div className="border-border/70 border-b px-6 py-3">
							<TabsList variant="line">
								<TabsTrigger value="details">Details</TabsTrigger>
								<TabsTrigger value="relations">Relations</TabsTrigger>
								<TabsTrigger value="history">History</TabsTrigger>
							</TabsList>
						</div>

						<ScrollArea className="h-[calc(100vh-12rem)]">
							<div className="px-6 py-5">
								<TabsContent className="mt-0" value="details">
									<RecordDetailsGrid
										fields={fields}
										isReadOnly={Boolean(isReadOnly)}
										record={detail.record}
										renderField={(field, value, readOnly) => (
											<RecordFieldDisplay
												field={field}
												isReadOnly={readOnly}
												recordId={detail.record._id}
												value={value}
											/>
										)}
									/>
								</TabsContent>

								<TabsContent className="mt-0" value="relations">
									<RecordRelationsSection
										groups={linkedGroups}
										objectsById={objectsById}
										onSelectRecord={drillIntoRecord}
									/>
								</TabsContent>

								<TabsContent className="mt-0" value="history">
									<RecordHistorySection activity={activity} />
								</TabsContent>
							</div>
						</ScrollArea>
					</Tabs>
				)}
			</SheetContent>
		</Sheet>
	);
}
