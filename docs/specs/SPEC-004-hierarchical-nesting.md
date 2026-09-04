# Spec: Hierarchical nesting and collapse

**ID:** SPEC-004  
**Status:** Draft  
**Last Updated:** 2026-09-04 (rev 2 — post-review)  
**Depends On:** SPEC-003

## Overview

Architecture is drawn at more than one altitude. A service sits inside a subsystem, which sits inside
a platform, and the useful diagram is rarely all of them at once. This spec makes a node able to
contain other nodes to any depth, and to **collapse** — hiding everything inside it and standing in
for the whole subtree as a single box, then expanding again to reveal it.

This is the one feature the predecessor's handoff calls "the core feature worth preserving," and the
mechanic it calls the riskiest. It is what turns a canvas into a tool for explaining a system: the
same drawing reads as an overview or as a detail view depending on what is folded shut.

## Scope

### In Scope

- Any `diagramNode` can contain other nodes, to arbitrary depth
- Dragging a node onto a node makes it a child; dragging it out returns it to the page
- Collapse and expand, hiding and revealing the whole subtree
- Nesting and collapse state synced between clients and surviving reload
- Moving or deleting a container carries its descendants

### Out of Scope

- **Connections between nodes, and merging them on collapse.** The handoff's full description of this
  feature includes collapsed containers absorbing their children's edges into deduplicated lines.
  There are no connections yet — they are SPEC-005 — so that half is **SPEC-006**, specified once
  connections exist rather than against a guess. This spec's collapse hides children and nothing more.
- **Auto-layout of children inside a container.** Children keep the positions the user gave them.
- **A hierarchy tree panel.** The predecessor had one; it is a view onto this data, not this data.
- **Frames, narration, or lenses** — later specs.
- **Visual polish on the collapsed state** beyond a legible descendant count.

---

## Functional Requirements

### FR-001: A node can contain other nodes

#### Description:

Containment uses tldraw's own `parentId`, not a parallel model. A shape parented to another shape is
its child; `editor.getShapeAndDescendantIds` already walks the tree. This is what makes nesting
store-native — and therefore synced — without inventing anything to sync.

#### Acceptance Criteria:

- [ ] A `diagramNode` may be the parent of other `diagramNode`s, asserted via
      `editor.getSortedChildIdsForParent`
- [ ] Nesting works to at least three levels, and `getShapeAndDescendantIds` on the outermost returns
      every descendant
- [ ] A node's children render inside it, positioned relative to it: moving the parent moves the
      children with it, and their page coordinates change accordingly
- [ ] SPEC-003's `e2e/custom-shape.spec.ts` still passes **unmodified** — the leaf case is unchanged

### FR-002: Dragging reparents

#### Description:

Dragging a node over another node makes it a child on drop; dragging it off returns it to the page.

Three pieces, not one. **`canReceiveNewChildrenOfType` defaults to `false`**, and the drag-and-drop
manager filters candidates through it *before* calling anything — so with the default,
`onDragShapesOver` never fires and dragging silently does nothing. This is the same trap as
`canEdit()` in SPEC-003. Opening that gate also buys the drop indication: the same code path calls
`editor.setHintingShapes`, which the indicator overlay strokes automatically.

Returning to the page on drag-out is **not** automatic — `BaseBoxShapeUtil` has no implementation, so
`onDragShapesOut` must reparent to the current page itself.

#### Acceptance Criteria:

- [ ] `canReceiveNewChildrenOfType` returns true for `diagramNode`, asserted directly — without it
      every criterion below fails silently rather than visibly
- [ ] Dragging node A onto node B and releasing sets A's `parentId` to B
- [ ] Dragging A out of B and releasing on empty canvas sets A's `parentId` back to the page
- [ ] The drop target is added to `editor.getHintingShapeIds()` while a shape is dragged over it, so
      the user can tell containment is about to happen
- [ ] A node **cannot** become its own ancestor. The drag path is already safe — the editor excludes
      the dragged shapes' descendants from candidate targets — so this is asserted against the
      **programmatic** path, and the guard runs **before** `reparentShapes`, which throws rather than
      no-ops on a self-parent
- [ ] Reparenting preserves the node's on-screen page position. `reparentShapes` already converts
      transforms into the new parent's space, so this is a **regression test over framework
      behaviour**, not work this spec performs
