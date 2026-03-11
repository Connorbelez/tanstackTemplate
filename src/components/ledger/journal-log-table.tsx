import { ArrowRight } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { EntryTypeBadge } from "./entry-type-badge";

export interface JournalEntry {
	_id: string;
	amount: number;
	entryType: string;
	fromLabel: string;
	sequenceNumber: number;
	source: string;
	toLabel: string;
}

export interface JournalLogTableProps {
	entries: JournalEntry[];
}

export function JournalLogTable({ entries }: JournalLogTableProps) {
	if (entries.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Journal Log</CardTitle>
				<p className="text-muted-foreground text-sm">
					All entries across demo mortgages, newest first.
				</p>
			</CardHeader>
			<CardContent>
				<div className="max-h-96 overflow-y-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12">#</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Amount</TableHead>
								<TableHead>Flow</TableHead>
								<TableHead>Source</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{entries.map((entry) => (
								<TableRow key={entry._id}>
									<TableCell className="font-mono text-xs">
										{entry.sequenceNumber}
									</TableCell>
									<TableCell>
										<EntryTypeBadge entryType={entry.entryType} />
									</TableCell>
									<TableCell className="font-mono text-sm">
										{entry.amount.toLocaleString()}
									</TableCell>
									<TableCell className="text-sm">
										<span className="inline-flex items-center gap-1">
											{entry.fromLabel}
											<ArrowRight className="size-3 text-muted-foreground" />
											{entry.toLabel}
										</span>
									</TableCell>
									<TableCell>
										<Badge
											className="text-xs"
											variant={
												entry.source === "seed" ? "secondary" : "outline"
											}
										>
											{entry.source}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
