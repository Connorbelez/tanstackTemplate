# ENG-286 Phase 6 Mortgage Document Blueprints And Public/Private Static Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship phase 6 so origination can author mortgage-scoped document drafts, convert them into immutable mortgage blueprints on commit, and project only public static docs onto listings.

**Architecture:** Keep mortgage documents mortgage-owned, not listing-owned. Store uploaded PDFs in immutable `documentAssets`, stage authoring in `originationCaseDocumentDrafts`, materialize immutable `mortgageDocumentBlueprints` during commit, and refresh the listing compatibility cache from active public blueprints. Reuse the existing document engine template/version/group primitives for pinned-version expansion and draft validation instead of inventing a second document model.

**Tech Stack:** Convex, fluent-convex, React, TanStack Router, Vitest, React Testing Library, Playwright, Bun, Biome

---

## File Map

**Create**
- `convex/admin/origination/caseDocuments.ts`
- `convex/documents/assets.ts`
- `convex/documents/mortgageBlueprints.ts`
- `convex/listings/publicDocuments.ts`
- `src/components/admin/origination/document-drafts.ts`
- `src/components/admin/origination/DocumentDraftComposer.tsx`
- `src/components/admin/origination/DocumentDraftList.tsx`
- `src/test/convex/admin/origination/caseDocuments.test.ts`
- `src/test/convex/documents/mortgageBlueprints.test.ts`

**Modify**
- `convex/schema.ts`
- `convex/admin/origination/cases.ts`
- `convex/admin/origination/validators.ts`
- `convex/mortgages/activateMortgageAggregate.ts`
- `convex/listings/projection.ts`
- `convex/crm/detailContextQueries.ts`
- `convex/test/moduleMaps.ts`
- `convex/test/originationE2e.ts`
- `src/lib/admin-origination.ts`
- `src/components/admin/origination/DocumentsStep.tsx`
- `src/components/admin/origination/OriginationWorkspacePage.tsx`
- `src/components/admin/origination/workflow.ts`
- `src/components/admin/shell/dedicated-detail-panels.tsx`
- `src/test/convex/admin/origination/commit.test.ts`
- `src/test/convex/listings/projection.test.ts`
- `src/test/admin/origination/origination-workflow.test.tsx`
- `src/test/admin/mortgage-dedicated-details.test.tsx`
- `docs/architecture/admin-origination-workspace.md`

## Blast Radius Checkpoints

GitNexus MCP tools are not exposed in this session, and the local CLI bootstrap fails, so blast radius must be checked manually before edits.

- `convex/admin/origination/validators.ts`
  - Callers: `convex/admin/origination/cases.ts`, `src/components/admin/origination/workflow.ts`, origination backend/UI tests.
- `convex/mortgages/activateMortgageAggregate.ts`
  - Callers: `convex/admin/origination/commit.ts`, origination commit tests.
- `convex/listings/projection.ts`
  - Callers: origination activation, listing refresh mutation, listing/detail tests.
- `convex/crm/detailContextQueries.ts`
  - Callers: `src/components/admin/shell/dedicated-detail-panels.tsx`, mortgage/listing detail tests.
- `src/components/admin/origination/DocumentsStep.tsx`
  - Callers: `OriginationWorkspacePage`, origination workflow tests.

## Tasks

