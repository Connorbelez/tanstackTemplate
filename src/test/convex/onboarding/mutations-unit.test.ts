import { describe, expect, it } from "vitest";
import { requestRole } from "../../../../convex/onboarding/mutations";
import { createMockIdentity } from "../../auth/helpers";

describe("onboarding mutation guard branches", () => {
	it("rejects non-requestable roles inside the requestRole handler", async () => {
		const ctx = {
			auth: {
				getUserIdentity: async () => createMockIdentity(),
			},
			db: {},
		};

		await expect(
			(
				requestRole as unknown as {
					_handler: (ctx: unknown, args: unknown) => Promise<unknown>;
				}
			)._handler(ctx, {
				requestedRole: "borrower",
				referralSource: "self_signup",
			})
		).rejects.toThrow('Role "borrower" is not available for request');
	});
});
