import { afterEach, describe, expect, it, vi } from "vitest";
import type { RotessaTransactionReportRow } from "../../../../convex/payments/recurringSchedules/types";
import { createRotessaClient } from "../../../../convex/payments/rotessa/client";
import { ROTESSA_MANIFEST } from "../../../../convex/payments/rotessa/manifest";
import { RotessaApiClient } from "../../../../convex/payments/rotessa/api";

function makeTransactionReportRow(
	overrides: Partial<RotessaTransactionReportRow> = {}
): RotessaTransactionReportRow {
	return {
		account_number: "*******23",
		amount: "100.00",
		comment: "",
		created_at: "2020-12-04T16:03:21.000-06:00",
		custom_identifier: "TS1234",
		customer_id: 182374,
		earliest_approval_date: "2020-12-08",
		id: 1_950_625,
		institution_number: "*23",
		process_date: "2026-01-15",
		settlement_date: "2026-01-20",
		status: "Future",
		status_reason: null,
		transaction_number: "INV1980184",
		transaction_schedule_id: 781_754,
		transit_number: "***45",
		updated_at: "2020-12-08T10:42:49.000-06:00",
		...overrides,
	};
}

function makeJsonOnlyResponse(payload: unknown, status = 200) {
	return {
		json: async () => payload,
		ok: status >= 200 && status < 300,
		status,
	};
}

describe("Rotessa SDK adoption", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("supports json-only fetch doubles in the copied SDK client", async () => {
		vi.stubEnv("ROTESSA_API_KEY", "test-rotessa-key");
		const row = makeTransactionReportRow();
		const fetchMock = vi.fn().mockResolvedValue(makeJsonOnlyResponse([row]));

		const client = createRotessaClient({
			fetchFn: fetchMock as unknown as typeof fetch,
		});
		const result = await client.transactionReport.list({
			start_date: "2026-01-01",
		});

		expect(result).toEqual([row]);
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/transaction_report?start_date=2026-01-01"),
			expect.objectContaining({ method: "GET" })
		);
	});

	it("keeps the legacy RotessaApiClient schedule create contract while delegating to the copied SDK", async () => {
		vi.stubEnv("ROTESSA_API_KEY", "test-rotessa-key");
		const fetchMock = vi.fn().mockResolvedValue(
			makeJsonOnlyResponse({
				amount: "123.45",
				comment: null,
				created_at: "2026-01-01T00:00:00.000Z",
				financial_transactions: [],
				frequency: "Monthly",
				id: 987,
				installments: 12,
				next_process_date: "2026-06-01",
				process_date: "2026-05-01",
				updated_at: "2026-01-01T00:00:00.000Z",
			})
		);

		const client = new RotessaApiClient({
			fetchImpl: fetchMock as unknown as typeof fetch,
		});
		const schedule = await client.createTransactionSchedule({
			amount: 12_345,
			customIdentifier: "borrower-rotessa-001",
			frequency: "Monthly",
			processDate: "2026-05-01",
			providerCode: "pad_rotessa",
		});

		expect(schedule.id).toBe(987);
		const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
		expect(String(requestUrl)).toContain(
			"/transaction_schedules/create_with_custom_identifier"
		);
		expect(requestInit?.method).toBe("POST");
		expect(JSON.parse(String(requestInit?.body))).toMatchObject({
			amount: 123.45,
			custom_identifier: "borrower-rotessa-001",
			frequency: "Monthly",
			process_date: "2026-05-01",
		});
	});

	it("keeps paginated provider-ref lookup behavior through the adapter", async () => {
		vi.stubEnv("ROTESSA_API_KEY", "test-rotessa-key");
		const firstPage = Array.from({ length: 1000 }, (_, index) =>
			makeTransactionReportRow({
				id: index + 1,
				transaction_number: `MISS-${index + 1}`,
			})
		);
		const matched = makeTransactionReportRow({
			id: 5001,
			transaction_number: "TARGET-5001",
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(makeJsonOnlyResponse(firstPage))
			.mockResolvedValueOnce(makeJsonOnlyResponse([matched]));

		const client = new RotessaApiClient({
			fetchImpl: fetchMock as unknown as typeof fetch,
		});
		const result = await client.findTransactionReportRow({
			endDate: "2026-01-31",
			providerRef: "TARGET-5001",
			startDate: "2026-01-01",
		});

		expect(result).toEqual(matched);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain("page=2");
	});

	it("exposes the copied manifest for later Rotessa integrations", () => {
		expect(
			ROTESSA_MANIFEST.transactionSchedules.createWithCustomIdentifier.path
		).toBe("/transaction_schedules/create_with_custom_identifier");
		expect(ROTESSA_MANIFEST.customers.create.method).toBe("POST");
	});
});
