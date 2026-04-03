# Implementation Manifest: ENG-230 — Admin Shell — EntityTable (Reusable Data Table)

Generated: 2026-04-02
Source: Linear `ENG-230`, Notion implementation plan, linked context pages

| Chunk | Label | Tasks | Status |
| ----- | ----- | ----- | ------ |
| 01 | core-table | T-001, T-002, T-003 | pending |
| 02 | renderers-toolbar | T-004, T-005, T-006 | pending |
| 03 | consumers-stories | T-007, T-008, T-009, T-010 | pending |

Status values: `pending` | `in-progress` | `complete` | `partial` | `blocked`

## Execution Order
1. `chunk-01-core-table` first. It removes the fake table contract and establishes the reusable TanStack core.
2. `chunk-02-renderers-toolbar` second. It adds the shared UX modules that the core table composes.
3. `chunk-03-consumers-stories` third. It validates real route consumers, adds required Storybook coverage, and runs the quality gate.
