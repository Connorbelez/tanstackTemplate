# ENG-252 Type Design Review

## 1. `validators.ts` -- Shared Union Validators

### Invariants Identified
- Field types form a closed set of 14 literals
- View types form a closed set of 3 literals
- Filter operators form a closed set of 16 literals
- Logical operators form a closed set of 2 literals
- Select options always have value + label + color + order

### Ratings
- **Encapsulation**: 7/10
  Convex validators serve double duty as both TypeScript types (via `Doc<>` inference) and runtime validators. This is good. However, the validators are flat unions -- no grouping by semantic category (e.g., text operators vs numeric operators).

- **Invariant Expression**: 6/10
  The flat `filterOperatorValidator` union accepts ALL 16 operators regardless of field type. The type system cannot express "operator X is only valid for field type Y." This invariant is pushed entirely to runtime.

- **Invariant Usefulness**: 7/10
  The closed unions prevent typos and invalid literals at the API boundary. Useful for preventing a large class of bugs.

- **Invariant Enforcement**: 6/10
  Enforcement happens at the Convex validator layer (runtime). No compile-time relationship between FieldType and valid operators. The `selectOptionValidator` lacks constraints (empty string for value? negative order?).

### Strengths
- Single source of truth for all CRM enums -- DRY
- Convex validators provide automatic runtime validation at the API boundary
- Good reuse across schema.ts and handler files

### Concerns
1. **`filterOperatorValidator` is a flat bag of all operators.** The type `"contains" | "equals" | ... | "is_true" | "is_false"` permits nonsensical combinations like `{ fieldType: "boolean", operator: "contains" }` at the type level. The `filterOperatorValidation.ts` file catches this at runtime, but the types don't help.
2. **`selectOptionValidator` has no constraints on `value`/`label`/`color`/`order`.** Empty strings, negative orders, and invalid CSS color strings are all representable.
3. **Missing: a validator for the "between" operator's dual-value requirement.** When `operator === "between"`, two values are needed, but the filter schema has a single `v.optional(v.string())` for `value`.

### Recommended Improvements
- Extract operator subsets as named validators (`textOperatorValidator`, `numericOperatorValidator`, etc.) so they can be documented and potentially used in more targeted input schemas.
- Add `v.string()` min-length constraints to `selectOptionValidator.value` and `.label` if Convex supports custom validators, or document the constraint prominently.
- Consider a discriminated `value` field on `viewFilters` -- e.g., `v.union(v.object({ type: "single", value: v.string() }), v.object({ type: "range", low: v.string(), high: v.string() }))` -- to properly model the "between" case.

---

## 2. `filterOperatorValidation.ts` -- Operator/FieldType Mapping

### Invariants Identified
- Each FieldType maps to exactly one set of valid operators
- Operator-FieldType compatibility is a total function (every FieldType has a mapping)
- The mapping is immutable (const object)

### Ratings
- **Encapsulation**: 8/10
  `OPERATOR_MAP` is module-private. Access is only through the two exported functions. Clean.

- **Invariant Expression**: 5/10
  The mapping is a plain `Record<FieldType, readonly FilterOperator[]>`. TypeScript cannot verify that the arrays contain only operators that "make sense" for each type -- this is purely a human convention. More critically, the `Record` type guarantees exhaustiveness at compile time (all 14 field types must have keys), which is excellent.

- **Invariant Usefulness**: 9/10
  This is a critical business rule. Preventing invalid operator/field-type pairings avoids corrupt filter state. High impact.

- **Invariant Enforcement**: 6/10
  The `?? []` fallback on line 32 silently returns empty for unknown field types rather than throwing. Since `Record<FieldType, ...>` guarantees all keys exist, this fallback is unreachable for valid FieldTypes, but it masks potential bugs if the type system is bypassed. The `includes` cast to `readonly string[]` on line 42 is a code smell -- it works but loses type safety.

### Strengths
- Exhaustive `Record` ensures every new FieldType added to the union forces a compile error until a mapping is provided
- Pure functions with no side effects -- easy to test
- Clean separation of validation logic from mutation handlers

