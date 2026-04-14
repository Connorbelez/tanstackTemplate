import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import { createMockViewer, createTestConvex, seedFromIdentity } from "../helpers";
import { BORROWER, BROKER, FAIRLEND_ADMIN } from "../identities";

describe("requirePermission middleware", () => {
	it("allows user with matching permission", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, BROKER);

		const result = await t
			.withIdentity(BROKER)
			.query(api.test.authTestEndpoints.testBrokerQuery);

		expect(result).toEqual({ ok: true });
	});

	it("rejects user without matching permission", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, BORROWER);

		await expect(
			t.withIdentity(BORROWER).query(api.test.authTestEndpoints.testBrokerQuery)
		).rejects.toThrow('Forbidden: permission "broker:access" required');
	});

	it("allows FairLend admin for deal:manage permission", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, FAIRLEND_ADMIN);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.test.authTestEndpoints.testDealMutation);

		expect(result).toEqual({ ok: true });
	});

	it("allows a staff admin with only admin:access through staff-gated permission chains", async () => {
		const identity = createMockViewer({
			orgId: FAIRLEND_STAFF_ORG_ID,
			permissions: ["admin:access"],
			roles: ["admin"],
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		const result = await t
			.withIdentity(identity)
			.query(api.test.authTestEndpoints.testPaymentQuery);

		expect(result).toEqual({ ok: true });
	});

	it("rejects broker for deal:manage permission", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, BROKER);

		await expect(
			t
				.withIdentity(BROKER)
				.mutation(api.test.authTestEndpoints.testDealMutation)
		).rejects.toThrow('Forbidden: permission "deal:manage" required');
	});
});
