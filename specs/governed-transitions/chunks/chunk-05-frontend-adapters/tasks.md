# Chunk 05 — Frontend Adapters & Route Refinement

- [ ] T-031A: Create a governed-transitions-specific journal wrapper component that adapts `demo_gt_journal` data into the shape required by `src/components/ui/interactive-logs-table-shadcnui.tsx`. The wrapper must remain read-only and support search/filter/inspection only.
- [ ] T-031B: Create a governed-transitions-specific machine wrapper component that adapts `getMachineDefinition` output and selected entity state into the shape required by `src/components/ui/n8n-workflow-block-shadcnui.tsx`. The wrapper must render in read-only mode only.
- [ ] T-031C: If needed, refactor the two reusable UI components to accept a read-only/observer configuration without changing their generic purpose. Do not introduce governed-transitions-specific domain logic directly into the shared UI components.
- [ ] T-032A: Update the Journal page implementation so it uses the governed-transitions journal wrapper around `InteractiveLogsTable` instead of a bespoke card list. Preserve filtering, entity scoping, and detailed inspection behavior.
- [ ] T-033A: Update the Machine Inspector page implementation so it uses the governed-transitions machine wrapper around `N8nWorkflowBlock` instead of a bespoke HTML/CSS diagram. Preserve current-state highlighting and transition metadata display.
- [ ] T-033B: Ensure the Command Center remains the only mutative route surface. The Journal and Machine routes must not expose command buttons, reset actions, node editing, or any other state-changing affordance.
