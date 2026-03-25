# Chunk 02: tests

- [ ] T-013: Create test file `convex/auth/__tests__/resourceChecks.test.ts` with test setup: mock Viewer factory, fixture data insertion helpers for mortgages, brokers, borrowers, lenders, ledger_accounts, closingTeamAssignments, deals, dealAccess, applicationPackages.
- [ ] T-014: Write tests for `canAccessMortgage` — admin(true), borrower-own(true), borrower-other(false), broker-assigned(true), broker-other(false), lender-position(true), lender-no-position(false), lawyer-assigned(true), lawyer-not-assigned(false), random-user(false).
- [ ] T-015: Write tests for `canAccessDeal` — admin(true), broker-own(true), lender-buyer/seller(true), lawyer-assigned(true), other(false). Write tests for `canAccessLedgerPosition`, `canAccessAccrual`, `canAccessDispersal`.
- [ ] T-016: Write tests for `canAccessApplicationPackage` — sr_underwriter(all true), jr_uw-pool(true for assembled), jr_uw-own-claim(true), jr_uw-other-claim(false), review_decisions-permission(true for decision_pending_review).
