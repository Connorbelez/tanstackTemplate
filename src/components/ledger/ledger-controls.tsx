import { Database, Trash2 } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export interface LedgerControlsProps {
	entryCount?: number;
	hasDemoData: boolean;
	loading: boolean;
	mortgageCount?: number;
	onCleanup: () => void;
	onSeed: () => void;
}

export function LedgerControls({
	hasDemoData,
	loading,
	onSeed,
	onCleanup,
	mortgageCount,
	entryCount,
}: LedgerControlsProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Database className="size-4" />
					Controls
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-3">
					<Button
						disabled={hasDemoData || loading}
						onClick={onSeed}
						variant="outline"
					>
						<Database className="mr-2 size-4" />
						Seed Demo Data
					</Button>
					<Button
						disabled={!hasDemoData || loading}
						onClick={onCleanup}
						variant="destructive"
					>
						<Trash2 className="mr-2 size-4" />
						Clean Up All Demo Data
					</Button>
				</div>
				{mortgageCount != null && entryCount != null && (
					<div className="flex gap-3">
						<Badge variant="outline">Mortgages: {mortgageCount}</Badge>
						<Badge variant="outline">Entries: {entryCount}</Badge>
					</div>
				)}
				<p className="text-muted-foreground text-xs">
					Demo data uses <code className="rounded bg-muted px-1">demo-</code>{" "}
					prefixed IDs. Cleanup removes all demo entries and accounts.
				</p>
			</CardContent>
		</Card>
	);
}
