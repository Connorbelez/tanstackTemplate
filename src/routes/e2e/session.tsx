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

interface ReadyTokenSnapshot {
	accessToken: string;
	organizationId: string | null;
	permissions: string[];
	role: string | null;
	status: "ready";
}

interface ErrorTokenSnapshot {
	error: string;
	status: "error";
}

type TokenSnapshot = ErrorTokenSnapshot | ReadyTokenSnapshot;

function buildSignedOutTokenSnapshot(): ReadyTokenSnapshot {
	return {
		accessToken: "",
		status: "ready",
		organizationId: null,
		permissions: [],
		role: null,
	};
}

function buildTokenErrorSnapshot(): ErrorTokenSnapshot {
	return {
		status: "error",
		error: "token_acquisition_failed",
	};
}

async function loadTokenSnapshot(args: {
	getAccessToken: () => Promise<string | undefined | null>;
	refresh: () => Promise<string | undefined | null>;
	user: { id: string } | null;
}): Promise<TokenSnapshot> {
	if (!args.user) {
		return buildSignedOutTokenSnapshot();
	}

	try {
		const token =
			(await args.refresh()) ?? (await args.getAccessToken()) ?? null;
		if (!token) {
			return buildTokenErrorSnapshot();
		}

		const claims = decodeAccessToken(token);
		return {
			accessToken: token,
			status: "ready",
			organizationId: claims.orgId,
			permissions: claims.permissions,
			role: claims.role,
		};
	} catch {
		return buildTokenErrorSnapshot();
	}
}

function E2eSessionRoute() {
	const isE2E = import.meta.env.VITE_E2E;
	const auth = useAuth();
	const { getAccessToken, refresh } = useAccessToken();
	const [tokenSnapshot, setTokenSnapshot] = useState<TokenSnapshot | null>(
		null
	);

	useEffect(() => {
		let cancelled = false;

		if (!isE2E || auth.loading) {
			return () => {
				cancelled = true;
			};
		}

		void loadTokenSnapshot({
			getAccessToken,
			refresh,
			user: auth.user,
		}).then((snapshot) => {
			if (!cancelled) {
				setTokenSnapshot(snapshot);
			}
		});

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
				accessToken: tokenSnapshot.accessToken,
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
