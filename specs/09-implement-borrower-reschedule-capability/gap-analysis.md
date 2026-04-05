# 09. Implement Borrower Reschedule Capability — Gap Analysis

## Final Status
- Status: implemented
- Spec: https://www.notion.so/09-Implement-Borrower-Reschedule-Capability-337fc1b44024814f9c99ff923baa8ae7?source=copy_link
- Linked plan: https://www.notion.so/Implementation-Plan-Implement-Borrower-Reschedule-Capability-337fc1b4402481f0873de14148b144c2?source=copy_link
- Date re-checked: 2026-04-04

## What Shipped
- A canonical payment-domain reschedule command now exists for collection-plan entries.
- Reschedule remains strategy-only:
  - the original entry is preserved and marked `rescheduled`
  - a replacement `planned` entry is created with `source = "admin_reschedule"`
  - obligation truth is unchanged
- Lineage is now operator-inspectable through:
  - `rescheduledFromId`
  - explicit reschedule metadata on plan entries
  - audit log events for `collection_plan.reschedule_plan_entry`
- Eligibility is explicit and safe-first:
  - entries already executing or linked to execution state are rejected
  - entries currently due for scheduler execution are rejected
  - blocked `planned` entries that are not currently scheduler-eligible can still be rescheduled
- Downstream compatibility is proven:
  - superseded originals remain non-executable
  - replacement entries execute through the canonical page-03 spine
  - retry lineage attaches to the executed replacement entry, not the superseded original

## Verification
- Focused backend regression coverage passed for:
  - successful reschedule lineage
  - rejection of unsafe entries
  - blocked-but-reschedulable entries
  - replacement execution via due runner
  - retry lineage after replacement failure
  - existing collection-plan execution and runner behavior
- `bun check` passed with the repo’s existing unrelated complexity warnings
- `bun typecheck` passed
- `bunx convex codegen` passed
- GitNexus `detect_changes(scope=\"all\", repo=\"fairlendapp\")` reported `risk_level: low`

## Notes on Impact Analysis
- GitNexus did not resolve the relevant AMPS handler exports cleanly by symbol name in the current index.
- The implementation compensated for that limitation with focused regression coverage across schema, execution, runner, and retry seams before close-out.

## Residual Scope
- The shipped entrypoint is admin/payment-managed, not a borrower-facing self-service UI.
- This matches the page-09 implementation-plan guidance to ship an admin-governed first version while keeping the contract reusable for borrower channels later.
- No dedicated operator query or UI was added in page 09; persistence plus audit data is in place for later surfaces.

## Conclusion
- No blocking page-09 gaps remain for the spec’s admin-governed first delivery.
