# Chunk 01: deal-seed-runtime

- [x] T-001: Align deal compound-state persistence with the spec by replacing the current JSON-based status serialization in `convex/engine/serialization.ts` and its `convex/engine/transition.ts` call sites with dot-notation state helpers so seeded deal statuses can round-trip through the real transition engine.
- [x] T-002: Extend `convex/seed/seedHelpers.ts` with deal-specific seed support: treat `"deal"` as a governed entity for audit journal machine versions and add an idempotent lookup helper keyed by mortgage plus buyer auth ID.
- [x] T-003: Create `convex/seed/seedDeal.ts` as an `adminMutation` that idempotently seeds three deals in `initiated`, `lawyerOnboarding.verified`, and `documentReview.signed`, using seeded mortgage IDs and lender auth IDs, plus synthetic audit trails and placeholder reservation IDs for mid-phase records.
- [x] T-004: Wire `convex/seed/seedDeal.ts` into `convex/seed/seedAll.ts` after lender and mortgage seeding, return created/reused deal counts and IDs, and keep the overall seed flow rerunnable without duplicates.
- [x] T-005: Extend `src/test/convex/seed/seedAll.test.ts` to verify created and rerun counts for deals, the exact seeded statuses, valid lender auth IDs and mortgage references, audit journal alignment, and rehydration of the seeded compound statuses through the real deal machine/serialization path.