- [ ] Dropping a node onto a **collapsed** container is refused, leaving the node on the page. A drop
      that succeeds would make the node vanish the instant it lands, which reads as data loss

### FR-003: Collapse hides the subtree

#### Description:

A container can be collapsed. Its descendants stop rendering and stop being interactive; the
container itself remains, showing that it stands for a subtree. Visibility is **derived** from a
`collapsed` prop through `getShapeVisibility`, not stored per-child — a second place to record the
same fact is a second place for it to be wrong.

#### Acceptance Criteria:

- [ ] A container with `collapsed: true` renders, and none of its descendants render at any depth
- [ ] `editor.isShapeHidden` returns true for every descendant of a collapsed container
- [ ] A hidden descendant cannot be selected by clicking where it would be — `getShapeAtPoint`
      already skips hidden shapes
- [ ] A hidden descendant cannot end up **selected** by any path, including a marquee. Hiding alone
      does not guarantee this: brushing filters hidden shapes only on its fast path, and falls back
      to an unfiltered list once the viewport has changed (which edge-scrolling during a marquee
      does). The mechanism is named rather than assumed — a store side effect that strips hidden ids
      from `selectedShapeIds` — and the test drives the **slow** path deliberately
- [ ] A collapsed container displays the number of descendants it is standing for
- [ ] Expanding restores every descendant, at the positions they held before the collapse
- [ ] Collapsing a container that is itself inside a collapsed container is a no-op visually, and
      expanding the outer one leaves the inner one still collapsed — collapse state is per-node and
      independent

### FR-004: Collapse is reachable by a user

#### Description:

FR-003 specifies what collapse *does* to the document; nothing yet says how a person performs it. On
the target device that is not a detail: `architecture.md` → Known Constraints puts an iPad with a
pencil first, where a small control is unusable and a keyboard shortcut does not exist.

#### Acceptance Criteria:

- [ ] A container with at least one child shows a collapse control on the shape itself; a node with no
      children shows none, since there is nothing to fold
- [ ] Tapping the control collapses the container, and tapping it again expands it
- [ ] The control's hit target is at least 44x44 CSS pixels, the minimum comfortable pencil/finger
      target, verified in an e2e assertion on its bounding box rather than by eye
- [ ] The control is reachable by keyboard and carries an accessible name reflecting its state
      (expanded vs collapsed)
- [ ] Activating the control does not also select, move or enter label-editing on the node

### FR-005: Nesting and collapse are synced and durable

#### Description:

Both facts live in the tldraw store — `parentId` natively, `collapsed` as a shape prop — so both sync
and persist by the same path SPEC-002 and SPEC-003 established. The `collapsed` prop is added to
`diagramNode` by a migration, since rooms already hold records without it.

#### Acceptance Criteria:

- [ ] Reparenting in one client is reflected in another client's `parentId` for that shape
- [ ] Collapsing in one client hides the subtree in the other
- [ ] A v2 record (no `collapsed`) is migrated to v3 with `collapsed: false`, asserted in a unit test
- [ ] **The dev-only seeding route and the fixture SPEC-003 specified but never built are built here**
      (`docs/spec-delivery/SPEC-003-first-custom-shape.md` → *Owed*): a checked-in pre-migration room
      snapshot, and a development-only worker route that seeds it into a room's durable storage. A
      room seeded at the older version opens with its shapes intact and the new prop defaulted —
      settling SPEC-003's owed criterion as well as this one
- [ ] Nesting and collapse survive a reload, asserted against **durable storage content**, not a
      count. `debugStoredSnapshot` currently returns `{present, documents}`; a document count is
      identical whether or not `parentId` and `collapsed` were written, so the probe is extended to
      report those fields for a named shape and the assertion names them
- [ ] The client and worker migration sequence versions for `diagramNode` match, by the check
      SPEC-003 established

### FR-006: Container operations carry the subtree

#### Description:

A container is a handle on everything inside it. The operations that would otherwise orphan children
must take them along.

