# ENG-201 WorkOS Permission Registration Checklist

These permissions must exist in WorkOS before deploying ENG-201 authorization changes:

- `payment:manage`
- `payment:view`
- `payment:view_own`
- `payment:retry`
- `payment:cancel`
- `payment:webhook_process`

Recommended role mapping from the ENG-201 implementation plan:

- Admin role: `payment:manage`, `payment:view`, `payment:retry`, `payment:cancel`
- Borrower/lender portal roles: `payment:view_own`
- Internal-only (no end-user role assignment): `payment:webhook_process`
