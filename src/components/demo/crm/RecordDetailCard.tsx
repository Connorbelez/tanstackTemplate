import { useQuery } from "convex/react";
import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Eye,
	LoaderCircle,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { CrmDemoRecordKind } from "./types";
import { formatFieldValue } from "./utils";

type ObjectDef = Doc<"objectDefs">;

interface RecordDetailCardProps {
	objectDef?: ObjectDef;
	recordId?: string;
	recordKind?: CrmDemoRecordKind;
}

export function RecordDetailCard({
	objectDef,
	recordId,
	recordKind,
}: RecordDetailCardProps) {
	const fields = useQuery(
		api.crm.fieldDefs.listFields,
		objectDef ? { objectDefId: objectDef._id } : "skip"
	);
	const detail = useQuery(
		api.crm.recordQueries.getRecordReference,
		objectDef && recordId && recordKind
			? {
					objectDefId: objectDef._id,
					recordId,
					recordKind,
				}
			: "skip"
	);

	if (!(objectDef && recordId && recordKind)) {
		return (
			<Card className="border-border/70 shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Eye className="size-4" />
						Record detail
					</CardTitle>
					<CardDescription>
						Select a row from the table surface to inspect the unified detail
						contract and related links.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader>
				<div className="flex items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2 text-lg">
							<Eye className="size-4" />
							Record detail
						</CardTitle>
						<CardDescription>
							{objectDef.singularLabel} detail via
							`crm.recordQueries.getRecordReference`
						</CardDescription>
					</div>
					<Badge variant={recordKind === "native" ? "secondary" : "outline"}>
						{recordKind}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{detail === undefined || fields === undefined ? (
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<LoaderCircle className="size-4 animate-spin" />
						Loading record detail...
					</div>
				) : null}

				{detail && fields ? (
					<>
						<div className="grid gap-3 md:grid-cols-3">
							<DetailMeta label="Record ID" value={detail.record._id} />
							<DetailMeta
								label="Created"
								value={new Date(detail.record.createdAt).toLocaleString()}
							/>
							<DetailMeta
								label="Updated"
								value={new Date(detail.record.updatedAt).toLocaleString()}
							/>
						</div>

						<div className="grid gap-3">
							{fields.map((field) => (
								<div
									className="rounded-2xl border border-border/70 bg-muted/15 px-4 py-3"
									key={field._id}
								>
									<div className="flex items-center justify-between gap-3">
										<div>
											<p className="font-medium text-sm">{field.label}</p>
											<p className="text-muted-foreground text-xs">
												{field.name}
											</p>
										</div>
										<Badge variant="outline">{field.fieldType}</Badge>
									</div>
									<p className="mt-2 text-sm">
										{formatFieldValue(field, detail.record.fields[field.name])}
									</p>
								</div>
							))}
						</div>

						<Separator />

						<div className="grid gap-3 md:grid-cols-2">
							<LinkSummaryCard
								count={detail.links.outbound.length}
								icon={ArrowUpFromLine}
								label="Outbound links"
							/>
							<LinkSummaryCard
								count={detail.links.inbound.length}
								icon={ArrowDownToLine}
								label="Inbound links"
							/>
						</div>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}

function DetailMeta({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
				{label}
			</p>
			<p className="mt-1 break-all font-medium text-sm">{value}</p>
		</div>
	);
}

function LinkSummaryCard({
	count,
	icon: Icon,
	label,
}: {
	count: number;
	icon: typeof ArrowDownToLine;
	label: string;
}) {
	return (
		<div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
			<div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
				<Icon className="size-3.5" />
				{label}
			</div>
			<p className="mt-2 font-semibold text-xl">{count}</p>
		</div>
	);
}
