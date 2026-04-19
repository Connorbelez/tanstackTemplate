/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionsStep } from "#/components/admin/origination/CollectionsStep";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
	value: vi.fn(),
	writable: true,
});

afterEach(() => {
	cleanup();
});

describe("CollectionsStep", () => {
	it("only stages the allowed provider code value", async () => {
		const onChange = vi.fn();

		render(<CollectionsStep onChange={onChange} />);

		fireEvent.click(screen.getByRole("combobox", { name: /provider code/i }));

		fireEvent.click(await screen.findByRole("option", { name: "pad_rotessa" }));

		expect(onChange).toHaveBeenCalledWith({
			providerCode: "pad_rotessa",
		});
	});
});
