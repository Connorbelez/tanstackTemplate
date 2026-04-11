import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { createTestConvex, seedFromIdentity } from "../helpers";
import {
	BORROWER,
	BROKER,
	EXTERNAL_ORG_ADMIN,
	FAIRLEND_ADMIN,
} from "../identities";

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

	it("allows admin:access to satisfy permission checks without explicit grants", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, EXTERNAL_ORG_ADMIN);

		const result = await t
			.withIdentity(EXTERNAL_ORG_ADMIN)
			.mutation(api.test.authTestEndpoints.testDealMutation);

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
