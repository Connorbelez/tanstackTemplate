"use client";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import {
	getDedicatedAdminRecordRoute,
	isDedicatedAdminEntityType,
} from "#/lib/admin-entity-routes";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

export interface AdminDetailSheetProps {
	entityType?: string;
}

export function AdminDetailSheet({ entityType }: AdminDetailSheetProps) {
	const {
		detailOpen,
		recordId,
		close,
		entityType: activeEntityType,
	} = useAdminDetailSheet();
	const resolvedEntityType = entityType ?? activeEntityType;
	const detailSearch = {
		detailOpen: false,
		entityType: undefined,
		recordId: undefined,
	} as const;
	let recordLink: ReactNode = (
		<span className="cursor-not-allowed text-muted-foreground">
			View record (select a row first)
		</span>
	);

	if (recordId && resolvedEntityType) {
		if (isDedicatedAdminEntityType(resolvedEntityType)) {
			recordLink = (
				<Link
					params={{
						recordid: recordId,
					}}
					search={detailSearch}
					to={getDedicatedAdminRecordRoute(resolvedEntityType)}
				>
					View record
				</Link>
			);
		} else {
			recordLink = (
				<Link
					params={{
						entitytype: resolvedEntityType,
						recordid: recordId,
					}}
					search={detailSearch}
					to="/admin/$entitytype/$recordid"
				>
					View record
				</Link>
			);
		}
	}

	return (
		<Sheet
			onOpenChange={(open) => {
				if (!open) {
					close();
				}
			}}
			open={detailOpen}
		>
			<SheetContent className="flex flex-col gap-4" side="right">
				<SheetHeader>
					<SheetTitle>Record detail</SheetTitle>
					<SheetDescription>
						State is driven by URL search params:{" "}
						<code className="rounded bg-muted px-1 py-0.5 text-xs">
							detailOpen
						</code>{" "}
						and {recordLink}
					</SheetDescription>
				</SheetHeader>
				<div className="text-sm">
					<p>
						<span className="font-medium">recordId:</span> {recordId ?? "—"}
					</p>
				</div>
				<Button onClick={() => close()} type="button" variant="secondary">
					Close (clears search params)
				</Button>
			</SheetContent>
		</Sheet>
	);
}
