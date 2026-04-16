
# SPEC HEADER

- **Spec number:** 8
- **Exact title:** Signable docs, Documenso envelopes, and embedded signing
- **Recommended filename:** `phase-08-signable-docs-documenso-envelopes-and-embedded-signing.md`
- **Primary objective:** Generate signable deal documents on `DEAL_LOCKED`, create and sync Documenso envelopes through a backend provider seam, and expose embedded signing only to authorized matching recipients.
- **Why this phase exists:** The master spec explicitly rejects direct frontend-to-Documenso coupling. Signable docs must be generated from pinned mortgage-side blueprints, enveloped through a backend provider seam, surfaced through normalized envelope/recipient rows, and launched via backend-issued embedded sessions only after deal access and recipient matching are confirmed.
- **Why this phase is separately parallelizable:** This phase owns only the signable branch of package creation, normalized signature lifecycle tables, the provider seam, Documenso implementation, embedded signing sessions, and webhook/status sync. It does not own mortgage-side blueprint authoring, non-signable package generation, or archive behavior.

# PHASE OWNERSHIP

## What this phase owns

- `signatureEnvelopes`.
- `signatureRecipients`.
- `resolveDealDocumentSignatories(dealId)`.
- `SignatureProvider`.
- The Documenso implementation of `SignatureProvider`.
- The signable branch of `createDocumentPackage`.
- Embedded-signing session creation.
- Provider webhook ingestion and provider-status normalization.
- UI for signable docs, recipient status chips, embedded signing launch, and admin envelope status/retry.

## What this phase may touch but does not own

- `createDocumentPackage` orchestration owned by phase 7, only to fill the reserved signable branch.
- `resolveDealParticipantSnapshot` and `resolveDealDocumentVariables` from phase 7, only as inputs.
- `generatedDocuments` existing schema/module, only to set signable generation metadata and provider linkage.
- Signed artifact archive behavior, which phase 9 owns.

## What this phase must not redesign

- The blueprint truth model from phase 6.
- The package header / instance snapshot model from phase 7.
- The archive behavior from phase 9.
- The access-control requirement that broker visibility be explicit through `dealAccess`.

## Upstream prerequisites

- Phase 6 signable blueprints and allowed signatory role registry.
- Phase 7 package tables, participant resolver, variable resolver, and package creation dispatch seam.

## Downstream dependents

- Phase 9 consumes completed envelopes for `archiveSignedDocuments`.
- Final stakeholder-demo flow depends on this phase for real embedded signing.

# REQUIRED CONTEXT FROM THE MASTER SPEC

The master spec is explicit about the architectural stance and this phase MUST preserve it. There MUST be one admin origination workflow that stages input in backoffice and commits once. There MUST be one canonical mortgage activation constructor. Mortgage creation is outside the current GT servicing-state transition boundary; the mortgage machine begins at `active`, so this feature MUST insert a canonical mortgage row directly in its initial servicing snapshot rather than adding admin draft states to `mortgage.machine.ts` or faking a transition on a non-existent entity. Mortgage-backed listings are a projection/read model of mortgage + property + valuation + mortgage-owned public document blueprints. They are not independently authored mortgage business objects. Marketplace curation remains listing-owned, while economics, property facts, valuation summary, public origination docs, and payment-history signals are projection-owned. The Active Mortgage Payment System remains canonical: `obligations` express what is owed, `collectionPlanEntries` express collection intent, and execution reality lives in `collectionAttempts`, `transferRequests`, `externalCollectionSchedules`, and mortgage collection-execution fields. Documents follow the blueprint → package → instance model. Rotessa is an execution rail, not the source of economic truth. Broker access to deal-private docs must be explicit through `dealAccess`, not implied through admin bypass or hidden reads.

The master spec is explicit about the signable-document path:

- Signable mortgage-attached blueprints are selected during origination and pinned to immutable template versions.
- Signable package creation happens on `DEAL_LOCKED`, not lazily in the client portal.
- The implementation MUST add a typed signatory resolution contract.
- The signable-doc path MUST use a backend `SignatureProvider` seam.
- v1 provider is `documenso`.
- The portal MUST never talk directly to Documenso.
- The portal MUST never receive a provider admin URL.
- Embedded signing sessions MUST only be issued after:
  - `assertDealAccess(user, dealId)` passes, and
  - the user matches a `signatureRecipient`.
- Signatory platform roles are restricted to the master spec’s allowed registry.
- Provider statuses must be normalized into canonical envelope/recipient rows and reflected onto `generatedDocuments.signingStatus` and `dealDocumentInstances.status`.

