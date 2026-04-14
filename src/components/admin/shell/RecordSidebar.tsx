"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	ChevronLeft,
	ExternalLink,
	FileText,
	Folder,
	History,
	Link2,
	PanelRightClose,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Sheet, SheetContent, SheetHeader } from "#/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import {
	getDedicatedAdminRecordRoute,
	isDedicatedAdminEntityType,
} from "#/lib/admin-entity-routes";
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import { ActivityTimeline } from "./ActivityTimeline";
import { EntityIcon } from "./entity-icon";
import {
	getAdminEntityByType,
	getAdminEntityForObjectDef,
} from "./entity-registry";
import {
	type RecordSidebarEntityAdapter,
	type RecordTabRenderArgs,
	resolveRecordSidebarEntityAdapter,
} from "./entity-view-adapters";
import { FieldRenderer } from "./FieldRenderer";
import { LinkedRecordsPanel } from "./LinkedRecordsPanel";
import {
	type SidebarRecordRef,
	useRecordSidebar,
} from "./RecordSidebarProvider";

type DetailField = NormalizedFieldDefinition;
type ObjectDef = Doc<"objectDefs">;
type RecordDetailRecord = UnifiedRecord;
const PLACEHOLDER_RECORD_ID_PATTERN = /^\d+$/;
const FIELD_SKELETON_IDS = [
	"field-skeleton-1",
	"field-skeleton-2",
	"field-skeleton-3",
	"field-skeleton-4",
] as const;

interface RecordDetailSurfaceProps {
	readonly adapters?: Partial<Record<string, RecordSidebarEntityAdapter>>;
	readonly canGoBack?: boolean;
	readonly onBack?: () => void;
	readonly onClose?: () => void;
	readonly reference: SidebarRecordRef;
	readonly variant: "page" | "sheet";
}

