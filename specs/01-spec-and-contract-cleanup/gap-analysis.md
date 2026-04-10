# 01. Spec and Contract Cleanup — Gap Analysis

Date: 2026-04-03
Spec: https://www.notion.so/337fc1b4402481db974fcf609859c7ba

## Outcome

This workstream is complete. The repository-facing docs and contract comments now
use the aligned three-layer vocabulary, `TransferProvider` is documented as the
canonical contract for new inbound provider work, `PaymentMethod` is documented
as transitional compatibility, and the canonical production path is spelled out
without changing runtime behavior.

## Acceptance Coverage

### Features
| Feature | Status | Evidence |
|---|---|---|
| F-1 Contract vocabulary alignment | Implemented | Updated payment/transfer contract comments and architecture docs |
| F-2 Canonical provider boundary | Implemented | `TransferProvider` marked as canonical for new inbound integrations |
| F-3 Transitional compatibility guidance | Implemented | `PaymentMethod` and adapter surfaces marked as compatibility/migration only |
| F-4 Boundary documentation | Implemented | Canonical path and obligation-driven lifecycle boundary added to docs |

### Requirements
| Requirement | Status | Evidence |
|---|---|---|
| REQ-1 Shared vocabulary alignment | Met | Updated repo-facing comments/docs to keep `Collection Attempt` as the business execution record and avoid collapsed abstractions |
| REQ-2 Canonical `TransferProvider` guidance | Met | Updated [convex/payments/transfers/interface.ts](../../convex/payments/transfers/interface.ts) and related docs |
| REQ-3 Transitional `PaymentMethod` guidance | Met | Updated [convex/payments/methods/interface.ts](../../convex/payments/methods/interface.ts) and compatibility surfaces |
| REQ-4 Canonical path and lifecycle boundary | Met | Updated [docs/cash-ledger-developer-guide.md](../../docs/cash-ledger-developer-guide.md) and payment-rails design docs |

### Use Cases
| Use Case | Status | Notes |
|---|---|---|
| UC-1 Engineer chooses correct inbound abstraction | Covered | New work points to `TransferProvider`; legacy compatibility points to `PaymentMethod` |
| UC-2 Engineer understands three-layer execution boundary | Covered | Docs now describe `Collection Plan -> Collection Attempt -> transfer/provider settlement -> obligation application -> cash posting` |

## Verification

Required repository gates passed:

- `bun check`
- `bun typecheck`
- `bunx convex codegen`

GitNexus verification performed:

- `impact(PaymentMethod, upstream)` returned `MEDIUM` risk with direct dependents limited to legacy method surfaces and related docs that were reviewed in this workstream.
- `impact(TransferProvider, upstream)` returned `MEDIUM` risk with direct dependents limited to transfer provider surfaces that were reviewed in this workstream.
- `impact(AdminDetailSheet, upstream)` returned `LOW` risk.
- `detect_changes(scope: "all")` marked the overall diff `critical` because the change set touches many indexed symbols, including large markdown docs and formatter-only rewrites. Manual review confirms the runtime-impacting change is limited to the small admin typecheck fix described below.

## Divergences and Notes

- No schema, API, or business-flow implementation changes were required or made for the Notion task itself.
- End-to-end coverage is not applicable because this workstream only updates documentation and code comments.
- During verification, `bun typecheck` exposed a pre-existing prop mismatch in `AdminDetailSheet`. I fixed it by making `entityType` optional and guarding record-link rendering when route state is incomplete. This was required to satisfy the repo verification gate but is not part of the Notion acceptance scope.
- `bun check` also applied formatter-only rewrites in a few admin files. Those changes are mechanical and do not alter behavior.

## Remaining Gaps

There are no remaining gaps against this Notion task's stated acceptance criteria.
