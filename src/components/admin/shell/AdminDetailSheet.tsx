"use client";

import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AdminRecordDetailSurface } from "./RecordSidebar";

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

	return (
		<Sheet
			onOpenChange={(open) => {
				if (!open) {
					close();
				}
			}}
			open={detailOpen}
		>
			<SheetContent
				className="w-full gap-0 border-l bg-background p-0 sm:max-w-[560px]"
				showCloseButton={false}
				side="right"
			>
				{recordId && resolvedEntityType ? (
					<AdminRecordDetailSurface
						onClose={close}
						reference={{
							entityType: resolvedEntityType,
							recordId,
						}}
						variant="sheet"
					/>
				) : (
					<div className="flex h-full items-center justify-center p-6">
						<p className="text-center text-muted-foreground text-sm">
							Select a record to inspect it in the shared detail surface.
						</p>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
