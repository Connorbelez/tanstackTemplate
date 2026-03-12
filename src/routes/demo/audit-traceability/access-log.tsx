import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Eye } from "lucide-react";
import { AccessLogContent } from "#/components/audit-traceability/shared";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { useAuditAccessLog } from "#/hooks/use-audit-access-log";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/audit-traceability/access-log")({
	ssr: false,
	component: AccessLogPage,
});

function AccessLogPage() {
	useAuditAccessLog("access-log");
	const accessLog = useQuery(api.demo.auditTraceability.getAccessLog, {});

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Eye className="size-4" />
						Audit Access Log
					</CardTitle>
					<CardDescription>
						Records of who viewed audit data and when. This log itself is
						evidence of SOC 2 CC6.1 access monitoring controls.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<AccessLogContent accessLog={accessLog} />
				</CardContent>
			</Card>
		</div>
	);
}
