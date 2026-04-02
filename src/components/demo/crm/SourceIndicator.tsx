import { Database, ServerCog } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import type { CrmDemoMetricSource } from "./types";

export function SourceIndicator({ source }: { source: CrmDemoMetricSource }) {
	return (
		<Badge variant={source === "native" ? "secondary" : "outline"}>
			{source === "native" ? (
				<ServerCog className="size-3.5" />
			) : (
				<Database className="size-3.5" />
			)}
			{source === "native" ? "Native Adapter" : "EAV Storage"}
		</Badge>
	);
}
