/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { buildProviderManagedDraft } from "#/components/admin/origination/collections-step-model";

describe("CollectionsStep", () => {
	it("only stages the allowed provider code value", () => {
		const nextDraft = buildProviderManagedDraft(
			{},
			{
				providerCode: "manual_review" as never,
			}
		);

		expect(nextDraft.providerCode).toBe("pad_rotessa");
		expect(nextDraft.executionIntent).toBe("provider_managed_now");
	});
});
