# ENG-65 Chunk Manifest

## Execution Order

| # | Chunk | Tasks | Status |
|---|-------|-------|--------|
| 1 | `chunk-01-preflight` | T-001 → T-005 | ✅ complete |
| 2 | `chunk-02-machines` | T-006 → T-010 | ✅ complete |
| 3 | `chunk-03-generation-rules` | T-011 → T-016 | ✅ complete |
| 4 | `chunk-04-methods-chain` | T-017 → T-023 | ✅ complete |
| 5 | `chunk-05-review-fixes` | T-024 → T-029 | ✅ complete |

## Dependencies
- Chunk 1 must complete first (establishes baseline)
- Chunks 2, 3, 4 depend on chunk 1 passing (if tests fail in pre-flight, we fix first)
- Chunk 5 depends on all previous chunks completing

## Context Sources
- **Implementation Plan**: Notion page `327fc1b4402481cdbf06fc1852b939e6`
- **SPEC 1.5**: Notion page `322fc1b4402481e4be17f254b0aa3230`
- **PRD 1.5**: Notion page `322fc1b4402481778117c129ca04a614`
- **ENG-64** (blocker, Done): Delivered effects + cross-entity/E2E tests
