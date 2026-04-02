"use client";

import { AdminRecordDetailSurface } from "#/components/admin/shell/RecordSidebar";

interface AdminRecordDetailPageProps {
	entityType: string;
	recordId: string;
}

export function AdminRecordDetailPage({
	entityType,
	recordId,
}: AdminRecordDetailPageProps) {
	return (
		<AdminRecordDetailSurface
			reference={{
				entityType,
				recordId,
			}}
			variant="page"
		/>
	);
}
