import { describe, expect, it, vi } from "vitest";
import {
	getNativeRecordById,
	queryNativeRecords,
	queryNativeTable,
} from "../queryAdapter";

function createIndexedQueryStub(page: Record<string, unknown>[] = []) {
	return {
		paginate: vi.fn(async () => ({
			continueCursor: null,
			isDone: true,
			page,
		})),
		take: vi.fn(async (limit: number) => page.slice(0, limit)),
		withIndex: vi.fn(function withIndex() {
			return this;
		}),
	};
}

describe("queryAdapter", () => {
	it("uses take instead of paginate for native table limit reads", async () => {
		const queryStub = createIndexedQueryStub([
			{ _id: "mortgage_1", orgId: "org_1" },
		]);
		const ctx = {
			db: {
				query: vi.fn(() => queryStub),
			},
		};

		const result = await queryNativeTable(
			ctx as never,
			"mortgages",
			"org_1",
			1
		);

		expect(result).toEqual([{ _id: "mortgage_1", orgId: "org_1" }]);
		expect(queryStub.withIndex).toHaveBeenCalledOnce();
		expect(queryStub.take).toHaveBeenCalledWith(1);
		expect(queryStub.paginate).not.toHaveBeenCalled();
	});

	it("uses take instead of paginate when assembling limited native records", async () => {
		const queryStub = createIndexedQueryStub([
			{
				_id: "mortgage_1",
				_creationTime: 10,
				createdAt: 10,
				orgId: "org_1",
				status: "active",
			},
		]);
		const ctx = {
			db: {
				query: vi.fn(() => queryStub),
			},
		};

		const result = await queryNativeRecords(
			ctx as never,
			{
				_id: "object_1",
				isSystem: true,
				nativeTable: "mortgages",
			} as never,
			[
				{
					name: "status",
					nativeColumnPath: "status",
				},
			] as never,
			"org_1",
			1
		);

		expect(result).toEqual([
			expect.objectContaining({
				_id: "mortgage_1",
				_kind: "native",
				nativeTable: "mortgages",
				fields: {
					status: "active",
				},
			}),
		]);
		expect(queryStub.take).toHaveBeenCalledWith(1);
		expect(queryStub.paginate).not.toHaveBeenCalled();
	});

	it("allows FairLend admins to read native tables across orgs without by_org", async () => {
		const queryStub = createIndexedQueryStub([
			{ _id: "mortgage_1", orgId: "org_external" },
		]);
		const ctx = {
			db: {
				query: vi.fn(() => queryStub),
			},
			viewer: {
				isFairLendAdmin: true,
			},
		};

		const result = await queryNativeTable(
			ctx as never,
			"mortgages",
			"org_staff",
			1
		);

		expect(result).toEqual([{ _id: "mortgage_1", orgId: "org_external" }]);
		expect(queryStub.withIndex).not.toHaveBeenCalled();
		expect(queryStub.take).toHaveBeenCalledWith(1);
	});

	it("allows FairLend admins to resolve a native record outside the viewer org", async () => {
		const ctx = {
			db: {
				get: vi.fn(async () => ({
					_id: "mortgage_1",
					_creationTime: 10,
					createdAt: 10,
					orgId: "org_external",
					status: "active",
				})),
				normalizeId: vi.fn(() => "mortgage_1"),
			},
			viewer: {
				isFairLendAdmin: true,
			},
		};

		const result = await getNativeRecordById(
			ctx as never,
			{
				_id: "object_1",
				isSystem: true,
				nativeTable: "mortgages",
			} as never,
			[
				{
					name: "status",
					nativeColumnPath: "status",
				},
			] as never,
			"org_staff",
			"mortgage_1"
		);

		expect(result).toEqual(
			expect.objectContaining({
				_id: "mortgage_1",
				_kind: "native",
				nativeTable: "mortgages",
				fields: {
					status: "active",
				},
			})
		);
	});
});
