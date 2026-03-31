import { CheckCircle2, MinusCircle, Shapes } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { CrmDemoTableResult } from "./types";

const UNIFIED_RECORD_KEYS = [
	"_id",
	"_kind",
	"objectDefId",
	"fields",
	"createdAt",
	"updatedAt",
] as const;

export function ShapeComparison({
	record,
}: {
	record?: CrmDemoTableResult["rows"][number];
}) {
	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<Shapes className="size-4" />
					UnifiedRecord contract
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-muted-foreground text-sm">
					System records should expose the same top-level shape that the custom
					EAV renderer expects.
				</p>

				<div className="grid gap-2 sm:grid-cols-2">
					{UNIFIED_RECORD_KEYS.map((key) => {
						const isPresent =
							record !== undefined && Object.hasOwn(record, key);
						return (
							<div
								className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/15 px-3 py-3"
								key={key}
							>
								<span className="font-medium text-sm">{key}</span>
								<Badge variant={isPresent ? "default" : "outline"}>
									{isPresent ? (
										<CheckCircle2 className="size-3.5" />
									) : (
										<MinusCircle className="size-3.5" />
									)}
									{isPresent ? "present" : "pending"}
								</Badge>
							</div>
						);
					})}
				</div>

				{record ? (
					<div className="rounded-2xl border border-border/70 bg-background/80 p-3">
						<p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
							Sample field count
						</p>
						<p className="mt-1 font-medium text-sm">
							{Object.keys(record.fields).length} mapped fields available on the
							native adapter record
						</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
