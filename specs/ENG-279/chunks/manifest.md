# Chunk Manifest: ENG-279 - View Engine — Detail Sheet Renderer Registry, Editability, and Domain Sections

| Chunk | Tasks | Status | Notes |
| ----- | ----- | ------ | ----- |
| chunk-01-backend-detail-contract | T-001, T-002, T-003 | complete | shared normalized-field builder extracted, `getRecordDetailSurface` added, backend tests passing |
| chunk-02-frontend-registry | T-004, T-005, T-006 | complete | sidebar now consumes normalized detail payload, registry is section-based, field renderer surfaces editability/computed metadata |
| chunk-03-dedicated-sections | T-007, T-008, T-009 | complete | reusable section primitives added and legacy `AdminDetailSheet` now delegates to the shared surface |
| chunk-04-tests-and-validation | T-010, T-011, T-012, T-013, T-014, T-015 | partial | targeted tests passed; repo-wide `bun check` and `bun typecheck` remain blocked by unrelated existing issues; `bunx convex codegen` is blocked by missing `CONVEX_DEPLOYMENT` |