export function RecordSidebar({
	adapters,
}: {
	readonly adapters?: Partial<Record<string, RecordSidebarEntityAdapter>>;
}) {
	const { back, canGoBack, close, current, isOpen } = useRecordSidebar();

	return (
		<Sheet
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					close();
				}
			}}
			open={isOpen}
		>
			<SheetContent
				className="w-full gap-0 border-l bg-background p-0 sm:max-w-[560px]"
				showCloseButton={false}
				side="right"
			>
				{current ? (
					<AdminRecordDetailSurface
						adapters={adapters}
						canGoBack={canGoBack}
						onBack={back}
						onClose={close}
						reference={current}
						variant="sheet"
					/>
				) : (
					<div className="flex h-full items-center justify-center p-6">
						<p className="text-center text-muted-foreground text-sm">
							Select a record to inspect it in the sidebar.
						</p>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}

export function AdminRecordDetailSurface({
	adapters,
	canGoBack = false,
	onBack,
	onClose,
	reference,
	variant,
}: RecordDetailSurfaceProps) {
	const { push } = useRecordSidebar();
	const objectDefs = useQuery(api.crm.objectDefs.listObjects);

	const fallbackObjectDef = useMemo(
		() => resolveObjectDef(reference, objectDefs),
		[reference, objectDefs]
	);
	const recordKind =
		reference.recordKind ?? (fallbackObjectDef?.isSystem ? "native" : "record");
	const shouldLoadLiveRecord =
		Boolean(fallbackObjectDef) && !isPlaceholderRecordId(reference.recordId);
	const detailSurface = useQuery(
		api.crm.recordQueries.getRecordDetailSurface,
		fallbackObjectDef && shouldLoadLiveRecord
			? {
					objectDefId: fallbackObjectDef._id,
					recordId: reference.recordId,
					recordKind,
				}
			: "skip"
	);
	const objectDef = detailSurface?.objectDef ?? fallbackObjectDef;
	const adapterContract = detailSurface?.adapterContract;
	const detailFields = detailSurface?.fields;
	const record = detailSurface?.record;
	const entity = useMemo(
		() =>
			resolveAdminEntity(
				adapterContract?.entityType ?? reference.entityType,
				objectDef ?? undefined
			),
		[adapterContract?.entityType, objectDef, reference.entityType]
	);
	const resolvedEntityType =
		adapterContract?.entityType ?? entity?.entityType ?? reference.entityType;
	const adapter = useMemo(
		() =>
			resolveRecordSidebarEntityAdapter({
				detailSurfaceKey: adapterContract?.detailSurfaceKey,
				entityType: resolvedEntityType,
				objectDef,
				overrides: adapters,
			}),
		[adapters, adapterContract?.detailSurfaceKey, objectDef, resolvedEntityType]
	);
	const fullPageTarget = useMemo(() => {
		if (!resolvedEntityType) {
			return null;
		}

		if (isDedicatedAdminEntityType(resolvedEntityType)) {
			return {
				to: getDedicatedAdminRecordRoute(resolvedEntityType),
				params: {
					recordid: reference.recordId,
				},
			} as const;
		}

		return {
			to: "/admin/$entitytype/$recordid" as const,
			params: {
				entitytype: resolvedEntityType,
				recordid: reference.recordId,
			},
		} as const;
	}, [reference.recordId, resolvedEntityType]);

	const title =
		adapter?.getRecordTitle?.({
			adapterContract,
			entity,
			objectDef,
			record,
			recordId: reference.recordId,
		}) ??
		getRecordTitle(
			record,
			objectDef,
			entity,
			reference.recordId,
			adapterContract
		);
	const status =
		adapter?.getRecordStatus?.({
			adapterContract,
			entity,
			objectDef,
			record,
		}) ?? getDefaultRecordStatus(recordKind, record, adapterContract);
	const recordLabel =
		objectDef?.singularLabel ?? entity?.singularLabel ?? "Record";
	const iconName = entity?.iconName ?? objectDef?.icon;
	const sharedTabArgs: RecordTabRenderArgs = {
		adapterContract,
		entity,
		fields: detailFields ?? [],
		objectDef,
		record,
		reference,
	};

	const content = (
		<div className="flex min-h-0 flex-1 flex-col">
			<SheetHeader
				className={cn(
					"gap-4 border-b pb-5",
					variant === "page" && "rounded-xl border bg-card px-6 py-6"
				)}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
							<EntityIcon className="h-5 w-5" iconName={iconName} />
						</div>
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								{variant === "sheet" ? (
									<h2 className="font-semibold text-xl">{title}</h2>
								) : (
									<h1 className="font-semibold text-2xl">{title}</h1>
								)}
								<Badge variant="secondary">{recordLabel}</Badge>
								{status ? <Badge variant="outline">{status}</Badge> : null}
							</div>
							<p className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
								<span>ID {reference.recordId}</span>
								<span aria-hidden="true">•</span>
								<span>
									{recordKind === "native" ? "Native adapter" : "CRM record"}
								</span>
							</p>
						</div>
					</div>

					<div className="flex items-center gap-2">
						{canGoBack && onBack ? (
							<Button
								onClick={onBack}
								size="icon"
								type="button"
								variant="ghost"
							>
								<ChevronLeft className="h-4 w-4" />
								<span className="sr-only">Back</span>
							</Button>
						) : null}
						{fullPageTarget ? (
							<Button asChild size="sm" variant="outline">
								<Link
									onClick={() => onClose?.()}
									params={fullPageTarget.params}
									search={EMPTY_ADMIN_DETAIL_SEARCH}
									to={fullPageTarget.to}
									viewTransition
								>
									Open Full Page
									<ExternalLink className="h-4 w-4" />
								</Link>
							</Button>
						) : null}
						{variant === "sheet" && onClose ? (
							<Button
								onClick={onClose}
								size="icon"
								type="button"
								variant="ghost"
							>
								<PanelRightClose className="h-4 w-4" />
								<span className="sr-only">Close</span>
							</Button>
						) : null}
					</div>
				</div>

				<RecordMetaRow record={record} />
			</SheetHeader>

			<div
				className={cn(
					"min-h-0 flex-1 overflow-y-auto",
					variant === "page" && "rounded-xl border bg-card"
				)}
			>
				<Tabs className="min-h-0 flex-1" defaultValue="details">
					<div className="border-b px-4 pt-4 sm:px-6">
						<TabsList className="w-full justify-start" variant="line">
							<TabsTrigger value="details">Details</TabsTrigger>
							<TabsTrigger value="relations">Relations</TabsTrigger>
							<TabsTrigger value="notes">Notes</TabsTrigger>
							<TabsTrigger value="files">Files</TabsTrigger>
							<TabsTrigger value="history">History</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent className="space-y-4 p-4 sm:p-6" value="details">
						<DetailsTab
							adapter={adapter}
							adapterContract={adapterContract}
							entity={entity}
							fields={detailFields}
							isLoading={shouldLoadLiveRecord && detailSurface === undefined}
							objectDef={objectDef}
							record={record}
							recordId={reference.recordId}
						/>
					</TabsContent>

					<TabsContent className="p-4 sm:p-6" value="relations">
						{objectDef && record ? (
							<LinkedRecordsPanel
								objectDefId={objectDef._id}
								onNavigate={(recordId, linkedRecordKind, linkedObjectDefId) => {
									push({
										entityType: objectDefs
											? getAdminEntityForObjectDef(
													objectDefs.find(
														(candidate) =>
															String(candidate._id) === linkedObjectDefId
													) ?? {}
												)?.entityType
											: undefined,
										objectDefId: linkedObjectDefId,
										recordId,
										recordKind: linkedRecordKind,
									});
								}}
								recordId={record._id}
								recordKind={record._kind}
							/>
						) : (
							<UnavailableTab
								description="Linked records will appear here once this table is wired to live entity data."
								icon={<Link2 className="h-5 w-5" />}
								title="Relations unavailable"
							/>
						)}
					</TabsContent>

					<TabsContent className="p-4 sm:p-6" value="notes">
						{adapter?.renderNotesTab?.(sharedTabArgs) ?? (
							<UnavailableTab
								description="Notes are intentionally adapter-driven so each entity can supply the right editing and persistence behavior."
								icon={<FileText className="h-5 w-5" />}
								title="Notes adapter not configured"
							/>
						)}
					</TabsContent>

					<TabsContent className="p-4 sm:p-6" value="files">
						{adapter?.renderFilesTab?.(sharedTabArgs) ?? (
							<UnavailableTab
								description="Files are also pluggable. Wire this entity to a storage adapter when upload and access contracts are ready."
								icon={<Folder className="h-5 w-5" />}
								title="Files adapter not configured"
							/>
						)}
					</TabsContent>

					<TabsContent className="p-4 sm:p-6" value="history">
						{record ? (
							<ActivityTimeline
								recordId={record._id}
								recordKind={record._kind}
							/>
						) : (
							<UnavailableTab
								description="History will populate once the selected record resolves to a live CRM or native entity."
								icon={<History className="h-5 w-5" />}
								title="History unavailable"
							/>
						)}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);

	if (variant === "page") {
		return <div className="space-y-6">{content}</div>;
	}

	return content;
}

function RecordMetaRow({
	record,
}: {
	readonly record: RecordDetailRecord | undefined;
}) {
	if (!record) {
		return null;
	}

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<div className="rounded-lg border bg-muted/30 px-3 py-2">
				<p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
					Created
				</p>
				<p className="mt-1 text-sm">{formatTimestamp(record.createdAt)}</p>
			</div>
			<div className="rounded-lg border bg-muted/30 px-3 py-2">
				<p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
					Updated
				</p>
				<p className="mt-1 text-sm">{formatTimestamp(record.updatedAt)}</p>
			</div>
		</div>
	);
}

