/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParticipantsStep } from "#/components/admin/origination/ParticipantsStep";

afterEach(() => {
	cleanup();
});

describe("ParticipantsStep", () => {
	it("keeps generated field ids free of display-title whitespace", () => {
		const { container } = render(
			<ParticipantsStep
				draft={{
					coBorrowers: [{ draftId: "co-borrower-1" }],
					guarantors: [{ draftId: "guarantor-1" }],
					primaryBorrower: {},
				}}
				onChange={vi.fn()}
			/>
		);

		expect(container.querySelectorAll('input[id*=" "]')).toHaveLength(0);
		expect(container.querySelectorAll('label[for*=" "]')).toHaveLength(0);
	});
});
