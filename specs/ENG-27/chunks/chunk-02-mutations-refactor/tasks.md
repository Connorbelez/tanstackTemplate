# Chunk 02: Mutations Refactor

- [ ] T-012: Remove `postEntryInternal` function and ALL validation helpers from `mutations.ts`
- [ ] T-013: Remove the public `postEntry` export
- [ ] T-014: Import `postEntry` from `./postEntry`, add `postEntryDirect` internalMutation
- [ ] T-015: Update all convenience mutations to call imported `postEntry`
- [ ] T-016: Migrate convenience mutation errors to ConvexError
- [ ] T-017: Clean up unused imports, remove `PostEntryInput` interface (now in postEntry.ts)
- [ ] T-018: Run `bunx convex codegen && bun check && bun typecheck`