This feature does not require completing the borrower application pipeline, completing underwriting or application-package assembly, redesigning the mortgage servicing state machine, building a generic one-time Rotessa retry/make-up abstraction across all payment surfaces, building a full custom CRM for documents, or solving every future deal-closing portal concern outside the document-package and signing surfaces described by the master spec.

# IN-SCOPE

- Add `signatureEnvelopes`.
- Add `signatureRecipients`.
- Add or finalize signable-related additive fields on `generatedDocuments` as required by the provider lifecycle.
- Implement `resolveDealDocumentSignatories(dealId)`.
- Implement `SignatureProvider`.
- Implement Documenso-backed `SignatureProvider`.
- Extend `createDocumentPackage` so `private_templated_signable` blueprints:
  - generate pinned-version PDFs,
  - resolve variables,
  - resolve signatories,
  - create envelopes,
  - create normalized recipient rows,
  - create `dealDocumentInstances` with signable statuses.
- Implement embedded-signing session issuance from the backend.
- Implement provider webhook ingestion / sync.
- Map provider statuses into normalized rows and surfaced UI state.

# OUT-OF-SCOPE

- Mortgage-side blueprint authoring.
- Public/private static blueprint behavior.
- Non-signable package generation.
- Signed archive download/upload/storage completion. That belongs to phase 9.
- Final broker role expansion in `dealAccess`.

# AUTHORITATIVE RULES AND INVARIANTS

- The portal MUST never talk directly to Documenso.
- The portal MUST never receive a provider admin URL.
- Signable docs MUST be created from pinned mortgage-side blueprints at deal lock time.
- Signatory resolution MUST use canonical typed participant identities, not read-model strings.
- Embedded signing session issuance MUST require both valid `dealAccess` and matching `signatureRecipient`.
- Only intended recipients may sign.
- The system MUST persist normalized envelope and recipient state across refresh, reconnect, and repeated portal visits.
- Provider status must be normalized into canonical rows.
- This phase MUST not use the provider as long-term storage for signed artifacts; phase 9 archives them back into platform storage.

# DOMAIN / DATA / CONTRACT CHANGES

## `signatureEnvelopes`

```ts
type SignatureProviderCode = "documenso";

type SignatureEnvelopeStatus =
  | "draft"
  | "sent"
  | "partially_signed"
  | "completed"
  | "declined"
  | "voided"
  | "provider_error";

interface SignatureEnvelope {
  generatedDocumentId: Id<"generatedDocuments">;
  dealId: Id<"deals">;

  providerCode: SignatureProviderCode;
  providerEnvelopeId: string;

  status: SignatureEnvelopeStatus;
  lastProviderSyncAt?: number;
  lastError?: string;

  createdAt: number;
  updatedAt: number;
}
```

## `signatureRecipients`

```ts
type SignatureRecipientStatus =
  | "pending"
  | "opened"
  | "signed"
  | "declined";

interface SignatureRecipient {
  envelopeId: Id<"signatureEnvelopes">;

  platformRole: string;
  providerRole: "SIGNER" | "APPROVER" | "VIEWER";

  name: string;
  email: string;
  signingOrder: number;

  providerRecipientId?: string;
  status: SignatureRecipientStatus;

  openedAt?: number;
  signedAt?: number;
  declinedAt?: number;

  createdAt: number;
  updatedAt: number;
}
```

## Signatory resolver

```ts
resolveDealDocumentSignatories(dealId: Id<"deals">): Array<{
  platformRole: string;
  name: string;
  email: string;
}>
```

This resolver MUST map the allowed platform-role registry to real participant identities derived from canonical domain records.

## Provider seam

```ts
interface SignatureProvider {
  createEnvelope(input: {
    generatedDocumentId: Id<"generatedDocuments">;
    dealId: Id<"deals">;
    pdfStorageId: Id<"_storage">;
    title: string;
    recipients: Array<{
      platformRole: string;
      name: string;
      email: string;
      providerRole: "SIGNER" | "APPROVER" | "VIEWER";
      signingOrder: number;
    }>;
    metadata?: Record<string, string>;
  }): Promise<{
    providerEnvelopeId: string;
    status: "draft" | "sent";
    recipients: Array<{
      platformRole: string;
      providerRecipientId?: string;
    }>;
  }>;

  createEmbeddedSigningSession(input: {
    providerEnvelopeId: string;
    providerRecipientId: string;
  }): Promise<{
    url: string;
    expiresAt: number;
  }>;

  syncEnvelope(input: {
    providerEnvelopeId: string;
  }): Promise<{
    envelopeStatus: SignatureEnvelopeStatus;
    recipients: Array<{
      providerRecipientId: string;
      status: SignatureRecipientStatus;
      openedAt?: number;
      signedAt?: number;
      declinedAt?: number;
    }>;
  }>;

  downloadCompletedArtifacts(input: {
    providerEnvelopeId: string;
  }): Promise<{
    finalPdfBytes: ArrayBuffer;
    completionCertificateBytes?: ArrayBuffer;
  }>;
}
```

