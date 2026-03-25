import { describe, expect, it } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FAIRLEND_BROKERAGE_ORG_ID } from "../../../../convex/constants";
import {
	createGovernedTestConvex,
	createSelfSignupRequest,
	getRequest,
	seedDefaultGovernedActors,
} from "./helpers";

describe("onboarding internal mutations", () => {
	it("patchTargetOrg trims whitespace before persisting", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "broker");

		await t.mutation(internal.onboarding.internal.patchTargetOrg, {
			requestId,
			targetOrganizationId: "  org_trimmed  ",
		});

		const request = await getRequest(t, requestId);
		expect(request?.targetOrganizationId).toBe("org_trimmed");
	});

	it("patchTargetOrg rejects blank organization ids", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "broker");

		await expect(
			t.mutation(internal.onboarding.internal.patchTargetOrg, {
				requestId,
				targetOrganizationId: "   ",
			})
		).rejects.toThrow("targetOrganizationId cannot be empty");
	});

	it("beginRoleAssignmentProcessing returns started and sets the active journal id", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "lender");

		const result = await t.mutation(
			internal.onboarding.internal.beginRoleAssignmentProcessing,
			{
				requestId,
				journalEntryId: "journal_started",
			}
		);

		expect(result).toEqual({
			status: "started",
			targetOrganizationId: FAIRLEND_BROKERAGE_ORG_ID,
		});
		const request = await getRequest(t, requestId);
		expect(request?.activeRoleAssignmentJournalId).toBe("journal_started");
	});

	it("beginRoleAssignmentProcessing throws when the request does not exist", async () => {
		const t = createGovernedTestConvex();

		await expect(
			t.mutation(internal.onboarding.internal.beginRoleAssignmentProcessing, {
				requestId: "10000;onboardingRequests" as Id<"onboardingRequests">,
				journalEntryId: "journal_missing",
			})
		).rejects.toThrow("Request not found");
	});

	it("completeRoleAssignmentProcessing throws when the request does not exist", async () => {
		const t = createGovernedTestConvex();

		await expect(
			t.mutation(
				internal.onboarding.internal.completeRoleAssignmentProcessing,
				{
					requestId: "10000;onboardingRequests" as Id<"onboardingRequests">,
					journalEntryId: "journal_missing",
				}
			)
		).rejects.toThrow("Request not found");
	});

	it("completeRoleAssignmentProcessing preserves a different active journal once the current journal is already processed", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "lender");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				activeRoleAssignmentJournalId: "journal_active_other",
				processedRoleAssignmentJournalIds: ["journal_processed"],
			});
		});

		await t.mutation(
			internal.onboarding.internal.completeRoleAssignmentProcessing,
			{
				requestId,
				journalEntryId: "journal_processed",
			}
		);

		const request = await getRequest(t, requestId);
		expect(request?.activeRoleAssignmentJournalId).toBe("journal_active_other");
		expect(request?.processedRoleAssignmentJournalIds).toEqual([
			"journal_processed",
		]);
	});

	it("completeRoleAssignmentProcessing rejects a different unprocessed journal while another is active", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "lender");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				activeRoleAssignmentJournalId: "journal_active_other",
			});
		});

		await expect(
			t.mutation(
				internal.onboarding.internal.completeRoleAssignmentProcessing,
				{
					requestId,
					journalEntryId: "journal_new",
				}
			)
		).rejects.toThrow("Cannot complete journal_new");
	});
});
