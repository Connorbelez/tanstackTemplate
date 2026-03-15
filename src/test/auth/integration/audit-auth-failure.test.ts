/**
 * T-016: Audit auth failure integration tests.
 *
 * Verifies that middleware rejections throw the expected error messages
 * and emit the corresponding auth audit events.
 */

import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { auditAuthFailure } from "../../../../convex/auth/auditAuth";
import {
	createMockViewer,
	createTestConvex,
	seedFromIdentity,
} from "../helpers";
import { BROKER, FAIRLEND_ADMIN, MEMBER } from "../identities";
import { lookupPermissions } from "../permissions";

async function getAuthEventsByActor(
	t: ReturnType<typeof createTestConvex>,
	actorId: string
) {
	return t
		.withIdentity(FAIRLEND_ADMIN)
		.query(api.audit.queries.getAuthEventsByActor, {
			actorId,
			limit: 20,
		});
}

type AuthAuditEvent = Awaited<ReturnType<typeof getAuthEventsByActor>>[number];

async function expectAuthFailureEvent(
	t: ReturnType<typeof createTestConvex>,
	args: {
		action: string;
		actorId: string;
		middleware: string;
		orgId?: string;
		required?: string;
		reason: string;
		userPermissions: string[];
		userRoles: string[];
	}
) {
	const events = await getAuthEventsByActor(t, args.actorId);
	const matchingEvent = events.find(
		(event: AuthAuditEvent) =>
			event.action === args.action &&
			event.actorId === args.actorId &&
			event.resourceId === args.middleware &&
			event.resourceType === "auth_check" &&
			event.severity === "warning" &&
			event.metadata?.middleware === args.middleware &&
			event.metadata?.orgId === args.orgId &&
			event.metadata?.reason === args.reason &&
			event.metadata?.required === args.required &&
			JSON.stringify(event.metadata?.userPermissions ?? []) ===
				JSON.stringify(args.userPermissions) &&
			JSON.stringify(event.metadata?.userRoles ?? []) ===
				JSON.stringify(args.userRoles)
	);
	if (!matchingEvent) {
		throw new Error(
			`Expected auth failure event ${args.action} for actor ${args.actorId}. Events: ${JSON.stringify(events)}`
		);
	}
}

describe("audit auth failure", () => {
	describe("mutation auth failure", () => {
		it("throws expected error for non-admin calling adminMutation", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t
					.withIdentity(BROKER)
					.mutation(api.test.authTestEndpoints.testRequireAdminMutation)
			).rejects.toThrow("Forbidden: admin role required");
		});

		it("writes a persisted auth audit event when the audit helper runs", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			await t.run(async (ctx) => {
				await auditAuthFailure(
					ctx,
					{
						authId: BROKER.subject,
						orgId: BROKER.org_id,
						permissions: new Set(JSON.parse(BROKER.permissions) as string[]),
						roles: new Set(JSON.parse(BROKER.roles) as string[]),
					},
					{
						middleware: "requireAdmin",
						reason: "User does not have admin role",
					}
				);
			});

			await expectAuthFailureEvent(t, {
				action: "auth.requireAdmin_denied",
				actorId: BROKER.subject,
				middleware: "requireAdmin",
				orgId: BROKER.org_id,
				reason: "User does not have admin role",
				userPermissions: JSON.parse(BROKER.permissions),
				userRoles: JSON.parse(BROKER.roles),
			});
		});
	});

	describe("query auth failure", () => {
		it("throws expected error for non-admin calling adminQuery", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t.withIdentity(BROKER).query(api.test.authTestEndpoints.testAdminQuery)
			).rejects.toThrow("Forbidden: fair lend admin role required");
		});
	});

	describe("middleware-specific error messages", () => {
		it("unauthenticated access throws sign in required", async () => {
			const t = createTestConvex();

			await expect(
				t.mutation(api.test.authTestEndpoints.testRequireAdminMutation)
			).rejects.toThrow("Unauthorized: sign in required");
		});

		it("requireFairLendAdmin throws fair lend admin required", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t.withIdentity(BROKER).query(api.test.authTestEndpoints.testAdminQuery)
			).rejects.toThrow("Forbidden: fair lend admin role required");
		});

		it("requireAdmin throws admin role required", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t
					.withIdentity(BROKER)
					.mutation(api.test.authTestEndpoints.testRequireAdminMutation)
			).rejects.toThrow("Forbidden: admin role required");
		});

		it("requirePermission throws with specific permission name", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			await expect(
				t.withIdentity(MEMBER).query(api.test.authTestEndpoints.testBrokerQuery)
			).rejects.toThrow("Forbidden: permission");

			await expect(
				t.withIdentity(MEMBER).query(api.test.authTestEndpoints.testBrokerQuery)
			).rejects.toThrow("broker:access");
		});

		it("requireOrgContext throws org context required", async () => {
			const identity = createMockViewer({
				roles: ["broker"],
				permissions: lookupPermissions(["broker"]),
			});
			const t = createTestConvex();
			await seedFromIdentity(t, identity);

			await expect(
				t
					.withIdentity(identity)
					.query(api.test.authTestEndpoints.testBrokerQuery)
			).rejects.toThrow("Forbidden: org context required");
		});
	});
});
