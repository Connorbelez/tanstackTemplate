"use client";

import { Link } from "@tanstack/react-router";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

export interface AdminDetailSheetProps {
	entityType: string;
}

export function AdminDetailSheet({ entityType }: AdminDetailSheetProps) {
	const { detailOpen, recordId, close } = useAdminDetailSheet();

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
						and{" "}
						<code className="rounded bg-muted px-1 py-0.5 text-xs">
							recordId
						</code>
						{recordId ? (
							<>
								.{" "}
								<Link
									params={{
										entitytype: entityType,
										recordid: recordId,
									}}
									search={{
										detailOpen: false,
										entityType: undefined,
										recordId: undefined,
									}}
									to="/admin/$entitytype/$recordid"
								>
									View record
								</Link>
							</>
						) : null}
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
