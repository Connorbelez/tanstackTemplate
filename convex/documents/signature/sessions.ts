import { ConvexError, v } from "convex/values";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { authedAction } from "../../fluent";
import { getSignatureProvider } from "./provider";

interface SignableEnvelopeRecipient {
	providerRecipientId: string | null;
	status: "declined" | "opened" | "pending" | "signed";
	userId: Id<"users"> | null;
}

interface SignableEnvelopeDocument {
	envelope: {
		providerCode: "documenso";
		providerEnvelopeId: string;
		status:
			| "completed"
			| "declined"
			| "draft"
			| "partially_signed"
			| "provider_error"
			| "sent"
			| "voided";
	};
	recipients: SignableEnvelopeRecipient[];
}

export const createEmbeddedSigningSession = authedAction
	.input({
		dealId: v.id("deals"),
		instanceId: v.id("dealDocumentInstances"),
	})
	.handler(async (ctx, args): Promise<{ expiresAt: number; url: string }> => {
		await ctx.runQuery(api.documents.dealPackages.getPortalDocumentPackage, {
			dealId: args.dealId,
		});

		const [viewerUser, signableDocument] = await Promise.all([
			ctx.runQuery(
				internal.documents.dealPackages.getViewerUserByAuthIdInternal,
				{
					authId: ctx.viewer.authId,
				}
			),
			ctx
				.runQuery(
					internal.documents.dealPackages
						.getSignableDocumentEnvelopeByInstanceInternal,
					{
						dealId: args.dealId,
						instanceId: args.instanceId,
					}
				)
				.then((value) => value as SignableEnvelopeDocument | null),
		]);

		if (!viewerUser) {
			throw new ConvexError(
				"Forbidden: current user is not linked to a signer"
			);
		}
		if (!signableDocument) {
			throw new ConvexError("Signable document envelope not found");
		}

		const recipient = signableDocument.recipients.find(
			(candidate: SignableEnvelopeRecipient) =>
				candidate.userId === viewerUser.userId
		);
		if (!recipient?.providerRecipientId) {
			throw new ConvexError(
				"Forbidden: no embedded signing recipient is available for this user"
			);
		}
		if (
			recipient.status === "signed" ||
			recipient.status === "declined" ||
			(signableDocument.envelope.status !== "sent" &&
				signableDocument.envelope.status !== "partially_signed")
		) {
			throw new ConvexError(
				"Embedded signing is not available for the current envelope state"
			);
		}

		const provider = getSignatureProvider(
			signableDocument.envelope.providerCode,
			{
				fetchFn: fetch,
				getStorageBlob: async () => null,
			}
		);

		return provider.createEmbeddedSigningSession({
			providerEnvelopeId: signableDocument.envelope.providerEnvelopeId,
			providerRecipientId: recipient.providerRecipientId,
		});
	})
	.public();
