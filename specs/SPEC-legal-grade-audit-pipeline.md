## PRD

### Overview

FairLend needs a canonical audit pipeline that can support internal review, external audit, and post-hoc reconstruction of the system state across ownership changes, money movements, accruals, payouts, corrections, and simulation replay. The current architecture already has the right primitives for append-only journaling and tamper evidence, but the exported audit trail is too lossy for legal-grade reconstruction because the hash-chain path carries forward a reduced metadata set.

This spec defines the business requirements for a legal-grade audit trail that:

- preserves provenance for every material action,
- keeps the tamper-evident hash chain intact,
- exports a reconstruction-ready package in CSV and JSON,
- supports point-in-time and full-history review,
- minimizes PII exposure while retaining legally relevant context,
- and makes audit access itself observable and logged.

### Why This Matters

An auditor should be able to take the exported evidence package, reconstruct the ledger state, and prove that the reconstructed state matches the system state at any day in the audit window. That package must cover:

- mortgage ownership movement,
- cash receipt and payout movement,
- accrual recognition and liability creation,
- defaults, renewals, collections, and corrections,
- and the simulation trail used for correctness testing.

The pipeline must also survive legal scrutiny. That means the export cannot be a debug log. It must be a stable, signed, reproducible evidence record with clearly defined provenance and redaction boundaries.

### Current-State Gap

The existing path in [convex/engine/auditJournal.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/auditJournal.ts), [convex/engine/hashChain.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/hashChain.ts), and [convex/components/auditTrail/lib.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/components/auditTrail/lib.ts) already creates a layered audit mechanism, but the Layer 2 export path only forwards a reduced metadata shape. That is enough to show transition order, but not enough to reconstruct a legal-grade financial history without cross-referencing operational tables.

The fix is not to weaken the hash chain. The fix is to canonicalize a richer audit envelope before hashing, keep the chain over that canonical payload, and export evidence from the full journal plus derived reconstruction inputs. In other words:

- the journal remains append-only,
- the hash chain still protects integrity,
- the export becomes reconstruction-ready instead of summary-only.

### Goals

1. Produce a canonical, immutable audit record for every material financial and ownership event.
2. Preserve enough provenance to answer “who did what, when, from where, under which session, and through which system path.”
3. Support reconstruction of final ledger state, daily ledger state, and cash balances from exported evidence alone.
4. Provide signed export packages for auditors with CSV and JSON outputs.
5. Ensure audit access is itself logged and reviewable.
6. Keep PII exposure minimal and explicit.

### Non-Goals

- Implementing the full money-ledger refactor itself.
- Defining the Playwright harness.
- Replacing existing operational tables with an external audit system.
- Shipping a generic SIEM or BI export.

### Users and Use Cases

#### U1: Internal finance review

Finance staff need to inspect the exact sequence of money movements and ownership changes for a date range, including the actor and request context for each entry.

Acceptance criteria:

- The system can export a canonical event list for any mortgage, lender, borrower, or system-wide date range.
- Each exported record includes stable identifiers, timestamps, actor metadata, and idempotency keys.
- The export can be read without accessing the live application database.

#### U2: External audit package

An external auditor needs a package that can be loaded into spreadsheet software or an offline parser and reconstructed to the same end state as the system.

Acceptance criteria:

- The package includes manifest, event CSV, entity snapshots, and reconstruction instructions.
- The package is signed and hash-anchored.
- The package verifies cleanly before use.

#### U3: Point-in-time reconstruction

An auditor or engineer needs to reconstruct ledger state as of a specific day, including ownership, cash, accrued receivables, liabilities, and payouts.

Acceptance criteria:

- The export contains enough raw events and snapshots to rebuild the state deterministically.
- Reconstruction produces identical balances to the live query model for the same day.

#### U4: Audit access traceability

Any read of the audit package or sensitive audit views must itself be logged.

Acceptance criteria:

- Audit package access is recorded with actor, channel, session, and request context.
- Access logs are queryable separately from business events.

#### U5: Simulation correctness support

The audit pipeline must support replay of simulated daily commands and the comparison of reconstructed state against the system state.

Acceptance criteria:

- Simulation runs can emit auditable command records.
- The same export model can be used for normal operations and simulation validation.
- The design does not depend on Playwright internals.

### Functional Requirements

