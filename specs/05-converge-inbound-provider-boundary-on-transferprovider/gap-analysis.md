# 05. Converge Inbound Provider Boundary on TransferProvider — Gap Analysis

Re-fetched against the canonical Notion sources on 2026-04-03:

- Spec: `https://www.notion.so/337fc1b4402481ceb962ca7c2eada7af`
- Linked plan: `https://www.notion.so/337fc1b4402481dc9efdcf83ffafd61e`

## Verdict

Page 05 is implemented for the canonical inbound provider-boundary convergence
described in the current Notion spec and linked implementation plan.

The codebase now presents `TransferProvider` as the single canonical inbound
provider boundary, while `PaymentMethod`, `methods/registry.ts`, and
`PaymentMethodAdapter` are explicitly narrowed to legacy compatibility support.
Canonical inbound execution continues to hand off from AMPS into Unified
Payment Rails, where the transfer domain resolves provider implementations
through the transfer-provider registry. Browser e2e was intentionally not added
because this page is backend contract, compatibility, and documentation
convergence work.

## Coverage Matrix

| Spec item | Status | Evidence |
| --- | --- | --- |
| Canonical inbound execution resolves providers through `TransferProvider` | Implemented | `convex/payments/transfers/mutations.ts`, `convex/payments/transfers/interface.ts`, `convex/payments/transfers/providers/registry.ts` |
| AMPS does not directly choose legacy `PaymentMethod` implementations for new inbound work | Implemented | transfer initiation comments and handoff posture in `convex/payments/transfers/mutations.ts`; no new canonical path was added through `convex/payments/methods/registry.ts` |
| Legacy `PaymentMethod` contract is fenced as compatibility-only | Implemented | deprecated framing and legacy-code allowlist in `convex/payments/methods/interface.ts` |
| Legacy registry only supports explicit compatibility codes | Implemented | runtime allowlist and narrowed builder flow in `convex/payments/methods/registry.ts` |
| `PaymentMethodAdapter` reads as a shim, not a peer provider boundary | Implemented | adapter now rejects canonical provider codes and documents compatibility-only behavior in `convex/payments/transfers/providers/adapter.ts` |
| Manual and mock compatibility surfaces steer contributors away from new usage | Implemented | deprecated compatibility framing in `convex/payments/methods/manual.ts` and `convex/payments/methods/mockPAD.ts` |
| Tests no longer present `PaymentMethod` as the primary inbound architecture | Implemented | compatibility relabeling in `convex/payments/__tests__/methods.test.ts`, `convex/payments/transfers/providers/__tests__/adapter.test.ts`, `convex/engine/machines/__tests__/collectionAttempt.test.ts`, `src/test/convex/payments/endToEnd.test.ts` |
| Docs show one canonical provider story with compatibility carve-out | Implemented | `docs/technical-design/unified-payment-rails.md`, `docs/architecture/unified-payment-rails-technical-design.md` |

## Use Case Coverage

| Use case | Status | Evidence |
| --- | --- | --- |
| UC-1: Canonical inbound transfer execution uses `TransferProvider` terminology and resolution | Implemented | transfer-domain registry remains canonical and page-05 tests/docs reinforce that path |
| UC-2: Legacy manual and mock flows still work as compatibility behavior | Implemented | `methods.test.ts` and adapter compatibility coverage keep `manual` and `mock_pad` working while rejecting canonical provider codes |
| UC-3: Future contributors see one production provider boundary and one compatibility seam | Implemented | doc updates, deprecated contract framing, and renamed tests remove peer-architecture ambiguity |

## Key Design Outcomes Verified

- `TransferProvider` remains the only production extension boundary for inbound
  provider resolution.
- `PaymentMethod` compatibility is now explicit in both type-level and runtime
  surfaces.
- The compatibility registry is narrow and rejects canonical provider codes
  instead of silently acting like a second provider registry.
- `PaymentMethodAdapter` now rejects canonical transfer-provider codes like
  `pad_rotessa` and `mock_eft`, making the legacy bridge non-ambiguous.
- Tests and docs now reinforce the retirement path instead of preserving older
  peer-architecture language.

## Intentional Scope Boundaries Preserved

- Page 05 remains backend/docs/test convergence work only.
- No route or UI work was added.
- No schema rename or historical field-name cleanup was attempted.
- Compatibility surfaces remain in place for legacy/manual/mock behavior instead
  of being removed outright.

## Residual Notes

1. Historical schema and domain field names such as `collectionAttempts.method`
   and `dispersalEntries.paymentMethod` still exist. They are legacy naming
   artifacts, not the provider-resolution abstraction. Broader terminology
   cleanup belongs to a later schema-focused page.
2. `PaymentMethod`, the legacy registry, and the adapter remain in the repo on
   purpose as compatibility surfaces. Page 05 narrows and labels them; it does
   not delete them.
3. GitNexus `detect_changes(scope="all")` reported `risk_level: medium`, but
   that scope includes the already-dirty page-04 plus page-05 worktree rather
   than page-05 in isolation.

## Verification Evidence

- `bun run test convex/payments/transfers/__tests__/mutations.test.ts convex/payments/transfers/providers/__tests__/adapter.test.ts convex/payments/__tests__/methods.test.ts convex/engine/machines/__tests__/collectionAttempt.test.ts src/test/convex/payments/endToEnd.test.ts`
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
- GitNexus `detect_changes(scope="all")` reported `risk_level: medium` for repo `fairlendapp`

## Final Assessment

No blocking gaps remain for the page-05 objective. The production inbound
provider story is now coherent: `TransferProvider` is the canonical contract,
AMPS hands off into Unified Payment Rails without reviving a second provider
boundary, legacy `PaymentMethod` surfaces are clearly compatibility-only, and
the updated backend tests and docs reflect that single-boundary architecture as
of 2026-04-03.
