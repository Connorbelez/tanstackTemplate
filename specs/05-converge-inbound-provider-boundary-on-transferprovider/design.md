# 05. Converge Inbound Provider Boundary on TransferProvider — Design

> Derived from: https://www.notion.so/337fc1b4402481ceb962ca7c2eada7af

## Types & Interfaces

### Existing provider contracts stay explicit
The repo already contains the intended split:
- `convex/payments/transfers/interface.ts` defines `TransferProvider` as the
  canonical provider contract for transfer-domain execution and new inbound work
- `convex/payments/methods/interface.ts` defines `PaymentMethod` as legacy
  inbound compatibility
- `convex/payments/transfers/providers/adapter.ts` bridges a legacy
  `PaymentMethod` implementation into the `TransferProvider` contract

Page 05 should converge on that architecture rather than invent a third layer.

### Canonical ownership boundary
- AMPS owns:
  - `CollectionPlan`
  - `CollectionAttempt`
  - business execution semantics
  - handoff into Unified Payment Rails
- Unified Payment Rails owns:
  - `TransferRequest`
  - `TransferProvider`
  - provider resolution and initiation
  - transfer lifecycle
- Compatibility layer owns:
  - `PaymentMethod`
  - `PaymentMethodAdapter`
  - legacy registry and migration shims only

### Compatibility contract expectations
- `PaymentMethod` should remain stable but frozen
- `PaymentMethodAdapter` should remain narrowly scoped to inbound borrower
  compatibility only
- canonical docs and examples should reference `TransferProvider` first and
  mention `PaymentMethod` only in a compatibility section

## Database Schema

### No schema changes are expected
Page 05 is a provider-boundary convergence pass, not a storage redesign. The
existing attempt, transfer, and ledger tables remain authoritative.

### Expected metadata posture
- deprecation or compatibility intent should be encoded primarily in code
  comments, module boundaries, and tests
- if small runtime warnings already exist on legacy mocks, prefer extending that
  pattern rather than adding new tables or flags

## Architecture

### Data Flow
`collectionPlan.executePlanEntry`
-> Unified Payment Rails transfer-request creation
-> transfer-domain registry resolves `TransferProvider`
-> provider initiation executes in transfer infrastructure
-> transfer lifecycle and reconciliation continue through page-03/04 seams

Legacy compatibility flow:
compatibility-only caller
-> legacy `PaymentMethod` registry or concrete class
-> optional `PaymentMethodAdapter`
-> transfer-domain contract when bridging is still required

### Component Structure
No frontend component work is expected. The likely code surface is:
- `convex/payments/transfers/interface.ts`
- `convex/payments/transfers/providers/registry.ts`
- `convex/payments/transfers/providers/adapter.ts`
- `convex/payments/methods/interface.ts`
- `convex/payments/methods/registry.ts`
- `convex/payments/methods/manual.ts`
- `convex/payments/methods/mockPAD.ts`
- tests and docs that still describe `ManualPaymentMethod` or `PaymentMethod`
  as primary architecture

### API Surface

#### Reads (Queries/GET)
No new runtime query surface is expected.

#### Writes (Mutations/POST)
No new public API is required by default. Expected work is refactoring,
fencing, and clarifying existing provider-resolution surfaces.

#### Side Effects (Actions/Jobs)
No new cron or async orchestration is expected. Existing initiation and
reconciliation actions should continue to use transfer-domain provider
resolution.

### Routing
No route changes are planned. This is backend/provider-boundary and
documentation/test convergence work.

## Implementation Decisions

### Prefer convergence and fencing over premature deletion
The Notion plan explicitly frames `PaymentMethod` as compatibility-only but not
necessarily removable in one pass. The default should be:
- remove ambiguity now
- preserve explicitly required compatibility behavior
- defer full retirement until follow-on cleanup pages

### Canonical production paths should resolve providers only in the transfer domain
The current repo truth already suggests this is mostly in place through
`getTransferProvider`. Page 05 should verify and reinforce that rather than
reshaping the execution spine.

### Legacy registries should read as frozen compatibility shims
`convex/payments/methods/registry.ts` currently warns readers toward the
transfer-domain registry, which is good. The remaining convergence work is to
make sure tests, comments, and helper names do not continue to imply peer
architectural status.

### Tests should separate canonical coverage from compatibility coverage
Current signals suggest canonical transfer-provider tests already exist, while
some older tests still talk about `ManualPaymentMethod` as the lifecycle story.
Those should be rewritten or relabeled so contributors can distinguish:
- canonical transfer-provider behavior
- compatibility-only legacy behavior

### Docs should describe AMPS as handing off to Payment Rails, not to providers
This keeps pages 02, 03, and 04 aligned with page 05. Provider terminology
should stay inside Unified Payment Rails documentation and implementation.
