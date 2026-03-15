import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import {
	createMockViewer,
	createTestConvex,
	seedFromIdentity,
} from "../helpers";
import { BROKER, JR_UNDERWRITER, SR_UNDERWRITER } from "../identities";

describe("requireOrgContext middleware", () => {
	it("allows user with org_id present", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, BROKER);

		const result = await t
			.withIdentity(BROKER)
			.query(api.test.authTestEndpoints.testBrokerQuery);

		expect(result).toEqual({ ok: true });
	});

	it("allows jr_underwriter without org_id", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, JR_UNDERWRITER);

		const result = await t
			.withIdentity(JR_UNDERWRITER)
			.query(api.test.authTestEndpoints.testUnderwriterQuery);

		expect(result).toEqual({ ok: true });
	});

	it("allows sr_underwriter without org_id", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, SR_UNDERWRITER);

		const result = await t
			.withIdentity(SR_UNDERWRITER)
			.query(api.test.authTestEndpoints.testUnderwriterQuery);

		expect(result).toEqual({ ok: true });
	});

	it("rejects non-underwriter without org_id", async () => {
		const identity = createMockViewer({
			roles: ["broker"],
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		await expect(
			t.withIdentity(identity).query(api.test.authTestEndpoints.testBrokerQuery)
		).rejects.toThrow("Forbidden: org context required");
	});
});
