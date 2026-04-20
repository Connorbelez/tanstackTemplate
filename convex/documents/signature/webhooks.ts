import { ConvexError, v } from "convex/values";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { authedAction } from "../../fluent";
import { getSignatureProvider } from "./provider";

interface SignableEnvelopeDocument {
	envelope: {
		envelopeId: Id<"signatureEnvelopes">;
		providerCode: "documenso";
		providerEnvelopeId: string;
	};
}

export const syncSignableDocumentEnvelope = authedAction
	.input({
		dealId: v.id("deals"),
		instanceId: v.id("dealDocumentInstances"),
	})
	.handler(async (ctx, args): Promise<SignableEnvelopeDocument | null> => {
		await ctx.runQuery(api.documents.dealPackages.getPortalDocumentPackage, {
			dealId: args.dealId,
		});

		const signableDocument = (await ctx.runQuery(
			internal.documents.dealPackages
				.getSignableDocumentEnvelopeByInstanceInternal,
			{
				dealId: args.dealId,
				instanceId: args.instanceId,
			}
		)) as SignableEnvelopeDocument | null;
		if (!signableDocument) {
			throw new ConvexError("Signable document envelope not found");
		}

		const provider = getSignatureProvider(
			signableDocument.envelope.providerCode,
			{
				fetchFn: fetch,
				getStorageBlob: async () => null,
			}
		);

		try {
			const syncResult = await provider.syncEnvelope({
				providerEnvelopeId: signableDocument.envelope.providerEnvelopeId,
			});
			await ctx.runMutation(
				internal.documents.dealPackages.syncSignatureEnvelopeStateInternal,
				{
					envelopeId: signableDocument.envelope.envelopeId,
					lastError: undefined,
					now: Date.now(),
					recipients: syncResult.recipients,
					status: syncResult.envelopeStatus,
				}
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await ctx.runMutation(
				internal.documents.dealPackages.syncSignatureEnvelopeStateInternal,
				{
					envelopeId: signableDocument.envelope.envelopeId,
					lastError: message,
					now: Date.now(),
					recipients: [],
					status: "provider_error",
				}
			);
			throw new ConvexError(message);
		}

		return ctx.runQuery(
			internal.documents.dealPackages
				.getSignableDocumentEnvelopeByInstanceInternal,
			{
				dealId: args.dealId,
				instanceId: args.instanceId,
			}
		);
	})
	.public();
