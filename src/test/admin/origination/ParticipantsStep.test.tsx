/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { buildParticipantFieldId } from "#/components/admin/origination/participants-step-model";

describe("ParticipantsStep", () => {
	it("keeps generated field ids free of display-title whitespace", () => {
		expect(buildParticipantFieldId("Co Borrower 1")).toBe("co-borrower-1");
		expect(buildParticipantFieldId("Assigned Broker")).toBe("assigned-broker");
		expect(buildParticipantFieldId("Primary Borrower")).not.toContain(" ");
	});
});
