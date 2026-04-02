"use client";

interface AdminRecordDetailPageProps {
	entityType: string;
	recordId: string;
}

export function AdminRecordDetailPage({
	entityType,
	recordId,
}: AdminRecordDetailPageProps) {
	return (
		<div className="space-y-4 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Record detail</h1>
				<p className="text-muted-foreground text-sm">
					Full-page detail route for the selected admin record.
				</p>
			</div>
			<div className="rounded-md border p-4 text-sm">
				<p>
					<span className="font-medium">entityType:</span> {entityType}
				</p>
				<p>
					<span className="font-medium">recordId:</span> {recordId}
				</p>
			</div>
		</div>
	);
}
