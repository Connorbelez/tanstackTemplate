import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { buildOriginationBorrowerWorkflowSourceKey } from "../mortgages/provenance";
import { normalizeEmail } from "../seed/seedHelpers";

type BorrowerParticipantRole = Doc<"mortgageBorrowers">["role"];
const WHITESPACE_PATTERN = /\s+/;

export interface OriginationBorrowerParticipantInput {
	draftId?: string;
	email?: string;
	existingBorrowerId?: Id<"borrowers">;
	fullName?: string;
	role: BorrowerParticipantRole;
}

export interface ReadyOriginationParticipantResolution {
	borrowerId?: Id<"borrowers">;
	email: string;
	fullName?: string;
	kind: "ready";
	role: BorrowerParticipantRole;
	userId: Id<"users">;
	workflowSourceKey: string;
}

export interface MissingOriginationParticipantResolution {
	email: string;
	fullName?: string;
	kind: "missing_identity";
	role: BorrowerParticipantRole;
	workflowSourceKey: string;
}

export type OriginationParticipantResolution =
	| MissingOriginationParticipantResolution
	| ReadyOriginationParticipantResolution;

function splitFullName(fullName?: string) {
	const trimmed = fullName?.trim();
	if (!trimmed) {
		return {};
	}

	const [firstName, ...remaining] = trimmed.split(WHITESPACE_PATTERN);
	return {
		firstName,
		lastName: remaining.join(" ") || undefined,
	};
}

async function findUserByEmail(
	ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
	email: string
) {
	return ctx.db
		.query("users")
		.filter((query) => query.eq(query.field("email"), normalizeEmail(email)))
		.first();
}

async function collectBorrowersForUser(
	ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
	userId: Id<"users">
) {
	return ctx.db
		.query("borrowers")
		.withIndex("by_user", (query) => query.eq("userId", userId))
		.collect();
}

function resolveParticipantIdentityEmail(
	participant: OriginationBorrowerParticipantInput
) {
	return participant.email ? normalizeEmail(participant.email) : undefined;
}

function requireParticipantEmail(
	participant: OriginationBorrowerParticipantInput
) {
	const email = resolveParticipantIdentityEmail(participant);
	if (!email) {
		throw new ConvexError(
			`A staged ${participant.role.replace("_", " ")} is missing an email address`
		);
	}
	return email;
}

function hasMeaningfulParticipantIdentity(
	participant: OriginationBorrowerParticipantInput
) {
	return Boolean(
		participant.existingBorrowerId ||
			participant.email?.trim() ||
			participant.fullName?.trim()
	);
}

export function buildOriginationParticipantResolutionKey(args: {
	caseId: Id<"adminOriginationCases">;
	participant: OriginationBorrowerParticipantInput;
}) {
	return buildOriginationBorrowerWorkflowSourceKey({
		caseId: args.caseId,
		participantDraftId: args.participant.draftId,
		role: args.participant.role,
	});
}

export async function resolveOriginationBorrowerParticipants(
	ctx: Pick<QueryCtx, "db">,
	args: {
		caseId: Id<"adminOriginationCases">;
		orgId?: string;
		participants: OriginationBorrowerParticipantInput[];
	}
): Promise<OriginationParticipantResolution[]> {
	const resolutions: OriginationParticipantResolution[] = [];

	for (const participant of args.participants) {
		if (!hasMeaningfulParticipantIdentity(participant)) {
			continue;
		}

		const workflowSourceKey = buildOriginationParticipantResolutionKey({
			caseId: args.caseId,
			participant,
		});

		if (participant.existingBorrowerId) {
			const borrower = await ctx.db.get(participant.existingBorrowerId);
			if (!borrower) {
				throw new ConvexError("Staged borrower reference no longer exists");
			}
			if (args.orgId && borrower.orgId && borrower.orgId !== args.orgId) {
				throw new ConvexError(
					"Existing borrower belongs to a different organization"
				);
			}
			const user = await ctx.db.get(borrower.userId);
			if (!user) {
				throw new ConvexError("Borrower user record no longer exists");
			}
			resolutions.push({
				borrowerId: borrower._id,
				email: normalizeEmail(user.email),
				fullName: participant.fullName,
				kind: "ready",
				role: participant.role,
				userId: borrower.userId,
				workflowSourceKey,
			});
			continue;
		}

		const email = requireParticipantEmail(participant);
		const user = await findUserByEmail(ctx, email);
		if (!user) {
			resolutions.push({
				email,
				fullName: participant.fullName,
				kind: "missing_identity",
				role: participant.role,
				workflowSourceKey,
			});
			continue;
		}

		resolutions.push({
			email,
			fullName: participant.fullName,
			kind: "ready",
			role: participant.role,
			userId: user._id,
			workflowSourceKey,
		});
	}

	return resolutions;
}

export async function ensureCanonicalBorrowerForOrigination(
	ctx: Pick<MutationCtx, "db">,
	args: {
		creationSource: string;
		now: number;
		orgId?: string;
		originatingWorkflowId: string;
		originatingWorkflowType: string;
		userId: Id<"users">;
		workflowSourceId: string;
		workflowSourceKey: string;
	}
) {
	const borrowers = await collectBorrowersForUser(ctx, args.userId);
	const sameOrgBorrowers = borrowers.filter(
		(borrower) => borrower.orgId === args.orgId
	);
	const crossOrgBorrowers = borrowers.filter(
		(borrower) => borrower.orgId !== undefined && borrower.orgId !== args.orgId
	);

	if (crossOrgBorrowers.length > 0) {
		throw new ConvexError(
			"A borrower linked to this user already exists in another organization"
		);
	}
	if (sameOrgBorrowers.length > 1) {
		throw new ConvexError(
			"Multiple borrower rows already exist for this user in the same organization"
		);
	}
	if (sameOrgBorrowers[0]) {
		return {
			borrowerId: sameOrgBorrowers[0]._id,
			wasCreated: false,
		};
	}

	const borrowerId = await ctx.db.insert("borrowers", {
		creationSource: args.creationSource,
		createdAt: args.now,
		lastTransitionAt: args.now,
		onboardedAt: args.now,
		orgId: args.orgId,
		originatingWorkflowId: args.originatingWorkflowId,
		originatingWorkflowType: args.originatingWorkflowType,
		status: "active",
		userId: args.userId,
		workflowSourceId: args.workflowSourceId,
		workflowSourceKey: args.workflowSourceKey,
		workflowSourceType: "admin_origination_case",
	});

	return { borrowerId, wasCreated: true };
}

export function provisionableParticipantName(
	participant: Pick<OriginationBorrowerParticipantInput, "fullName">
) {
	return splitFullName(participant.fullName);
}
