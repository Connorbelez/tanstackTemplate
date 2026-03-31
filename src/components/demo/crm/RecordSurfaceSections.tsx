import {
	Activity,
	ArrowUpRight,
	Link2,
	LoaderCircle,
	UserCircle2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { ActivityQueryResult } from "../../../../convex/crm/types";
import {
	getRecordSupportingText,
	getRecordTitle,
	renderFieldValue,
	renderSourceBadge,
} from "./cell-renderers";
import type { CrmDemoRecordReference, CrmDemoTableResult } from "./types";

type FieldDef = Doc<"fieldDefs">;
type ObjectDef = Doc<"objectDefs">;
type LinkedRecordGroup = Array<{
	direction: "outbound" | "inbound";
	links: Array<{
		labelValue?: string;
		linkId: string;
		linkTypeDefId: string;
		objectDefId: string;
		recordId: string;
		recordKind: "record" | "native";
	}>;
	linkTypeDefId: string;
	linkTypeName: string;
}>;

interface RecordSummaryProps {
	children?: ReactNode;
	fields: FieldDef[];
	objectDef: Pick<ObjectDef, "nativeTable" | "singularLabel">;
	record: CrmDemoTableResult["rows"][number];
}

export function RecordSummaryCard({
	children,
	fields,
	objectDef,
	record,
}: RecordSummaryProps) {
	return (
		<div className="rounded-3xl border border-border/70 bg-gradient-to-br from-background via-background to-muted/25 p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						{renderSourceBadge(record._kind)}
						<Badge variant="outline">{objectDef.singularLabel}</Badge>
					</div>
					<div>
						<h2 className="font-semibold text-2xl tracking-tight">
							{getRecordTitle(record, fields)}
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							{getRecordSupportingText(record, objectDef)}
						</p>
					</div>
				</div>
				{children}
			</div>

			<div className="mt-5 grid gap-3 md:grid-cols-3">
				<SummaryStat label="Record ID" value={record._id} />
				<SummaryStat
					label="Created"
					value={new Date(record.createdAt).toLocaleString()}
				/>
				<SummaryStat
					label="Updated"
					value={new Date(record.updatedAt).toLocaleString()}
				/>
			</div>
		</div>
	);
}

export function RecordRelationsSection({
	groups,
	onSelectRecord,
	objectsById,
}: {
	groups: LinkedRecordGroup | undefined;
	objectsById: Map<string, Pick<ObjectDef, "_id" | "singularLabel">>;
	onSelectRecord?: (record: CrmDemoRecordReference) => void;
}) {
	if (groups === undefined) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<LoaderCircle className="size-4 animate-spin" />
				Loading linked records...
			</div>
		);
	}

	if (groups.length === 0) {
		return (
			<div className="rounded-2xl border border-border/70 border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
				No related records yet. Links created in Link Explorer will appear here.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{groups.map((group) => (
				<div
					className="rounded-2xl border border-border/70 bg-muted/15 p-4"
					key={`${group.direction}-${group.linkTypeDefId}`}
				>
					<div className="flex items-center gap-2">
						<Badge variant="outline">{group.direction}</Badge>
						<p className="font-medium text-sm">{group.linkTypeName}</p>
						<Badge variant="secondary">{group.links.length}</Badge>
					</div>

					<div className="mt-3 grid gap-2">
						{group.links.map((link) => {
							const linkedObject = objectsById.get(link.objectDefId);
							const reference: CrmDemoRecordReference = {
								labelValue: link.labelValue,
								objectDefId: link.objectDefId as Doc<"objectDefs">["_id"],
								recordId: link.recordId,
								recordKind: link.recordKind,
							};

							return (
								<Button
									className="h-auto justify-between rounded-xl border border-border/60 bg-background/90 px-3 py-3 text-left hover:bg-background"
									key={link.linkId}
									onClick={() => onSelectRecord?.(reference)}
									variant="ghost"
								>
									<div>
										<p className="font-medium text-sm">
											{link.labelValue ?? link.recordId}
										</p>
										<p className="text-muted-foreground text-xs">
											{linkedObject?.singularLabel ?? "Related record"} •{" "}
											{link.recordKind}
										</p>
									</div>
									<ArrowUpRight className="size-4 text-muted-foreground" />
								</Button>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

export function RecordHistorySection({
	activity,
}: {
	activity: ActivityQueryResult | undefined;
}) {
	if (activity === undefined) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<LoaderCircle className="size-4 animate-spin" />
				Loading activity...
			</div>
		);
	}

	if (activity.events.length === 0) {
		return (
			<div className="rounded-2xl border border-border/70 border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
				No activity captured for this record yet.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{activity.events.map((event, index) => (
				<div className="flex gap-3" key={event._id}>
					<div className="flex flex-col items-center">
						<div className="flex size-9 items-center justify-center rounded-full border border-border/70 bg-background">
							<Activity className="size-4 text-muted-foreground" />
						</div>
						{index < activity.events.length - 1 ? (
							<div className="mt-2 h-full w-px bg-border" />
						) : null}
					</div>

					<div className="flex-1 rounded-2xl border border-border/70 bg-muted/15 p-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p className="font-medium text-sm">{event.description}</p>
								<div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
									<UserCircle2 className="size-3.5" />
									{event.actor.name}
								</div>
							</div>
							<div className="text-right text-muted-foreground text-xs">
								<p>{new Date(event.timestamp).toLocaleString()}</p>
								<p>{event.action}</p>
							</div>
						</div>

						{event.diff ? (
							<>
								<Separator className="my-3" />
								<div className="grid gap-2 md:grid-cols-2">
									<DiffBlock label="Before" value={event.diff.before} />
									<DiffBlock label="After" value={event.diff.after} />
								</div>
							</>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
}

export function RecordDetailsGrid({
	fields,
	isReadOnly,
	record,
	renderField,
}: {
	fields: FieldDef[];
	isReadOnly: boolean;
	record: CrmDemoTableResult["rows"][number];
	renderField: (
		field: FieldDef,
		value: unknown,
		isReadOnly: boolean
	) => ReactNode;
}) {
	return (
		<div className="grid gap-4">
			{fields.map((field) => (
				<div key={field._id}>
					{renderField(field, record.fields[field.name], isReadOnly)}
				</div>
			))}
		</div>
	);
}

export function RecordHighlights({
	fields,
	record,
}: {
	fields: FieldDef[];
	record: CrmDemoTableResult["rows"][number];
}) {
	const highlightFields = fields.slice(0, 4);

	return (
		<div className="space-y-3 rounded-3xl border border-border/70 bg-muted/15 p-4">
			<div className="flex items-center gap-2">
				<Link2 className="size-4 text-muted-foreground" />
				<h3 className="font-medium text-sm">Key fields</h3>
			</div>
			<div className="grid gap-3">
				{highlightFields.map((field) => (
					<div
						className="rounded-2xl border border-border/60 bg-background/85 px-3 py-3"
						key={field._id}
					>
						<p className="text-muted-foreground text-xs">{field.label}</p>
						<div className="mt-1 text-sm">
							{renderFieldValue(field, record.fields[field.name])}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function SummaryStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-border/70 bg-muted/15 px-4 py-3">
			<p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
				{label}
			</p>
			<p className="mt-1 break-all font-medium text-sm">{value}</p>
		</div>
	);
}

function DiffBlock({
	label,
	value,
}: {
	label: string;
	value: Record<string, unknown> | undefined;
}) {
	return (
		<div className="rounded-2xl border border-border/60 bg-background/85 p-3">
			<p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
				{label}
			</p>
			<pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">
				{JSON.stringify(value ?? {}, null, 2)}
			</pre>
		</div>
	);
}
