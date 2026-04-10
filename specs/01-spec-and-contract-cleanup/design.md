# 01. Spec and Contract Cleanup — Design

> Derived from: https://www.notion.so/337fc1b4402481db974fcf609859c7ba

## Types & Interfaces

This workstream changes documentation and code comments only. The relevant contract
surfaces are existing types and interfaces:

- `PaymentMethod`: legacy inbound collection compatibility interface
- `TransferProvider`: canonical transfer-domain provider interface for new inbound work
- `PaymentMethodAdapter`: temporary bridge from legacy `PaymentMethod` implementations to `TransferProvider`

## Database Schema

No database changes.

## Architecture

### Data Flow
Spec review -> identify stale repo-facing contract language -> update shared docs/comments ->
verify that repo-facing surfaces consistently describe the same boundary ->
produce local gap analysis for traceability

### Component Structure
- `convex/payments/methods/*`
  - legacy compatibility surfaces
- `convex/payments/transfers/*`
  - canonical transfer-domain provider contract and adapter
- `docs/*`
  - architecture and developer guides that describe the execution boundary
- `specs/01-spec-and-contract-cleanup/*`
  - local execution artifacts for this workstream

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| None | — | — | No runtime API changes in this workstream |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| None | — | — | No runtime API changes in this workstream |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| None | — | — | No runtime side effects in this workstream |

### Routing
No application route changes.

## Implementation Decisions
- Keep the existing runtime contracts intact. This task is about vocabulary and migration guidance, not functional convergence.
- Add explicit status banners to older design docs instead of rewriting the full historical documents. That preserves prior design context while preventing them from reading as current implementation guidance.
- Avoid editing the user-owned untracked alignment document at `specs/active-mortgage-payment-system-alignment-2026-04-03.md`; create a separate workstream folder for local execution artifacts.
- Treat browser/E2E testing as not applicable for this task because the acceptance criteria are documentation and comment alignment rather than observable runtime behavior.
