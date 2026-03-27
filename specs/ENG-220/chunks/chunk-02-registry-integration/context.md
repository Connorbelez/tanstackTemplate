# Chunk 2 Context: Registry and Legacy Integration

## Scope
Wire the new mock provider into transfer provider resolution and add explicit production safety and legacy-path warning behavior.

## Current Registry State
`convex/payments/transfers/providers/registry.ts` currently resolves only:
- `manual` -> `ManualTransferProvider`
- default -> throws not implemented

## ENG-220 Requirements Driving This Chunk
- Register in Provider Registry with provider code `mock_pad` (inbound) and `mock_eft` (outbound)
- Only enabled when non-production or explicit test flag
- Existing old mock should be deprecated and produce warning when old interface path is used

## Guardrail Direction
- Convex codebase already uses `process.env` feature flags in runtime/tests.
- Use an explicit allow flag (for example `ENABLE_MOCK_PROVIDERS`) for production opt-in behavior.
- Failure mode should be explicit and actionable when disabled.

## Legacy Deprecation Context
- Old interface: `PaymentMethod` in `convex/payments/methods/interface.ts`
- Old mock: `MockPADMethod` in `convex/payments/methods/mockPAD.ts`
- Old registry: `convex/payments/methods/registry.ts`
- Requirement asks for a warning whenever old interface is used; implement as runtime warning in legacy path, preserving backward compatibility.