function DetailsTab({
	adapterContract,
	adapter,
	entity,
	fields,
	isLoading,
	objectDef,
	record,
	recordId,
}: {
	readonly adapterContract: EntityViewAdapterContract | undefined;
	readonly adapter: RecordSidebarEntityAdapter | undefined;
	readonly entity: ReturnType<typeof getAdminEntityByType> | undefined;
	readonly fields: readonly DetailField[] | undefined;
	readonly isLoading: boolean;
	readonly objectDef: ObjectDef | undefined;
	readonly record: RecordDetailRecord | undefined;
	readonly recordId: string;
}) {
	if (!objectDef) {
		return (
			<UnavailableTab
				description="This entity is not mapped to a CRM object definition yet, so the detail surface can only show route-level context."
				icon={<FileText className="h-5 w-5" />}
				title="Object definition unavailable"
			/>
		);
	}

	if (isLoading) {
		return (
			<div className="space-y-3">
				{FIELD_SKELETON_IDS.map((skeletonId) => (
					<div
						className="h-24 animate-pulse rounded-lg border bg-muted/40"
						key={skeletonId}
					/>
				))}
			</div>
		);
	}

	if (!record) {
		return (
			<div className="space-y-4">
				<UnavailableTab
					description="The current admin list is still using placeholder table rows, so there is no live record payload to load yet."
					icon={<FileText className="h-5 w-5" />}
					title="Live record data unavailable"
				/>
				<div className="rounded-lg border bg-muted/20 p-4 text-sm">
					<p>
						<span className="font-medium">Entity:</span>{" "}
						{entity?.pluralLabel ?? objectDef.pluralLabel}
					</p>
					<p>
						<span className="font-medium">Record ID:</span> {recordId}
					</p>
				</div>
			</div>
		);
	}

	const adapterDetails = adapter?.renderDetailsTab?.({
		adapterContract,
		entity,
		fields: fields ?? [],
		objectDef,
		record,
		recordId,
	});
	if (adapterDetails != null) {
		return adapterDetails;
	}

	const visibleFields = (fields ?? []).filter((field) =>
		hasRenderableFieldValue(record.fields[field.name])
	);

	if (visibleFields.length === 0) {
		return (
			<UnavailableTab
				description="This record resolved successfully, but none of its configured fields currently have values."
				icon={<FileText className="h-5 w-5" />}
				title="No field values yet"
			/>
		);
	}

	return (
		<div className="grid gap-3">
			{visibleFields.map((field) => (
				<FieldRenderer
					field={field}
					key={field.name}
					value={record.fields[field.name]}
				/>
			))}
		</div>
	);
}

