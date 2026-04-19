import { beforeEach, describe, expect, it } from "vitest";
import {
	EXTERNAL_ORG_ADMIN,
	FAIRLEND_ADMIN,
} from "../../../src/test/auth/identities";
import {
	type CrmTestHarness,
	createCrmTestHarness,
} from "../../../src/test/convex/crm/helpers";
import { api } from "../../_generated/api";
import { auditLog } from "../../auditLog";

describe("activityQueries", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("allows FairLend admins to load native property activity", async () => {
		const propertyId = await t.run(async (ctx) => {
			const propertyId = await ctx.db.insert("properties", {
				city: "Toronto",
				createdAt: Date.now(),
				postalCode: "M5V1A1",
				propertyType: "residential",
				province: "ON",
				streetAddress: "101 Admin Way",
			});

			await auditLog.logChange(ctx, {
				action: "crm.record.updated",
				after: { streetAddress: "101 Admin Way" },
				before: { streetAddress: "101 Old Way" },
				generateDiff: true,
				resourceId: String(propertyId),
				resourceType: "properties",
				severity: "info",
			});

			return propertyId;
		});

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.crm.activityQueries.getRecordActivity, {
				recordId: String(propertyId),
				recordKind: "native",
			});

		expect(result.events).toEqual([
			expect.objectContaining({
				action: "crm.record.updated",
				description: "Record fields updated",
				eventType: "field_updated",
			}),
		]);
	});

	it("still rejects external admins from reading marketplace-wide property activity", async () => {
		const propertyId = await t.run(async (ctx) => {
			return ctx.db.insert("properties", {
				city: "Toronto",
				createdAt: Date.now(),
				postalCode: "M5V1A1",
				propertyType: "residential",
				province: "ON",
				streetAddress: "202 Restricted Ave",
			});
		});

		await expect(
			t
				.withIdentity(EXTERNAL_ORG_ADMIN)
				.query(api.crm.activityQueries.getRecordActivity, {
					recordId: String(propertyId),
					recordKind: "native",
				})
		).rejects.toThrow("Record not found or access denied");
	});
});
