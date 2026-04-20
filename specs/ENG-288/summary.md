# Summary: ENG-288 - Phase 8 — Signable docs, Documenso envelopes, and embedded signing

- Source issue: https://linear.app/fairlend/issue/ENG-288/phase-8-signable-docs-documenso-envelopes-and-embedded-signing
- Primary plan: https://www.notion.so/347fc1b4402481b7822dfe02e5606a19
- Supporting docs:
  - https://www.notion.so/343fc1b4402481db9672cb0dbd65ad86
  - https://www.notion.so/343fc1b4402480549809fba9f5230d58

## Scope
- Add normalized `signatureEnvelopes` and `signatureRecipients` persistence, including provider status, sync metadata, recipient timestamps, and a canonical platform-identity link for recipient matching.
- Extend `generatedDocuments` and related document contracts so signable package generation can persist provider linkage now and hand off final-archive fields to phase 9 later.
- Replace the placeholder-only `private_templated_signable` package branch with real pinned-template PDF generation, recipient resolution, provider envelope creation, mirrored instance and package statuses, and conservative retry behavior.
- Introduce a backend `SignatureProvider` seam, a Documenso-backed adapter, embedded signing session issuance, and idempotent provider sync or webhook handling.
- Replace lender and admin reserved signable placeholders with normalized signable document rows, recipient chips, embedded signing launch, and envelope-level operational state.
- Add or update backend, UI, and workflow coverage for signable success, unresolved recipients, provider failures, access denial, and retry behavior.

## Constraints
- `fluent-convex` remains the canonical style; exported Convex surfaces must end in explicit `.public()` or `.internal()`.
- Signable documents must be created on `DEAL_LOCKED` from pinned mortgage-side blueprint versions, not lazily from the portal.
- The portal and admin UI must never talk directly to Documenso and must never expose provider admin URLs.
- Embedded signing session issuance must require both `assertDealAccess` and a canonical recipient match; read-model strings are not sufficient for authorization.
- Recipient resolution failures must remain explicit and auditable; do not manufacture fake recipients when the canonical participant graph is incomplete.
- Retry and sync flows must stay idempotent and conservative so failures do not silently create duplicate live envelopes.
- Existing phase 7 static and non-signable package behavior must remain green, and phase 9 still owns archival of final signed artifacts into platform storage.

## Open questions
- none