function UnavailableTab({
	description,
	icon,
	title,
}: {
	readonly description: string;
	readonly icon: ReactNode;
	readonly title: string;
}) {
	return (
		<div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
			<div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-background text-muted-foreground">
				{icon}
			</div>
			<p className="mt-4 font-medium text-sm">{title}</p>
			<p className="mt-2 text-muted-foreground text-sm">{description}</p>
		</div>
	);
}

function resolveObjectDef(
	reference: SidebarRecordRef,
	objectDefs: readonly ObjectDef[] | undefined
) {
	if (!objectDefs) {
		return undefined;
	}

	if (reference.objectDefId) {
		const matchedById = objectDefs.find(
			(objectDef) => String(objectDef._id) === reference.objectDefId
		);
		if (matchedById) {
			return matchedById;
		}
	}

	const entity = reference.entityType
		? getAdminEntityByType(reference.entityType)
		: undefined;
	if (!entity) {
		return undefined;
	}

	return objectDefs.find((objectDef) => {
		const candidates = normalizeCandidateStrings([
			objectDef.name,
			objectDef.nativeTable,
			objectDef.singularLabel,
			objectDef.pluralLabel,
		]);

		const entityCandidates = normalizeCandidateStrings([
			entity.entityType,
			entity.tableName,
			entity.singularLabel,
			entity.pluralLabel,
		]);

		return entityCandidates.some((candidate) => candidates.includes(candidate));
	});
}

function normalizeCandidateStrings(
	values: readonly (string | undefined)[]
): string[] {
	return values.flatMap((value) =>
		typeof value === "string" && value.trim().length > 0
			? [value.trim().toLowerCase()]
			: []
	);
}

function resolveAdminEntity(
	entityType: string | undefined,
	objectDef: ObjectDef | undefined
) {
	if (entityType) {
		const matchedEntity = getAdminEntityByType(entityType);
		if (matchedEntity) {
			return matchedEntity;
		}
	}

	return objectDef ? getAdminEntityForObjectDef(objectDef) : undefined;
}

function hasRenderableFieldValue(value: unknown): boolean {
	return value !== undefined && value !== null && value !== "";
}

function getRecordTitle(
	record: RecordDetailRecord | undefined,
	objectDef: ObjectDef | undefined,
	entity: ReturnType<typeof getAdminEntityByType> | undefined,
	recordId: string,
	adapterContract: EntityViewAdapterContract | undefined
) {
	if (record) {
		const priorityKeys = [
			adapterContract?.titleFieldName,
			"name",
			"label",
			"title",
			"address",
			"streetAddress",
		].filter((value): value is string => Boolean(value));
		for (const key of priorityKeys) {
			const value = record.fields[key];
			if (typeof value === "string" && value.trim().length > 0) {
				return value;
			}
		}

		const firstStringValue = Object.values(record.fields).find(
			(value): value is string =>
				typeof value === "string" && value.trim().length > 0
		);
		if (firstStringValue) {
			return firstStringValue;
		}
	}

	return `${objectDef?.singularLabel ?? entity?.singularLabel ?? "Record"} ${recordId}`;
}

function getDefaultRecordStatus(
	recordKind: "record" | "native",
	record: RecordDetailRecord | undefined,
	adapterContract: EntityViewAdapterContract | undefined
) {
	if (record) {
		const statusCandidate = adapterContract?.statusFieldName
			? record.fields[adapterContract.statusFieldName]
			: record.fields.status;
		if (
			typeof statusCandidate === "string" &&
			statusCandidate.trim().length > 0
		) {
			return statusCandidate;
		}
	}

	return recordKind === "native" ? "Native" : "CRM";
}

function isPlaceholderRecordId(recordId: string) {
	return PLACEHOLDER_RECORD_ID_PATTERN.test(recordId);
}

function formatTimestamp(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}
