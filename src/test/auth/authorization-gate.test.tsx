/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuthorizationGate, useAuthorization } from "#/lib/auth";

const useAppAuthMock = vi.fn();

vi.mock("#/hooks/use-app-auth", () => ({
	useAppAuth: () => useAppAuthMock(),
}));

function setAuthState(overrides: Partial<ReturnType<typeof buildAuthState>> = {}) {
	useAppAuthMock.mockReturnValue({
		...buildAuthState(),
		...overrides,
	});
}

function buildAuthState() {
	return {
		loading: false,
		orgId: "org_staff",
		permissions: ["mortgage:originate"],
		role: "admin",
		roles: ["admin"],
		signOut: vi.fn(),
		user: { id: "user_123" },
	};
}

afterEach(() => {
	cleanup();
	useAppAuthMock.mockReset();
});

function AuthorizationProbe() {
	const authorization = useAuthorization("adminOriginations");
	return <span>{authorization.allowed ? "allowed" : "denied"}</span>;
}

describe("AuthorizationGate", () => {
	it("renders children when the shared authorization facade grants access", () => {
		setAuthState();
		render(
			<AuthorizationGate requirement="adminOriginations">
				<div>visible</div>
			</AuthorizationGate>
		);

		expect(screen.getByText("visible")).not.toBeNull();
	});

	it("renders the fallback when access is denied", () => {
		setAuthState({
			orgId: "org_external",
			permissions: ["broker:access"],
			role: "broker",
			roles: ["broker"],
		});
		render(
			<AuthorizationGate
				fallback={<div>hidden</div>}
				requirement={{ kind: "fairLendAdminWithPermission", permission: "document:review" }}
			>
				<div>visible</div>
			</AuthorizationGate>
		);

		expect(screen.getByText("hidden")).not.toBeNull();
		expect(screen.queryByText("visible")).toBeNull();
	});

	it("renders the loading fallback while auth state is unresolved", () => {
		setAuthState({ loading: true });
		render(
			<AuthorizationGate
				loadingFallback={<div>loading</div>}
				requirement="adminOriginations"
			>
				<div>visible</div>
			</AuthorizationGate>
		);

		expect(screen.getByText("loading")).not.toBeNull();
		expect(screen.queryByText("visible")).toBeNull();
	});

	it("supports the route registry through useAuthorization", () => {
		setAuthState();
		render(<AuthorizationProbe />);
		expect(screen.getByText("allowed")).not.toBeNull();
	});
});
