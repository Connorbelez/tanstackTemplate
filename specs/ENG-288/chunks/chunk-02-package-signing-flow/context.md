# Chunk Context: chunk-02-package-signing-flow

## Goal
- Turn the existing placeholder signable branch into a real signing pipeline with conservative retry semantics and canonical status mirroring.

## Relevant plan excerpts
- "Replace the current placeholder-only signable flow and update package summarization so signable rows influence `ready`, `partial_failure`, and `failed` outcomes."
- "Add backend embedded-signing session issuance guarded by both `assertDealAccess` and canonical recipient matching; return only session URL and expiry metadata."
- "Add idempotent provider webhook or sync handling that updates `signatureEnvelopes`, `signatureRecipients`, `generatedDocuments.signingStatus`, and `dealDocumentInstances.status`."

## Implementation notes
- Reuse `resolveDealDocumentSignatoriesInternal`, `resolveDealDocumentVariablesInternal`, and `generateSingleTemplate` rather than duplicating participant or template-generation logic.
- If required signatories cannot be resolved, leave the document in an explicit `signature_pending_recipient_resolution` state and avoid fabricating recipients.
- Separate safe retry modes for recipient resolution, provider sync, and envelope replacement so operator actions remain auditable and do not create duplicate live envelopes.

## Existing code touchpoints
- `convex/documents/dealPackages.ts`
- `convex/documents/signature/sessions.ts`
- `convex/documents/signature/webhooks.ts`
- `convex/authz/resourceAccess.ts`
- GitNexus impact: `processPackageWorkItem` is LOW risk with one direct caller, `createDocumentPackageForDeal`, and no affected execution flows.
- GitNexus impact: `summarizePackageStatus` is LOW risk with one direct caller, `finalizeDealPackage`, and no affected execution flows.

## Validation
- `bunx convex codegen`
- `bun check`
- `bun typecheck`
- `bun run test -- dealPackages`
