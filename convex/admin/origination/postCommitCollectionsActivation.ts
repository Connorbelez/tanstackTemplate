import type { Doc, Id } from "../../_generated/dataModel";

const POST_COMMIT_COLLECTIONS_ACTIVATION_FAILURE_MESSAGE =
	"[commitCase] Post-commit collections activation failed after finalizeCommit.";

interface PostCommitCollectionsActivationInput {
	caseId: Id<"adminOriginationCases">;
	collectionsDraft: Doc<"adminOriginationCases">["collectionsDraft"];
	viewerUserId: Id<"users">;
}

interface PostCommitCollectionsActivationArgs {
	caseId: Id<"adminOriginationCases">;
	viewerUserId: Id<"users">;
}

interface PostCommitCollectionsActivationDependencies {
	logFailure?: (
		message: string,
		details: {
			caseId: string;
			error: unknown;
			viewerUserId: string;
		}
	) => void;
	runActivation: (
		args: PostCommitCollectionsActivationArgs
	) => Promise<unknown>;
}

function shouldActivateCommittedCaseCollections(
	collectionsDraft: Doc<"adminOriginationCases">["collectionsDraft"]
) {
	return (
		collectionsDraft?.mode === "provider_managed_now" &&
		collectionsDraft.activationStatus !== "active"
	);
}

export async function runPostCommitCollectionsActivation(
	input: PostCommitCollectionsActivationInput,
	deps: PostCommitCollectionsActivationDependencies
) {
	if (!shouldActivateCommittedCaseCollections(input.collectionsDraft)) {
		return;
	}

	try {
		await deps.runActivation({
			caseId: input.caseId,
			viewerUserId: input.viewerUserId,
		});
	} catch (error) {
		(deps.logFailure ?? console.error)(
			POST_COMMIT_COLLECTIONS_ACTIVATION_FAILURE_MESSAGE,
			{
				caseId: String(input.caseId),
				error,
				viewerUserId: String(input.viewerUserId),
			}
		);
	}
}

export { POST_COMMIT_COLLECTIONS_ACTIVATION_FAILURE_MESSAGE };