## Additive `generatedDocuments` fields used by later archive behavior

If not already present in the repo, add the following additive fields now because phase 9 will populate them:

```ts
finalPdfStorageId?: Id<"_storage">;
completionCertificateStorageId?: Id<"_storage">;
signingCompletedAt?: number;
```

# BACKEND WORK

## 1. Implement signatory resolution

- Consume phase 7’s canonical participant snapshot.
- Map required platform roles from the pinned template version to actual participant identities.
- If a required role cannot be resolved, do **not** fake a recipient. Surface the problem explicitly.

A conservative and useful behavior is:
- create the `dealDocumentInstance`,
- mark it `signature_pending_recipient_resolution`,
- set package status `partial_failure`,
- expose admin retry once data is fixed.

## 2. Extend `createDocumentPackage` for `private_templated_signable`

For each signable blueprint:

1. Generate the PDF using pinned `templateId + templateVersion`.
2. Pass variables from `resolveDealDocumentVariables`.
3. Pass signatory mappings from `resolveDealDocumentSignatories`.
4. Persist a `generatedDocuments` row for the deal.
5. Create a provider envelope via `SignatureProvider.createEnvelope`.
6. Persist `signatureEnvelopes` and `signatureRecipients`.
7. Set `generatedDocuments.documensoEnvelopeId`.
8. Set `generatedDocuments.signingStatus` to `draft` or `sent` based on provider outcome.
9. Create `dealDocumentInstance` and set the appropriate signable status:
   - `signature_draft`
   - `signature_sent`
   - `signature_pending_recipient_resolution`
   - `generation_failed` or provider-error-adjacent state as appropriate.

## 3. Embedded signing session issuance

- Add backend session issuance endpoint/module, e.g. `documents/signature/sessions.ts`.
- Enforce:
  1. `assertDealAccess(user, dealId)` passes,
  2. the user maps to the intended `signatureRecipient`,
  3. the target recipient has a provider recipient ID,
  4. the envelope is in a signable state.
- Return only the embedded signing URL and expiration metadata required by the portal.

## 4. Provider webhook / status sync

- Add webhook ingestion and/or periodic sync flows.
- Normalize provider status into:
  - `SignatureEnvelope.status`
  - `SignatureRecipient.status`
  - relevant timestamps (`openedAt`, `signedAt`, `declinedAt`)
- Reflect normalized state into:
  - `generatedDocuments.signingStatus`
  - `dealDocumentInstances.status`

## 5. Admin retry / recovery surface

- Allow retry when envelope creation failed or recipient resolution became fixable.
- Do not create duplicate live envelopes without understanding the provider and instance state.
- Preserve auditability of provider errors through `lastError` and updated timestamps.

# FRONTEND / UI WORK

- Extend the deal portal with a signable-doc section.
- Show one row/card per signable document instance.
- Show recipient status chips.
- Show “Start signing” only for the currently authenticated user when that user is a matching `signatureRecipient`.
- Launch embedded signing in a modal/frame or equivalent contained experience.
- Refresh or live-update statuses after signing actions and provider syncs.
- Add admin envelope status/retry surfaces that expose normalized state, not provider admin URLs.

# ADDITIVE UI / UX DESIGN, CORE FLOWS, AND ASCII MOCKUPS

## Dashboard-shell integration requirements for this phase

This phase introduces signable-document runtime surfaces. The admin-facing implementation reference MUST remain inside the existing dashboard shell:

- global sidebar unchanged,
- breadcrumbs in the header,
- signable-document rows integrated into the deal page `Documents` area,
- envelope-status and retry/admin controls rendered as standard cards/drawers/modals.

If the repo also exposes a participant-facing portal outside the dashboard shell, that portal MAY reuse the same row model and embedded-signing componentry. The admin dashboard page described here remains the canonical layout anchor.