### Concerns
1. **`?? []` is defensive but misleading.** If the type system is sound, this branch is dead code. If the type system is bypassed (e.g., from JS), silently returning "no valid operators" is worse than throwing.
2. **The `as readonly string[]` cast** defeats the purpose of having typed operators. A safer approach: use a `Set` or a generic helper that preserves types.
3. **No inverse lookup.** There is no way to ask "which field types support operator X?" This could be useful for UI rendering.

### Recommended Improvements
- Replace `?? []` with an explicit exhaustiveness check or assertion.
- Replace the `includes` cast with a typed helper, e.g.:
  ```ts
  function includes<T>(arr: readonly T[], item: T): boolean {
    return (arr as readonly unknown[]).includes(item);
  }
  ```
- Consider deriving the operator union per field-type category as a mapped type for stronger compile-time guarantees on the map's values.

---

## 3. `viewDefs.ts` -- View Definition CRUD

### Invariants Identified
- Every viewDef belongs to an org (orgId from auth context)
- Kanban views MUST have a boundFieldId with kanban capability
- Calendar views MUST have a boundFieldId with calendar capability
- Table views do NOT require a boundFieldId
- Default views cannot be deleted
- Duplicated views are never default
- Creating a kanban view auto-populates groups from field options + a `__no_value__` sentinel
- viewFields are auto-populated from active fieldDefs on creation

### Ratings
- **Encapsulation**: 5/10
  The `viewDefs` schema allows `boundFieldId` to be optional regardless of `viewType`. The invariant "kanban/calendar requires boundFieldId" is enforced ONLY in mutation handlers, not in the schema. A direct DB insert could violate this.

- **Invariant Expression**: 4/10
  **This is the weakest area.** The schema type `{ viewType: "table" | "kanban" | "calendar", boundFieldId?: Id<"fieldDefs"> }` does not express the conditional requirement. A discriminated union at the schema level would be ideal:
  - `{ viewType: "table", boundFieldId: undefined }`
  - `{ viewType: "kanban", boundFieldId: Id<"fieldDefs"> }`
  - `{ viewType: "calendar", boundFieldId: Id<"fieldDefs"> }`

  Convex schema limitations may prevent this, but the TypeScript types used in handler logic should still reflect it.

- **Invariant Usefulness**: 9/10
  All identified invariants are critical business rules. Default view protection, capability validation, and auto-population are all high-value.

- **Invariant Enforcement**: 7/10
  Runtime enforcement is thorough -- every mutation checks org ownership, validates capabilities, protects defaults. The gap is that nothing prevents a future developer from inserting a kanban viewDef without a boundFieldId via a new mutation that skips the validation.

### Strengths
- Consistent org-scoping pattern across all CRUD operations
- Capability validation via fieldCapabilities table is well-designed
- Cascade delete is complete (viewFields, viewFilters, viewKanbanGroups)
- Audit logging on every mutation with appropriate severity levels
- Duplicate view correctly resets `isDefault` to false

### Concerns
1. **Conditional requirement not encoded in types.** `boundFieldId` is `v.optional()` in both the schema and the `createView` input, but the handler throws if it is missing for kanban/calendar. The input validator should use a discriminated union.
2. **`__no_value__` sentinel is a magic string.** It should be a named constant exported from a shared location.
3. **Massive code duplication in capability validation.** The kanban and calendar capability checks in both `createView` and `updateView` are nearly identical. This should be extracted to a shared helper like `assertFieldHasCapability(ctx, objectDefId, fieldDefId, capability)`.
4. **`updateView` patch type is `Record<string, string | number>`.** This loses type safety. It should use `Partial<Doc<"viewDefs">>` or at minimum a typed interface.
5. **No name uniqueness check.** Two views on the same objectDef can have the same name.
6. **No validation that `boundFieldId` belongs to the same objectDef** in `createView`. The capability query filters by objectDefId and fieldDefId, which implicitly validates this, but the intent is not obvious.

### Recommended Improvements
- Extract a `validateBoundField(ctx, objectDefId, fieldDefId, capability)` helper to eliminate duplication between create/update.
- Extract `__no_value__` to a constant: `export const NO_VALUE_SENTINEL = "__no_value__" as const;`
- Use discriminated union for `createView` input:
  ```ts
  v.union(
    v.object({ viewType: v.literal("table"), objectDefId: v.id("objectDefs"), name: v.string() }),
    v.object({ viewType: v.literal("kanban"), objectDefId: v.id("objectDefs"), name: v.string(), boundFieldId: v.id("fieldDefs") }),
    v.object({ viewType: v.literal("calendar"), objectDefId: v.id("objectDefs"), name: v.string(), boundFieldId: v.id("fieldDefs") }),
  )
  ```
