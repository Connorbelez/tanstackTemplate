# Chunk Context: chunk-01-schema-provider

## Goal
- Add the normalized signature persistence model and backend provider seam that the rest of the signing flow depends on.

## Relevant plan excerpts
- "`signatureEnvelopes` table and indexes."
- "`signatureRecipients` table and indexes."
- "Introduce `SignatureProvider` and a Documenso-backed implementation that consumes the existing `documensoConfig` recipient-field output from `convex/documentEngine/generation.ts` rather than rebuilding signatory field mapping."

## Implementation notes
- Extend `generatedDocuments` now with `finalPdfStorageId`, `completionCertificateStorageId`, and `signingCompletedAt` so phase 9 can archive completed envelopes without redesigning the schema.
- Persist a canonical platform-identity link on `signatureRecipients` so embedded signing can match the authenticated viewer without relying on raw email or display strings alone.
- Keep normalized provider status additive and backend-owned; the UI should consume canonical envelope and recipient rows rather than provider-specific enums.

## Existing code touchpoints
- `convex/schema.ts`
- `convex/documents/contracts.ts`
- `convex/documentEngine/generation.ts`
- `convex/documents/signature/provider.ts`
- `convex/documents/signature/documenso.ts`
- GitNexus impact: `dealDocumentInstanceStatusValidator` is LOW risk with no upstream callers detected in the index.
- GitNexus impact: `generateSingleTemplate` is LOW risk with no upstream callers detected in the index.

## Validation
- `bunx convex codegen`
- `bun check`
- `bun typecheck`
