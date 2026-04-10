import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";

const ADMIN_IDENTITY = {
	subject: "test-amps-e2e-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([
		"payment:view",
		"payment:manage",
		"payment:retry",
		"payment:cancel",
	]),
	user_email: "amps-e2e-admin@fairlend.ca",
	user_first_name: "AMPS",
	user_last_name: "E2E",
};

function createHarness() {
	process.env.DISABLE_GT_HASHCHAIN = "true";
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, convexModules);
	auditLogTest.register(t, "auditLog");
	return t;
}

describe("demo.ampsE2e", () => {
	it("seeds a minimal offline lifecycle scenario without bank accounts", async () => {
		const t = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);
		const runId = `seed-${Date.now()}`;

		const seeded = await admin.mutation(
			api.demo.ampsE2e.seedOfflineLifecycleScenario,
			{ runId }
		);

		expect(seeded.state.exists).toBe(true);
		expect(seeded.state.stage).toBe("seeded");
		expect(seeded.state.planEntry?.method).toBe("manual_review");
		expect(seeded.state.rowCounts.planEntries).toBe(1);

		const bankAccounts = await t.run(async (ctx) => {
			return ctx.db.query("bankAccounts").collect();
		});
		expect(bankAccounts).toHaveLength(0);
	});

	it("runs the full inbound-to-outbound offline lifecycle for a run-scoped scenario", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);
		const runId = `full-${Date.now()}`;

		try {
			await admin.mutation(api.demo.ampsE2e.seedOfflineLifecycleScenario, {
				runId,
			});

			const executeResult = await admin.action(
				api.demo.ampsE2e.executeOfflineLifecyclePlanEntry,
				{ runId }
			);
			expect(executeResult.outcome).toBe("attempt_created");

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			let state = await admin.query(
				api.demo.ampsE2e.getOfflineLifecycleScenario,
				{
					runId,
				}
			);
			expect(state.stage).toBe("inbound_pending_confirmation");
			expect(state.inboundTransfer?.status).toBe("pending");

			await admin.action(api.demo.ampsE2e.confirmOfflineLifecycleInbound, {
				runId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			state = await admin.query(api.demo.ampsE2e.getOfflineLifecycleScenario, {
				runId,
			});
			expect(["inbound_confirmed", "dispersal_ready"]).toContain(state.stage);
			expect(state.obligation?.status).toBe("settled");
			expect(state.inboundTransfer?.status).toBe("confirmed");
			expect(state.dispersal).not.toBeNull();

			await admin.action(api.demo.ampsE2e.triggerOfflineLifecyclePayout, {
				runId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			state = await admin.query(api.demo.ampsE2e.getOfflineLifecycleScenario, {
				runId,
			});
			expect(state.stage).toBe("outbound_pending_confirmation");
			expect(state.outboundTransfer?.status).toBe("pending");

			await admin.action(api.demo.ampsE2e.confirmOfflineLifecycleOutbound, {
				runId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			state = await admin.query(api.demo.ampsE2e.getOfflineLifecycleScenario, {
				runId,
			});
			expect(state.stage).toBe("outbound_confirmed");
			expect(state.outboundTransfer?.status).toBe("confirmed");
			expect(state.dispersal?.status).toBe("disbursed");
		} finally {
			vi.useRealTimers();
		}
	});

	it("cleanup removes partial scenarios and is replay-safe", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);
		const runId = `cleanup-${Date.now()}`;

		try {
			await admin.mutation(api.demo.ampsE2e.seedOfflineLifecycleScenario, {
				runId,
			});
			await admin.action(api.demo.ampsE2e.executeOfflineLifecyclePlanEntry, {
				runId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const firstCleanup = await admin.mutation(
				api.demo.ampsE2e.cleanupOfflineLifecycleScenario,
				{ runId }
			);
			expect(firstCleanup.deletedMortgages).toBe(1);
			expect(firstCleanup.deletedPlanEntries).toBeGreaterThanOrEqual(1);

			const secondCleanup = await admin.mutation(
				api.demo.ampsE2e.cleanupOfflineLifecycleScenario,
				{ runId }
			);
			expect(secondCleanup.deletedMortgages).toBe(0);
			expect(secondCleanup.deletedPlanEntries).toBe(0);

			const state = await admin.query(
				api.demo.ampsE2e.getOfflineLifecycleScenario,
				{
					runId,
				}
			);
			expect(state.exists).toBe(false);
			expect(state.stage).toBe("not_seeded");
		} finally {
			vi.useRealTimers();
		}
	});

	it("seed replay and payout replay stay idempotent for the same runId", async () => {
		vi.useFakeTimers();
		const t = createHarness();
		const admin = t.withIdentity(ADMIN_IDENTITY);
		const runId = `replay-${Date.now()}`;

		try {
			await admin.mutation(api.demo.ampsE2e.seedOfflineLifecycleScenario, {
				runId,
			});
			await admin.mutation(api.demo.ampsE2e.seedOfflineLifecycleScenario, {
				runId,
			});

			let state = await admin.query(
				api.demo.ampsE2e.getOfflineLifecycleScenario,
				{
					runId,
				}
			);
			expect(state.rowCounts.planEntries).toBe(1);
			expect(state.rowCounts.attempts).toBe(0);

			await admin.action(api.demo.ampsE2e.executeOfflineLifecyclePlanEntry, {
				runId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			await admin.action(api.demo.ampsE2e.confirmOfflineLifecycleInbound, {
				runId,
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const firstPayout = await admin.action(
				api.demo.ampsE2e.triggerOfflineLifecyclePayout,
				{ runId }
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			const secondPayout = await admin.action(
				api.demo.ampsE2e.triggerOfflineLifecyclePayout,
				{ runId }
			);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			expect(firstPayout.created).toBe(1);
			expect(secondPayout.skippedIdempotent).toBe(1);

			state = await admin.query(api.demo.ampsE2e.getOfflineLifecycleScenario, {
				runId,
			});
			expect(state.rowCounts.transfers).toBe(2);
			expect(state.outboundTransfer?.status).toBe("pending");
		} finally {
			vi.useRealTimers();
		}
	});
});
