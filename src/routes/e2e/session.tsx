import { createFileRoute } from "@tanstack/react-router";
import {
	useAccessToken,
	useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/e2e/session")({
	ssr: false,
	component: E2eSessionRoute,
});

function E2eSessionRoute() {
	const isE2E = import.meta.env.VITE_E2E;
	const auth = useAuth();
	const { getAccessToken, refresh } = useAccessToken();
	const [tokenSnapshot, setTokenSnapshot] = useState<
		| {
				status: "ready";
				organizationId: string | null;
				permissions: string[];
				role: string | null;
		  }
		| {
				status: "error";
				error: string;
		  }
		| null
	>(null);

	useEffect(() => {
		let cancelled = false;

		if (!isE2E || auth.loading) {
			return () => {
				cancelled = true;
			};
		}

		void (async () => {
			if (!auth.user) {
				if (!cancelled) {
					setTokenSnapshot({
						status: "ready",
						organizationId: null,
						permissions: [],
						role: null,
					});
				}
				return;
			}

			try {
				const token = (await refresh()) ?? (await getAccessToken()) ?? null;
				if (!token) {
					if (!cancelled) {
						setTokenSnapshot({
							status: "error",
							error: "token_acquisition_failed",
						});
					}
					return;
				}

				const claims = decodeAccessToken(token);

				if (!cancelled) {
					setTokenSnapshot({
						status: "ready",
						organizationId: claims.orgId,
						permissions: claims.permissions,
						role: claims.role,
					});
				}
			} catch {
				if (!cancelled) {
					setTokenSnapshot({
						status: "error",
						error: "token_acquisition_failed",
					});
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [auth.loading, auth.user, getAccessToken, refresh]);

	if (!isE2E) {
		return (
			<pre data-testid="session-json">{JSON.stringify({ disabled: true })}</pre>
		);
	}

	if (auth.loading || tokenSnapshot === null) {
		return <p data-testid="session-loading">loading</p>;
	}

	if (tokenSnapshot.status === "error") {
		return (
			<pre data-testid="session-json">
				{JSON.stringify({
					error: tokenSnapshot.error,
					authOrganizationId: auth.organizationId ?? null,
					authPermissions: auth.permissions ?? [],
					authRole: auth.role ?? null,
					userId: auth.user?.id ?? null,
				})}
			</pre>
		);
	}

	return (
		<pre data-testid="session-json">
			{JSON.stringify({
				authOrganizationId: auth.organizationId ?? null,
				authPermissions: auth.permissions ?? [],
				authRole: auth.role ?? null,
				tokenOrganizationId: tokenSnapshot.organizationId,
				tokenPermissions: tokenSnapshot.permissions,
				tokenRole: tokenSnapshot.role,
				userId: auth.user?.id ?? null,
			})}
		</pre>
	);
}

function decodeAccessToken(token: string | null): {
	orgId: string | null;
	permissions: string[];
	role: string | null;
} {
	if (!token) {
		return {
			orgId: null,
			permissions: [],
			role: null,
		};
	}

	const payload = token.split(".")[1];
	if (!payload) {
		return {
			orgId: null,
			permissions: [],
			role: null,
		};
	}

	try {
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(
			normalized.length + ((4 - (normalized.length % 4)) % 4),
			"="
		);
		const decoded = JSON.parse(window.atob(padded)) as {
			org_id?: string;
			permissions?: unknown;
			role?: string;
		};
		return {
			orgId: decoded.org_id ?? null,
			permissions: Array.isArray(decoded.permissions)
				? decoded.permissions.filter(
						(permission): permission is string => typeof permission === "string"
					)
				: [],
			role: decoded.role ?? null,
		};
	} catch {
		return {
			orgId: null,
			permissions: [],
			role: null,
		};
	}
}
