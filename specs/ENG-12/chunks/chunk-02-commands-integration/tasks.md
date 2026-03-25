# Chunk 02: Commands & Integration

- [ ] T-004: Create `convex/engine/commands.ts` with `buildSource(viewer, channel)` helper that constructs `CommandSource` from the authenticated `Viewer` context.
- [ ] T-005: Add typed command wrappers to `commands.ts`: `transitionOnboardingRequest` (adminMutation), `transitionMortgage` (authedMutation + permission check), `transitionObligation` (internalMutation). Each wraps `executeTransition` with the right auth level and entity type.
- [ ] T-006: Update `convex/onboarding/mutations.ts` — replace `transitionEntity(ctx, "onboardingRequest", ...)` calls in `approveRequest` and `rejectRequest` with `executeTransition(ctx, { entityType: "onboardingRequest", ... })` and use `buildSource(ctx.viewer, "admin_dashboard")` instead of inline source objects.
- [ ] T-007: Run `bunx convex codegen`, `bun check`, `bun typecheck`, `bun test`. Fix any issues.
