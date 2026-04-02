"use client";

import { AppErrorComponent } from "#/components/error-boundary";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";

export function AdminRouteErrorBoundary({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-1 items-start justify-center py-6">
			<AppErrorComponent error={error} reset={reset} />
		</div>
	);
}

export function AdminPageSkeleton({
	titleWidth = "w-56",
	descriptionWidth = "w-72",
	children,
}: {
	children?: React.ReactNode;
	descriptionWidth?: string;
	titleWidth?: string;
}) {
	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<Skeleton className={`h-8 ${titleWidth}`} />
				<Skeleton className={`h-4 ${descriptionWidth}`} />
			</div>
			{children}
		</div>
	);
}

export function AdminTableSkeleton({
	columnCount = 4,
	rowCount = 6,
}: {
	columnCount?: number;
	rowCount?: number;
}) {
	const headerKeys = Array.from(
		{ length: columnCount },
		(_, index) => `header-${index + 1}`
	);
	const rowKeys = Array.from(
		{ length: rowCount },
		(_, index) => `row-${index + 1}`
	);
	const cellKeys = Array.from(
		{ length: columnCount },
		(_, index) => `cell-${index + 1}`
	);

	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						{headerKeys.map((headerKey) => (
							<TableHead key={headerKey}>
								<Skeleton className="h-4 w-20" />
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rowKeys.map((rowKey) => (
						<TableRow key={rowKey}>
							{cellKeys.map((cellKey, columnIndex) => (
								<TableCell key={`${rowKey}-${cellKey}`}>
									<Skeleton
										className={
											columnIndex === columnCount - 1
												? "ml-auto h-4 w-16"
												: "h-4 w-full max-w-36"
										}
									/>
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
