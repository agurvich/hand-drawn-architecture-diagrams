# Completed Spec — SPEC-004: Hierarchical nesting and collapse

## What was completed?

- **Nesting is tldraw's `parentId`.** No parallel model, so it syncs and persists with nothing added.
- **`src/shared/shapes/hierarchy.ts`** — the rules as pure functions with injected accessors:
  `collapsedAncestorOf` (nearest, not outermost), `isHiddenByCollapse`, `wouldCreateCycle`,
  `descendantCount`. No `tldraw` import, so it stays inside the shared-module allowlist and is
  unit-testable without an Editor.
- **`collapsed` prop + `AddCollapsed` migration** on `diagramNode`, defaulting to expanded.
- **`getShapeVisibility`** as a module-level constant; collapse hides the whole subtree at any depth.
- **A collapse control on the shape** — 44×44, `aria-expanded`, keyboard-activatable — plus a
  descendant count on the collapsed container.
- **`src/client/selection.ts`** — a `beforeChange` side effect keeping hidden shapes out of the
  selection.
- **The dev-only seeding route and pre-migration fixture SPEC-003 owed**, settling that criterion.

### Deliberate deviations

- **The reparent hook is `onDragShapesIn`, not `onDragShapesOver`** — the spec named the wrong one.
  `onDragShapesOver` fires on every cursor move and is not gated by `canReceiveNewChildrenOfType`, so
  reparenting there runs once per pointer frame, churning the store and spamming sync. Found by the
  plan review, in code that had already been written. The spec's FR-002 description was corrected in
  place, since it was a factual claim rather than a preference.
- **`onDragShapesOut` is guarded on `info.nextDraggingOverShapeId`.** Without it, dragging straight
  from one container into another reparents to the page mid-gesture.
- **The collapsed-drop refusal lives in `canReceiveNewChildrenOfType`**, not in the reparent hook —
  that is what the drag manager filters through, so one method carries accepting children, the drop
  hint, and the refusal.
- **`wouldCreateCycle` is not used on the drag path.** The editor's `hasAncestor` covers it there;
  the pure helper remains for the programmatic path and is unit-tested.
- **FR-006 is a regression suite over framework behaviour** — tldraw already deletes, duplicates and
  undoes subtrees. A green FR-006 is not evidence this spec's code is correct.

## What changed from earlier specs?

- `src/client/devOnly.ts`'s permissive schema now **derives** its prop names from `nodeShapeProps`
  instead of a hand-written list. The literal list went stale the moment `collapsed` was added, and
  surfaced as `Unexpected property` in a test about a different subject.
- `debugStoredSnapshot` takes an optional `label` and reports that shape's `parentId` and `collapsed`.
  A document *count* is identical whether or not those fields were written, so the count-only probe
  would have let "nesting survives a reload" tick vacuously.
- `e2e/helpers.ts` gained `addNode` / `setCollapsed`. `custom-shape.spec.ts` keeps its own local copy
  deliberately: SPEC-004 FR-001 requires that file to pass **unmodified**.

## Verification

typecheck 0 · oxlint 0 · prettier 0 · unit 44/44 · e2e 41/41 · spec-lint 0 · docs-lint ok.

Two things were checked by driving rather than reading: a **real pointer drag** nests a node and
drags it back out (the other FR-002 tests call the hooks directly, which says nothing about whether
they are wired), and the 44×44 assertion pins the camera to z=1 first, since `boundingBox()` measures
after the canvas transform.

Not covered: edge merging on collapse — there are no connections yet. That is its own spec after
SPEC-005.