| ID | Requirement | Description | Priority |
| --- | --- | --- | --- |
| AR-1 | Canonical audit envelope | Every audited event must record actor, channel, request, source system, and entity context in a stable schema | Must |
| AR-2 | Financial coverage | Audit trail must include ownership transfers, cash movements, accruals, payouts, corrections, defaults, renewals, and simulation runs | Must |
| AR-3 | Reconstruction package | Export must include CSV and JSON views sufficient to rebuild state offline | Must |
| AR-4 | Tamper evidence | All records must remain hash-chain verifiable, including export packages | Must |
| AR-5 | PII minimization | The audit system must redact or omit data that is not needed for audit or reconstruction | Must |
| AR-6 | Access logging | Reads of audit evidence must be logged as first-class events | Must |
| AR-7 | Point-in-time replay | Audit trail must support day-by-day and as-of reconstruction | Must |
| AR-8 | Audit corrections | Corrections must be represented as new events, never in-place edits | Must |
| AR-9 | Retention | Evidence must be retained according to policy and retrievable in legible form | Must |

### Provenance Requirements

Each canonical audit event must preserve, at minimum:

- `actorId`
- `actorType`
- `channel`
- `ip`
- `sessionId`
- `requestId`
- `correlationId`
- `idempotencyKey`
- `originSystem`
- `legalEntityId`
- `legalEntityType`
- `timestamp`
- `effectiveDate`
- `entityType`
- `entityId`
- `eventType`

Additional business context must be included when relevant:

- mortgage id,
- account ids,
- cash instrument ids,
- obligation ids,
- ledger side deltas,
- before/after state summaries,
- reason or correction note,
- and reconstruction hints.

### Export Requirements

The export package must support at least the following artifacts:

- `manifest.json`
- `events.csv`
- `events.json`
- `entities.csv`
- `balances.csv`
- `reconstruction-notes.md`
- `package-hash.txt`
- `package-signature.txt`

The CSV view is for auditors and spreadsheets. The JSON view is for deterministic reconstruction. The manifest must declare schema version, generation time, date range, hashes, row counts, and signing metadata.

### Data Classification

The audit system must distinguish:

- operational audit data,
- reconstruction-critical data,
- restricted personal data,
- and display-only derived summaries.

PII minimization rules:

- Do not duplicate raw identity attributes unless they are required for legal evidence.
- Prefer stable foreign keys and legal entity references over free-form personal details.
- Redact sensitive fields in exported views unless a restricted export mode is explicitly invoked and permitted.
- Log every access to restricted exports.

### Audit Correction Rules

- Corrections must be append-only.
- Corrections must point to the event being corrected.
- Corrections must explain the reason in human-readable form.
- Corrections must not mutate the original event chain.

### Retention and Access

Audit records must be retained according to policy and not silently deleted during the retention window. If a record is no longer included in a default export view, the system must still preserve it internally and mark the reason for exclusion. All export and view access to audit material must be logged.

### Acceptance Criteria

1. A full audit export can be generated for a date range and verified before consumption.
2. The export contains enough data to rebuild ownership, cash, accrual, payout, and correction state.
3. Hash verification passes for both the journal and the export package.
4. Accessing the export is itself audit logged.
5. Sensitive fields are minimized and redaction rules are explicit and testable.
6. Simulation replay can consume the same export format as production audit export.

## TDD

### Architecture

The implementation should treat the current Convex audit pipeline as the canonical event spine and extend it in three layers:

1. `auditJournal` becomes the normalized canonical record store.
2. `hashChain` signs the canonical record content, not a reduced summary.
3. Export queries materialize reconstruction-friendly packages from the full journal and current ledger tables.

Relevant files:

- [convex/schema.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/schema.ts)
- [convex/engine/auditJournal.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/auditJournal.ts)
- [convex/engine/hashChain.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/hashChain.ts)
- [convex/components/auditTrail/lib.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/components/auditTrail/lib.ts)
- [convex/engine/transition.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/transition.ts)
- [docs/blog/audit-traceability-architecture.md](/Users/connor/Dev/tanstackFairLend/fairlendapp/docs/blog/audit-traceability-architecture.md)

### Canonical Record Model

Add or normalize a canonical audit event shape with fields like:

```ts
type CanonicalAuditEvent = {
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  effectiveDate: string;
  timestamp: number;
  actorId: string;
  actorType: string;
  channel: string;
  ip?: string;
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
  originSystem: string;
  legalEntityId?: string;
  legalEntityType?: string;
  idempotencyKey?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  delta?: Record<string, unknown>;
  reason?: string;
  source: {
    type: "user" | "system" | "webhook" | "cron";
    actor?: string;
    channel?: string;
  };
  hashes: {
    recordHash: string;
    chainHash: string;
  };
};
```

The important point is not the exact field names. The important point is that the hash chain must cover the canonical payload that the export uses, not a trimmed projection.

### Schema Additions

Update [convex/schema.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/schema.ts) so audit-related tables can store:

- canonical event envelope,
- export package metadata,
- access logs,
- reconstruction runs,
- and verification results.

Suggested tables:

| Table | Purpose |
| --- | --- |
| `auditJournal` | Canonical append-only event spine |
| `auditExports` | Export package metadata and hashes |
| `auditAccessLog` | Reads of audit evidence |
| `auditReconstructionRuns` | Historical reconstruction jobs and verification results |

Each table should have indexes for `entityId`, `entityType`, `timestamp`, `eventType`, `requestId`, and `correlationId` where applicable.

### Hash-Chain Strategy

Keep tamper evidence intact by changing the hash input to the canonical normalized record:

- normalize the payload,
- sort stable keys,
- exclude only derived presentation fields,
- hash the canonical object,
- store both the raw canonical payload and the hash values.

Do not hash a shortened summary and then hope exports can reconstruct the rest. That would preserve integrity but lose audit value. Instead, hash the rich canonical event and derive short-lived views from it.

### Export Strategy

Implement a deterministic export query that:

1. loads canonical journal events for the target window,
2. loads current or point-in-time ledger snapshots needed for reconstruction,
3. materializes CSV and JSON rows,
4. computes export package hashes,
5. stores the package metadata,
6. and returns a signed manifest.

The manifest must include:

- schema version,
- export window,
- generation time,
- row counts,
- source query parameters,
- package hash,
- chain hash root,
- signer identity,
- and verification status.

### Reconstruction Strategy

Reconstruction should be modeled as a pure read-side job:

- input: signed export package or journal query range,
- output: reconstructed balances and state timeline,
- verification: compare reconstructed state with live query snapshots at the same boundary.

The reconstruction engine must be able to operate without direct mutation access. It should recompute state from events and only then compare against current read models.

### Access Logging

Every export read and restricted audit view must create an access log entry with:

- actor,
- timestamp,
- request id,
- correlation id,
- purpose,
- query scope,
- and whether the access was exported, viewed, or verified.

Access logging must be append-only and should itself be auditable.

### Migration and Backfill Plan

1. Add the richer canonical event schema and preserve old fields for compatibility.
2. Teach the hashing layer to hash the canonical payload.
3. Backfill existing audit rows into the normalized shape where possible.
4. Generate package metadata for historical export windows.
5. Verify old and new exports side by side until parity is established.

Backfill must not rewrite existing business events in place. It should create normalized audit records or compatibility views, not mutate history.

### Failure Modes

- Missing provenance field: reject the write unless the field is explicitly optional for that path.
- Hash mismatch: mark the package invalid and block certified export.
- Partial export failure: store a failed export run with error details.
- Redaction bug: fail closed, not open.
- Reconstruction mismatch: record discrepancy, preserve both the reconstructed and live snapshots for review.

### Testing Strategy

Unit tests should cover:

- canonical event normalization,
- hash stability for equivalent payloads,
- export manifest contents,
- redaction rules,
- package verification,
- and reconstruction equivalence.

Integration tests should cover:

- event insertion through the audit pipeline,
- export generation and signing,
- access logging on read paths,
- and point-in-time reconstruction checks.

### Rollout Gates

1. New canonical records can be written without breaking existing consumers.
2. Hash verification passes for new records and historical backfills.
3. Export packages can be generated and verified in a non-production environment.
4. Read-side audit access is logged.
5. Reconstruction parity is demonstrated on a representative data set.

### Implementation Notes

The fastest safe path is to treat the existing audit trail architecture as the source of truth and extend it, not replace it. The audit layer already separates mutation logging from hash chaining; this spec only requires making the canonical payload richer and the export package more complete.
