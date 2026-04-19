/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { RelationCellDisplayValue } from "../../../convex/crm/types";
import { RelationCell } from "#/components/admin/shell/RelationCell";
import { afterEach, describe, expect, it, vi } from "vitest";

function buildRelationValue(labels: string[]): RelationCellDisplayValue {
	return {
		cardinality: "many_to_many",
		items: labels.map((label, index) => ({
			label,
			objectDefId: `object_${String(index)}` as Id<"objectDefs">,
			recordId: `record_${String(index)}`,
			recordKind: "record" as const,
		})),
		kind: "relation",
	};
}

afterEach(() => {
	cleanup();
});

describe("RelationCell", () => {
	it("supports single-open inline expansion within a shared surface", () => {
		let expandedKey: string | null = null;
		const renderHarness = () => (
			<div>
				<RelationCell
					expanded={expandedKey === "first"}
					onExpandedChange={(nextExpanded) => {
						expandedKey = nextExpanded ? "first" : null;
						view.rerender(renderHarness());
					}}
					value={buildRelationValue(["Alpha", "Beta", "Gamma"])}
				/>
				<RelationCell
					expanded={expandedKey === "second"}
					onExpandedChange={(nextExpanded) => {
						expandedKey = nextExpanded ? "second" : null;
						view.rerender(renderHarness());
					}}
					value={buildRelationValue(["Delta", "Epsilon"])}
				/>
			</div>
		);
		const view = render(renderHarness());

		expect(screen.queryByText("Beta")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /\+2 more/i }));
		expect(screen.getByText("Beta")).toBeTruthy();
		expect(screen.getByText("Gamma")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /\+1 more/i }));
		expect(screen.queryByText("Beta")).toBeNull();
		expect(screen.getByText("Epsilon")).toBeTruthy();
	});

	it("stops chip clicks from bubbling to row handlers", () => {
		const onNavigate = vi.fn();
		const onRowClick = vi.fn();

		const view = render(
			<div onClick={onRowClick}>
				<RelationCell
					onNavigate={onNavigate}
					value={buildRelationValue(["Alpha"])}
				/>
			</div>
		);

		fireEvent.click(
			within(view.container).getByRole("button", { name: /Alpha/i })
		);

		expect(onNavigate).toHaveBeenCalledWith({
			objectDefId: "object_0",
			recordId: "record_0",
			recordKind: "record",
		});
		expect(onRowClick).not.toHaveBeenCalled();
	});

	it("renders all related records when toggling is disabled", () => {
		render(
			<RelationCell
				allowToggle={false}
				expanded
				value={buildRelationValue(["Alpha", "Beta", "Gamma"])}
				variant="detail"
			/>
		);

		expect(screen.getByText("Alpha")).toBeTruthy();
		expect(screen.getByText("Beta")).toBeTruthy();
		expect(screen.getByText("Gamma")).toBeTruthy();
		expect(screen.queryByText(/\+\d+ more/i)).toBeNull();
		expect(screen.queryByText(/show less/i)).toBeNull();
		expect(screen.queryByText(/\+\d+ more hidden/i)).toBeNull();
	});

	it("renders non-interactive chips when no navigation handler is provided", () => {
		render(
			<RelationCell
				allowToggle={false}
				value={buildRelationValue(["Alpha", "Beta"])}
			/>
		);

		expect(screen.queryByRole("button", { name: /Alpha/i })).toBeNull();
		expect(screen.getByText("Alpha")).toBeTruthy();
		expect(screen.getByText("Beta")).toBeTruthy();
	});
});