- Type the `patch` object properly instead of using `Record<string, string | number>`.

---

## 4. `viewFields.ts` -- View Field Operations

### Invariants Identified
- A viewField connects exactly one viewDef to one fieldDef
- displayOrder is contiguous and zero-based
- No duplicate fieldDefIds in a reorder operation
- Width must be a number (no min/max constraints)
- Visibility toggle is idempotent (creates viewField if missing)

### Ratings
- **Encapsulation**: 6/10
  The viewFields table has no org-level scoping of its own -- it relies on the parent viewDef for org checks. This is acceptable for a child entity but means queries must always load the parent first.

- **Invariant Expression**: 5/10
  No uniqueness constraint on (viewDefId, fieldDefId) at the schema level. The `setViewFieldVisibility` handler does a query-then-insert, which is susceptible to race conditions. displayOrder is just `v.number()` -- no constraint that it is non-negative or unique within a view.

- **Invariant Usefulness**: 7/10
  The duplicate check in `reorderViewFields` is valuable. The auto-creation in `setViewFieldVisibility` is pragmatic.

- **Invariant Enforcement**: 5/10
  `reorderViewFields` validates no duplicates in the input array but does NOT validate that the input array contains ALL fields for the view. Fields not in the array silently retain their old displayOrder, potentially creating gaps or collisions. `setViewFieldWidth` has no min/max bounds on width.

### Strengths
- Org verification through parent viewDef is consistent
- Reorder validates duplicate input
- Visibility toggle handles both existing and new viewFields

### Concerns
1. **`reorderViewFields` allows partial reordering.** If the caller passes 3 of 10 fieldIds, only those 3 get updated. The other 7 retain their old displayOrder values, potentially creating duplicates (e.g., two fields with displayOrder=0).
2. **No uniqueness constraint on (viewDefId, fieldDefId).** A race condition in `setViewFieldVisibility` could insert duplicates.
3. **`width` has no validation.** Negative or zero widths are accepted. Consider `v.number()` with a runtime check for `width > 0`.
4. **`reorderViewFields` silently ignores fieldIds that don't have a corresponding viewField** (the `if (vf)` check on line 126). This should probably be an error.

### Recommended Improvements
- Add a completeness check to `reorderViewFields`: `if (args.fieldIds.length !== viewFields.length) throw ...`
- Add width bounds validation: `if (args.width <= 0) throw ...`
- Consider adding a unique index on (viewDefId, fieldDefId) to viewFields if Convex supports it, or add a pre-insert uniqueness check.

---

## 5. `viewFilters.ts` -- View Filter Operations

### Invariants Identified
- A filter's operator must be valid for its field's type
- A filter's fieldDef must belong to the same objectDef as the view
- Operator changes are re-validated against field type
- Org ownership is verified through parent viewDef chain

### Ratings
- **Encapsulation**: 7/10
  Good separation -- validation logic is imported from `filterOperatorValidation.ts`, not reimplemented. Org checks delegate through the viewDef parent.

- **Invariant Expression**: 5/10
  The `value` field is `v.optional(v.string())` -- a single string regardless of operator. For `between`, two values are needed. For `is_true`/`is_false`, no value is needed but the schema allows one. For `is_any_of`, multiple values are needed but packed into one string. The type does not discriminate based on operator.

- **Invariant Usefulness**: 8/10
  Operator-fieldtype validation is genuinely high value. Cross-object field validation prevents broken filters.

- **Invariant Enforcement**: 6/10
  Operator validation is solid. However:
  - No validation that `value` is appropriate for the operator (e.g., "between" needs two values)
  - `updateViewFilter` builds a `Record<string, string>` patch -- loses type safety
  - No validation that the value is parseable for the field type (e.g., numeric string for number fields)