### Task 1: Add schema and validators for document drafts and blueprints

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/admin/origination/validators.ts`
- Modify: `src/lib/admin-origination.ts`

- [ ] Add spec-shaped document draft validators and TS types for:
  - `public_static`
  - `private_static`
  - `private_templated_non_signable`
  - `private_templated_signable`
- [ ] Extend `originationCaseDocumentDrafts` with class, status, label, archive metadata, template/template-group refs, pinned versions, expanded template rows, validation issues, related asset, and ordering.
- [ ] Add `mortgageDocumentBlueprints` with immutable blueprint payload plus archival fields and indexes for mortgage/class/listing projection reads.
- [ ] Update shared origination frontend types so the documents step can render real staged drafts.

### Task 2: Add failing backend tests for document staging

**Files:**
- Create: `src/test/convex/admin/origination/caseDocuments.test.ts`
- Modify: `convex/test/moduleMaps.ts`

- [ ] Write tests that prove:
  - static PDF upload produces a `documentAssets` row
  - group attach expands immediately into pinned draft rows
  - non-signable template drafts reject signable fields
  - signable template drafts reject unsupported signatory roles
  - case deletion removes staged document drafts

### Task 3: Implement document asset ingest and case document authoring

**Files:**
- Create: `convex/documents/assets.ts`
- Create: `convex/admin/origination/caseDocuments.ts`
- Modify: `convex/admin/origination/cases.ts`

- [ ] Reuse the existing PDF metadata extraction/upload pattern to support immutable admin-uploaded `documentAssets`.
- [ ] Add case-document queries/mutations for:
  - list drafts by case
  - create static draft from uploaded asset
  - attach template version
  - attach template group and expand into pinned drafts
  - archive / replace staged draft rows
- [ ] Keep staged draft validation in one place so the commit path and UI read the same persisted errors.

### Task 4: Add failing backend tests for commit conversion and public projection

**Files:**
- Modify: `src/test/convex/admin/origination/commit.test.ts`
- Create: `src/test/convex/documents/mortgageBlueprints.test.ts`
- Modify: `src/test/convex/listings/projection.test.ts`

- [ ] Write tests that prove:
  - commit materializes one immutable blueprint row per staged draft
  - commit pins template versions and stores static/private/public classes correctly
  - replay is idempotent and does not duplicate blueprint rows
  - archived blueprint replacement creates a new active row and archives the old one
  - listing projection includes only active public static blueprint assets

### Task 5: Implement blueprint materialization and listing public-doc reads

**Files:**
- Create: `convex/documents/mortgageBlueprints.ts`
- Create: `convex/listings/publicDocuments.ts`
- Modify: `convex/mortgages/activateMortgageAggregate.ts`
- Modify: `convex/listings/projection.ts`
- Modify: `convex/crm/detailContextQueries.ts`

- [ ] Materialize mortgage blueprints during canonical activation and return real `publicBlueprintCount` / `dealBlueprintCount`.
- [ ] Make blueprint rows immutable except archival.
- [ ] Refresh `listings.publicDocumentIds` from active public static blueprints only.
- [ ] Add authoritative mortgage/listing document read models:
  - mortgage detail gets blueprint rows grouped by class/status
  - listing detail gets lender-facing public docs only

### Task 6: Add failing UI tests for authoring and admin detail surfaces

**Files:**
- Modify: `src/test/admin/origination/origination-workflow.test.tsx`
- Modify: `src/test/admin/mortgage-dedicated-details.test.tsx`

- [ ] Add workflow coverage for the real documents step:
  - four document sections
  - staged draft rows
  - validation/error copy
- [ ] Add mortgage detail coverage for blueprint rendering and archive/edit affordances.
- [ ] Add listing detail coverage for public-doc-only rendering.

### Task 7: Implement the admin Documents step and detail tabs

**Files:**
- Create: `src/components/admin/origination/document-drafts.ts`
- Create: `src/components/admin/origination/DocumentDraftComposer.tsx`
- Create: `src/components/admin/origination/DocumentDraftList.tsx`
- Modify: `src/components/admin/origination/DocumentsStep.tsx`
- Modify: `src/components/admin/origination/OriginationWorkspacePage.tsx`
- Modify: `src/components/admin/origination/workflow.ts`
- Modify: `src/components/admin/shell/dedicated-detail-panels.tsx`

- [ ] Replace the placeholder documents step with a real authoring UI for static docs now and templated docs attachment flows.
- [ ] Keep persisted data as the source of truth on review/detail surfaces.
- [ ] Replace the mortgage detail “reserved anchor” with a real blueprint section.
- [ ] Upgrade the listing detail public documents section to show projected public assets from mortgage blueprints.

### Task 8: Documentation, verification, and drift audit

**Files:**
- Modify: `docs/architecture/admin-origination-workspace.md`
- Modify: `convex/test/originationE2e.ts` if cleanup needs document artifacts

- [ ] Document phase-6 ownership rules, immutable assets/blueprints, and listing-public projection behavior.
- [ ] Run:
  - `bun check`
  - `bunx convex codegen`
  - `bun typecheck`
  - focused Vitest suites for origination/documents/listings/admin detail
- [ ] Audit the implementation back against ENG-286 + linked Notion spec and fix any drift before claiming completion.

## Verification Bar

- `bun check`
- `bunx convex codegen`
- `bun typecheck`
- Focused origination/document/listing/admin-detail tests
- `coderabbit review --plain`

## Definition Of Done

- Admin origination can stage public/private static docs and template-backed drafts.
- Commit converts staged drafts into immutable mortgage blueprints exactly once.
- Listing public docs are projection-driven from mortgage public blueprints.
- Mortgage detail shows blueprint rows; listing detail shows only public docs.
- Private static docs are stored and blueprint-owned but not exposed to listings or deal views yet.