Recommended breadcrumb pattern:

- `Admin / Deals / {dealId}`

## Deal-page signable section design

The deal page’s reserved signable section from phase 7 becomes active. Keep it in the same overall document area order so the final deal page reads:

1. Package overview
2. Private static docs
3. Generated read-only docs
4. Signable docs
5. Archived signed artifacts (phase 9 later)

Recommended signable section content:

- one row/card per signable document instance,
- document name,
- package label/category if useful,
- overall document status,
- recipient chips,
- last sync timestamp,
- action column.

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Signable documents                                                                          │
│ Name                 Status             Recipients      Action                              │
│ Investor direction   [Signature sent] Jane/Lender…   Start                                  │
│ Lawyer undertaking   [Partially signed] Law/Borr…    View                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Recipient-chip design

Recipient chips SHOULD show enough normalized state to let operators and participants understand progress without reading raw provider language.

Recommended statuses:

- `Waiting`
- `Viewed`
- `Signed`
- `Declined`
- `Error`

Color/icon treatment SHOULD follow the platform’s general status language, not Documenso-specific branding. The platform surface owns normalized status.

## `Start signing` action rules

`Start signing` MUST only be visible/enabled for the currently authenticated user when that user corresponds to a matching `signatureRecipient`.

Recommended button variants:

- `Start signing` → user is eligible and there is pending work,
- `Continue signing` → session expired or partially complete but still eligible,
- `View status` → not eligible to sign or already complete,
- no action button for users who are not entitled to act except perhaps `View document`.

Do not expose a generic `Open Documenso` link or provider admin URL.

## Embedded signing modal / contained experience

Embedded signing SHOULD open in a contained experience from the platform surface, preferably a modal or large side sheet if that is consistent with the repo. The user should not feel like they are being thrown into a separate operational product.

Recommended modal structure:

- title with document name,
- recipient identity summary,
- warning banner if session is expiring soon,
- large iframe/container body,
- footer with `Close` and optional `Refresh status` action.

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Embedded signing — Investor direction                                                       │
│ Signing as: Jane Doe <jane@example.com>                                                     │
│─────────────────────────────────────────────────────────────────────────────────────────────│
│                                                                                             │
│   [ Embedded signing frame / provider session ]                                             │
│                                                                                             │
│─────────────────────────────────────────────────────────────────────────────────────────────│
│ Session may lag a few seconds.     [Close] [Refresh status]                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

The modal MUST not obscure the fact that the platform still owns surrounding navigation and status refresh.

## Admin envelope-status / retry surface

Admins need an operational view that shows normalized envelope/runtime state without exposing provider admin URLs.

Recommended pattern:

- click row action `Inspect envelope`,
- right-side drawer or secondary modal opens,
- show:
  - normalized envelope status,
  - provider code,
  - recipient list,
  - last webhook sync,
  - last error,
  - allowed admin actions (retry sync, resend, regenerate session depending platform policy).

ASCII mockup:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Envelope details — Investor direction                                                       │
│ Status: signature_sent  Provider: documenso                                                 │
│ Last sync: 2026-04-15 16:11                                                                 │
│                                                                                             │
│ Recipients: Jane (waiting), Ops lender (signed)                                             │
│ Last error: —                                                                               │
│                          [Retry sync] [Resend invite]                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

The labels MUST be platform-oriented and normalized; do not dump raw provider enums without translation.

## Status-refresh behavior

Because provider synchronization is asynchronous, the section SHOULD support one of:

- live query subscription,
- explicit refresh action,
- short polling after the signing modal closes.

The UI MUST preserve status across refresh and route changes. Recipient state cannot live only in local modal memory.

## Core user flows the UI MUST support

### Flow A — eligible participant signs

1. User opens the deal page.
2. Sees signable row with `Start signing`.
3. Clicks it.
4. Embedded signing modal opens.
5. User completes signing.
6. Modal closes or refreshes.
7. Row status updates to reflect the latest normalized state.

### Flow B — admin monitors envelope progress

1. Admin opens the same deal page in the dashboard shell.
2. Sees recipient chips and overall status.
3. Opens envelope details drawer.
4. Inspects last sync and any error state.
5. Uses retry action if appropriate.

### Flow C — user is not an intended recipient

1. User opens the deal page.
2. Row shows status but no actionable `Start signing`.
3. UI does not leak a provider session or provider admin URL.

## Interaction and visual-behavior rules