### Strengths
- Cross-object validation (filter field must match view's object)
- Operator re-validation on update
- Clean audit trail with before/after diffs

### Concerns
1. **`value: v.optional(v.string())` is too loose.** It should be a discriminated union based on operator type, or at minimum validated at runtime.
2. **`updateViewFilter` patch is typed as `Record<string, string>`.** This means `logicalOperator` and `operator` are typed as plain strings internally, losing the union type safety.
3. **No value-format validation.** A numeric field with operator "gt" accepts value "hello" -- the invalid value is stored and will fail silently at query-execution time.
4. **`logicalOperator` is per-filter, not per-filter-group.** This means filter N's `logicalOperator` defines how it connects to filter N-1, but there is no constraint ensuring the first filter has no logical operator, or that subsequent filters always have one.

### Recommended Improvements
- Add value validation per operator category (at minimum: "between" requires parseable range, boolean operators require no value, numeric operators require parseable number).
- Type the patch object properly.
- Consider whether `logicalOperator` should be a property of the view (defining the default conjunction) rather than per-filter, or add a positional constraint.

---

## 6. `viewKanbanGroups.ts` -- Kanban Group Operations

### Invariants Identified
- Kanban groups can only be reordered on kanban views
- All groupIds in a reorder must belong to the target view
- No duplicate groupIds in reorder input
- isCollapsed is toggled (not set to arbitrary value)

### Ratings
- **Encapsulation**: 7/10
  Clean module boundary. Org verification through parent. Toggle is atomic.

- **Invariant Expression**: 6/10
  The schema does not express that kanban groups should only exist for kanban views. A viewKanbanGroup referencing a table or calendar viewDef is representable.

- **Invariant Usefulness**: 8/10
  ViewType check on reorder prevents misuse. Ownership validation prevents cross-view contamination.

- **Invariant Enforcement**: 7/10
  Reorder validates: (1) view is kanban, (2) no duplicates, (3) all IDs belong to the view. This is the most thorough validation of all the child entity files.

### Strengths
- **Best validation of all child entity files** -- reorder checks view type, duplicates, AND ownership
- Toggle is simple and race-condition-resistant (read-then-invert is atomic in Convex mutations)
- Clean audit logging

### Concerns
1. **`reorderKanbanGroups` does not require completeness** -- same issue as `reorderViewFields`. Partial reorder can create displayOrder collisions.
2. **No operation to add/remove individual kanban groups** post-creation. If field options change, the groups become stale. The `needsRepair` flag on viewDefs hints at a repair mechanism, but it is not implemented here.
3. **`optionValue` is a plain string** with no validation against the field's actual options (except during auto-creation). After creation, drift is possible.

### Recommended Improvements
- Add completeness check: require all group IDs for the view to be present in the reorder array.
- Consider a `syncKanbanGroups` mutation that reconciles groups with the current field options (adding missing, flagging removed).
- Add a comment or TODO about the `needsRepair` lifecycle.

---

## Cross-Cutting Scores Summary

| Dimension | validators | filterOpValidation | viewDefs | viewFields | viewFilters | viewKanbanGroups | **Avg** |
|---|---|---|---|---|---|---|---|
| Encapsulation | 7 | 8 | 5 | 6 | 7 | 7 | **6.7** |
| Invariant Expression | 6 | 5 | 4 | 5 | 5 | 6 | **5.2** |
| Invariant Usefulness | 7 | 9 | 9 | 7 | 8 | 8 | **8.0** |
| Invariant Enforcement | 6 | 6 | 7 | 5 | 6 | 7 | **6.2** |

**Overall**: 6.5/10 -- The business logic is sound and the invariants are useful, but the type system is significantly underused. Too many invariants are enforced only at runtime when the type system could carry more weight.

---

## Top 5 Highest-Impact Improvements (Ordered by ROI)

1. **Discriminated union for createView input** -- Eliminates the "kanban without boundFieldId" class of bugs at the type level. Low effort, high signal.

2. **Extract `validateBoundField` helper** -- Removes ~40 lines of duplication between createView and updateView. Reduces bug surface if the validation logic needs to change.

3. **Extract `__no_value__` to a named constant** -- One magic string used in two places today, will spread. Five-second fix.

4. **Completeness check on reorder mutations** -- Both `reorderViewFields` and `reorderKanbanGroups` allow partial input that silently corrupts displayOrder. Add `if (input.length !== existing.length) throw`.

5. **Type the patch objects properly** -- `Record<string, string | number>` in updateView and `Record<string, string>` in updateViewFilter throw away all type safety. Use a properly typed partial.
