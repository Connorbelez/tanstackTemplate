import { describe, expect, it } from "vitest";
import { compareTimelineRecords } from "../queries";

describe("compareTimelineRecords", () => {
	it("orders by timestamp, then source, then recordId", () => {
		const records = [
			{
				timestamp: 200,
				source: "cash_ledger",
				recordId: "z-2",
			},
			{
				timestamp: 100,
				source: "audit_journal",
				recordId: "z-9",
			},
			{
				timestamp: 200,
				source: "audit_journal",
				recordId: "b-1",
			},
			{
				timestamp: 200,
				source: "audit_journal",
				recordId: "a-1",
			},
		];

		expect(records.sort(compareTimelineRecords)).toEqual([
			{
				timestamp: 100,
				source: "audit_journal",
				recordId: "z-9",
			},
			{
				timestamp: 200,
				source: "audit_journal",
				recordId: "a-1",
			},
			{
				timestamp: 200,
				source: "audit_journal",
				recordId: "b-1",
			},
			{
				timestamp: 200,
				source: "cash_ledger",
				recordId: "z-2",
			},
		]);
	});
});
