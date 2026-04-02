"use client";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { AdminNotFoundState } from "./AdminRouteStates";
import {
	getAdminPreviewEntityMeta,
	getAdminPreviewRecord,
} from "./admin-preview-records";
import { EntityIcon } from "./entity-icon";

interface AdminRecordDetailPageProps {
	entityType: string;
	recordId: string;
}

export function AdminRecordDetailPage({
	entityType,
	recordId,
}: AdminRecordDetailPageProps) {
	const entity = getAdminPreviewEntityMeta(entityType);
	if (!entity) {
		return <AdminNotFoundState entityType={entityType} variant="entity" />;
	}

	const record = getAdminPreviewRecord(entityType, recordId);
	if (!record) {
		return (
			<AdminNotFoundState
				entityType={entityType}
				recordId={recordId}
				variant="record"
			/>
		);
	}

	const formattedAmount = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(record.amount);

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_20rem]">
			<Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background to-muted/20">
				<CardHeader className="gap-4 border-border/60 border-b pb-6">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<Badge className="rounded-full px-3 py-1" variant="secondary">
									<EntityIcon className="size-3.5" iconName={entity.iconName} />
									{entity.singularLabel}
								</Badge>
								<Badge className="rounded-full px-3 py-1" variant="outline">
									Record {record.id}
								</Badge>
							</div>
							<div className="space-y-1">
								<CardTitle className="text-3xl tracking-tight">
									{record.name}
								</CardTitle>
								<CardDescription className="max-w-xl text-sm leading-6">
									This is a shell detail experience for{" "}
									{entity.pluralLabel.toLowerCase()}. The record route is alive,
									URL-addressable, and ready for richer metadata once real data
									loading lands.
								</CardDescription>
							</div>
						</div>
						<Button className="rounded-full px-5" size="sm" variant="outline">
							Inspect activity
						</Button>
					</div>
				</CardHeader>
				<CardContent className="grid gap-4 pt-6 md:grid-cols-3">
					<RecordStatCard label="Exposure" value={formattedAmount} />
					<RecordStatCard
						label="Route key"
						value={`/admin/${entity.entityType}/${record.id}`}
					/>
					<RecordStatCard label="Status" value="Preview connected" />
				</CardContent>
			</Card>
			<div className="grid gap-4">
				<RecordSidePanel
					items={[
						{ label: "Entity type", value: entity.entityType },
						{ label: "Singular label", value: entity.singularLabel },
						{ label: "Plural label", value: entity.pluralLabel },
						{ label: "Record id", value: recordId },
					]}
					title="Route payload"
				/>
				<RecordSidePanel
					items={[
						{
							label: "Table view",
							value: entity.supportsTableView ? "Available" : "Unavailable",
						},
						{
							label: "Detail view",
							value: entity.supportsDetailPage ? "Available" : "Unavailable",
						},
						{ label: "Table source", value: entity.tableName ?? "Unspecified" },
					]}
					title="Registry metadata"
				/>
			</div>
		</div>
	);
}

function RecordStatCard({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	return (
		<div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
			<p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
				{label}
			</p>
			<p className="mt-3 break-all font-medium text-base">{value}</p>
		</div>
	);
}

function RecordSidePanel({
	items,
	title,
}: {
	readonly items: ReadonlyArray<{ label: string; value: string }>;
	readonly title: string;
}) {
	return (
		<Card className="border-border/70 bg-background/80">
			<CardHeader className="pb-1">
				<CardTitle className="text-base">{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{items.map((item) => (
					<div
						className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-muted/25 px-4 py-3"
						key={item.label}
					>
						<span className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
							{item.label}
						</span>
						<span className="max-w-[11rem] break-all text-right font-medium text-sm">
							{item.value}
						</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