- Keep signable rows in the same normalized document area as other deal document instances; do not split them into a separate unrelated page.
- Use normalized status copy and badges; the platform owns canonical interpretation.
- Do not open embedded signing automatically on page load.
- After signing completion, the UI SHOULD make it obvious that final archival may still happen later (phase 9).
- Error states should remain actionable without requiring the operator to inspect raw logs.

## Merge-safe UI ownership notes

Phase 9 will append archived signed-artifact surfaces beneath or adjacent to this signable section. Keep the section boundaries and row model stable so archival can layer on top of the already-established signing runtime.

# INTEGRATION CONTRACTS

## Inputs this phase assumes exist

- Phase 6 signable blueprints and allowed signatory registry.
- Phase 7 package/instance tables and resolver contracts.
- Existing document generation engine.
- Existing auth and `dealAccess` enforcement.

## Outputs this phase guarantees

- Normalized envelope and recipient rows.
- Signable deal document instances with accurate status.
- Backend-issued embedded signing sessions.
- Provider status synchronization into canonical rows.

## Contracts exported for later phases

- `signatureEnvelopes`
- `signatureRecipients`
- `resolveDealDocumentSignatories`
- `SignatureProvider`
- Documenso provider implementation
- embedded signing session issuance contract

## Temporary compatibility bridges

- The archive fields on `generatedDocuments` may exist before phase 9 populates them.
- Completed envelopes remain provider-complete until phase 9 archives signed artifacts back into platform storage.
- Phase 9 consumes `downloadCompletedArtifacts` from the provider seam and must not bypass it.

## Idempotency / retry / failure semantics

- Retrying signable document package creation must avoid duplicate envelopes unless the previous envelope state truly requires replacement.
- Provider webhook re-delivery must be idempotent.
- Embedded signing session issuance must be safe to re-request when a prior session expires.
- Missing recipient resolution is a real failure state, not a reason to manufacture a fake recipient.

# FILE / MODULE OWNERSHIP

- **Owned**
  - `convex/documents/signature/provider.ts`
  - `convex/documents/signature/documenso.ts`
  - `convex/documents/signature/sessions.ts`
  - `convex/documents/signature/webhooks.ts`
  - signature schema definitions
  - signable deal portal/admin UI
- **Shared but not owned**
  - `convex/documents/dealPackages.ts`
  - `resolveDealParticipantSnapshot`
  - `resolveDealDocumentVariables`
  - `generatedDocuments` existing module/schema
- **Later phases may extend but not redesign**
  - envelope archive consumption via `downloadCompletedArtifacts` in phase 9

# ACCEPTANCE CRITERIA

- Locking a listing with signable blueprints generates signable deal docs and creates envelopes.
- Only matching intended recipients can launch embedded signing.
- The portal never talks directly to Documenso.
- Statuses persist across refresh and portal sessions.
- Provider status is normalized into canonical rows and UI state.
- This phase satisfies global acceptance criterion 14 and enables criterion 15.

# MANUAL TEST / CHECKPOINT

A human verifier MUST be able to:

1. Lock a listing with signable blueprints.
2. Open the deal portal as an eligible participant.
3. See signable docs and recipient statuses.
4. Launch embedded signing.
5. Complete at least one signature.
6. Refresh and confirm statuses persist and update correctly.
7. Confirm that a non-recipient user with deal access still cannot sign the document.

# RISKS / EDGE CASES / FAILURE MODES

- Recipient resolution is the highest-risk edge case. Do not hide unresolved roles.
- Webhook ordering and duplicate delivery are common provider-integration hazards; normalize idempotently.
- Provider recipient IDs may be missing immediately after envelope creation; handle that before issuing sessions.
- Do not leak provider admin URLs into the portal or admin UI.
- Multi-recipient signing order needs to remain stable and explicit.
- Completed envelopes are not the same thing as archived final artifacts; phase 9 still must do the archive work.

# MERGE CONTRACT

After this phase is merged:

- Signable deal docs are generated through the normalized package model.
- Documenso is behind a backend provider seam.
- Embedded signing is available only to matching authorized recipients.
- Phase 9 can archive final signed artifacts by consuming the normalized envelope/provider contract instead of adding a parallel integration.

# NON-NEGOTIABLE DO-NOT-DO LIST

- Do not let the frontend talk directly to Documenso.
- Do not expose provider admin URLs.
- Do not create fake signatory identities from read-model strings.
- Do not allow signing without both `dealAccess` and `signatureRecipient` match.
- Do not conflate provider completion with archived platform storage completion.
