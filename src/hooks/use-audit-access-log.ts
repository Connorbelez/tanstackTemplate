import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

type AuditPage =
	| "hash-chain"
	| "audit-trail"
	| "access-log"
	| "pipeline"
	| "export";

/**
 * Logs a single access event when the user navigates to an audit page.
 * Uses a ref guard to prevent double-logging from React Strict Mode.
 */
export function useAuditAccessLog(page: AuditPage, entityId?: string | null) {
	const logAccess = useMutation(api.demo.auditTraceability.logAuditAccess);
	const logged = useRef(false);

	useEffect(() => {
		if (logged.current) {
			return;
		}
		logged.current = true;
		logAccess({ page, entityId: entityId ?? undefined });
	}, [page, entityId, logAccess]);
}
