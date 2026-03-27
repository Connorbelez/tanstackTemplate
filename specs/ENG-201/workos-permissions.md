# ENG-201 WorkOS Permission Registration Checklist

These permissions must exist in WorkOS before deploying ENG-201 authorization changes:

- `payment:manage`
- `payment:view`
- `payment:view_own`
- `payment:retry`
- `payment:cancel`
- `payment:webhook_process`

Fluent middleware chains wired in `convex/fluent.ts`:

- `payment:view` → `paymentQuery`
- `payment:manage` → `paymentMutation`, `paymentAction`
- `payment:retry` → `paymentRetryMutation`
- `payment:cancel` → `paymentCancelMutation`
- `payment:view_own` → `paymentOwnQuery` (handler-level filtering still required to scope records to the requesting borrower/lender)
- `payment:webhook_process` → `paymentWebhookMutation`, `paymentWebhookAction`

Recommended role mapping from the ENG-201 implementation plan:

- Admin role: `payment:manage`, `payment:view`, `payment:retry`, `payment:cancel`
- Borrower/lender portal roles: `payment:view_own`
- Internal-only (no end-user role assignment): `payment:webhook_process`