**These are regression tests over framework behaviour, not work this spec performs.** tldraw's
`deleteShapes` walks descendants, `duplicateShapes` reparents copies to copies, undo is store-level,
and a box resize touches only `w`/`h`. They are worth having — but a green FR-006 is not evidence
that this spec's nesting code is correct, and a reviewer should not read it as such.

#### Acceptance Criteria:

- [ ] Deleting a container deletes every descendant; no orphaned shape is left on the page
- [ ] Deleting a **collapsed** container does the same — the descendants are hidden, not absent
- [ ] Duplicating a container duplicates its descendants, and the copies are parented to the copy
- [ ] Undo after deleting a container restores the container and every descendant
- [ ] Resizing a container does not resize its children

---

## Data Model

```ts
// src/shared/shapes/node.ts — extended, not replaced

interface NodeShapeProps {
  w: number
  h: number
  label: string
  color: string
  /** Added at v3. Descendants are hidden while true. */
  collapsed: boolean
}

// v2 -> v3. Rooms already hold v2 records, so this is migration-bearing.
const nodeVersions = createShapePropsMigrationIds('diagramNode', {
  AddColor: 1,
  AddCollapsed: 2,
})
```

Nothing records the parent/child relationship: that is tldraw's `parentId`. Nothing records which
shapes are hidden: that is derived from the nearest collapsed ancestor.

---

## API / Interface Contract

```ts
// src/shared/shapes/hierarchy.ts — pure, runtime-agnostic, unit-testable
// Ported in spirit from the predecessor's engine/ancestry.ts, reimplemented
// over tldraw records rather than lifted.

/** The nearest ancestor that is collapsed, or null when nothing hides this shape. */
function collapsedAncestorOf(shape: TLShape, getParent: (id) => TLShape | undefined): TLShape | null

/** True when any ancestor is collapsed. Drives getShapeVisibility. */
function isHiddenByCollapse(shape, getParent): boolean

// src/client — wiring. MODULE-LEVEL constant, never an inline arrow: this prop
// sits in the dependency list of the effect that CONSTRUCTS the editor, so a new
// function identity per render tears the editor down and rebuilds it, losing
// camera, selection and mounted state. Room.tsx re-renders on connection status.
const getShapeVisibility = (shape: TLShape, editor: Editor) =>
  isHiddenByCollapse(shape, (id) => editor.getShape(id)) ? 'hidden' : 'inherit'

<Tldraw getShapeVisibility={getShapeVisibility} />
```

`'inherit'` matters: returning `'visible'` for a shape would override a collapsed ancestor and leak a
grandchild back onto the canvas.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/shapes/
│   ├── node.ts                 # + collapsed prop, + AddCollapsed migration
│   ├── hierarchy.ts            # collapsedAncestorOf, isHiddenByCollapse
│   └── hierarchy.test.ts
├── client/
│   ├── Room.tsx                # + module-level getShapeVisibility
│   ├── selection.ts            # side effect stripping hidden ids from selection
│   └── shapes/
│       └── NodeShapeUtil.tsx   # + canReceiveNewChildrenOfType, onDragShapesOver/Out,
│                               #   collapse control, descendant count
└── worker/
    └── devOnlyRoutes.ts        # seeds a pre-migration snapshot; development builds only
e2e/
├── nesting.spec.ts
└── fixtures/
    └── room-pre-migration.json   # a room persisted before the new prop existed
```

## Implementation Phases

### Phase 1: The model
- Add `collapsed` + the v3 migration to the shared definition
- Write `hierarchy.ts` and its unit tests, including the cycle case from FR-002

### Phase 2: Containment
- `canReceiveNewChildrenOfType` first — nothing else in FR-002 fires without it
- `onDragShapesOver` / `onDragShapesOut`, the explicit reparent-to-page on drag-out, the
  programmatic cycle guard, and the refusal to drop into a collapsed container

### Phase 3: Collapse
- Module-level `getShapeVisibility`, the collapse control (FR-004's hit target and a11y), the
  descendant count, and the selection side effect from FR-003
- The independence case from FR-003's last criterion

### Phase 4: Proof
- Extend `debugStoredSnapshot` to report a named shape's `parentId` and `collapsed`
- Build the dev-only seeding route and the pre-migration fixture; settle SPEC-003's owed criterion
- Two-client sync of nesting and collapse; the delete/duplicate/undo cases from FR-006
