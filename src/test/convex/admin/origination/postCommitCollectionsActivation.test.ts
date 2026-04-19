import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
	POST_COMMIT_COLLECTIONS_ACTIVATION_FAILURE_MESSAGE,
	runPostCommitCollectionsActivation,
} from "../../../../../convex/admin/origination/postCommitCollectionsActivation";

const CASE_ID = "case_post_commit_activation" as Id<"adminOriginationCases">;
const VIEWER_USER_ID = "user_post_commit_activation" as Id<"users">;

describe("runPostCommitCollectionsActivation", () => {
	it("swallows and logs unexpected activation rejections after finalizeCommit", async () => {
		const activationError = new Error("Rotessa action rejected");
		const runActivation = vi.fn().mockRejectedValue(activationError);
		const logFailure = vi.fn();

		await expect(
			runPostCommitCollectionsActivation(
				{
					caseId: CASE_ID,
					collectionsDraft: {
						activationStatus: "pending",
						mode: "provider_managed_now",
						providerCode: "pad_rotessa",
					},
					viewerUserId: VIEWER_USER_ID,
				},
				{
					logFailure,
					runActivation,
				}
			)
		).resolves.toBeUndefined();

		expect(runActivation).toHaveBeenCalledWith({
			caseId: CASE_ID,
			viewerUserId: VIEWER_USER_ID,
		});
		expect(logFailure).toHaveBeenCalledWith(
			POST_COMMIT_COLLECTIONS_ACTIVATION_FAILURE_MESSAGE,
			{
				caseId: String(CASE_ID),
				error: activationError,
				viewerUserId: String(VIEWER_USER_ID),
			}
		);
	});

	it("skips activation when the provider-managed draft is already active", async () => {
		const runActivation = vi.fn();
		const logFailure = vi.fn();

		await expect(
			runPostCommitCollectionsActivation(
				{
					caseId: CASE_ID,
					collectionsDraft: {
						activationStatus: "active",
						mode: "provider_managed_now",
						providerCode: "pad_rotessa",
					},
					viewerUserId: VIEWER_USER_ID,
				},
				{
					logFailure,
					runActivation,
				}
			)
		).resolves.toBeUndefined();

		expect(runActivation).not.toHaveBeenCalled();
		expect(logFailure).not.toHaveBeenCalled();
	});
});
