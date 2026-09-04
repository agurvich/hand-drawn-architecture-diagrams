# Spec: Merging connections into a collapsed container

**ID:** SPEC-006  
**Status:** Draft  
**Last Updated:** 2026-09-04 (rev 2 — post-review)  
**Depends On:** SPEC-004, SPEC-005

## Overview

Collapsing a container currently hides everything inside it, including the connections that crossed
its boundary — so a subsystem folds away and takes its relationships with it. That is backwards. The
reason to collapse a container is to see the system at a coarser grain, and at a coarser grain the
container *is* the thing at the end of those connections.

This spec makes a collapsed container stand in for its contents: a connection to a hidden node is
re-drawn against the container that hides it, connections that become the same coarse relationship
merge into one line, and connections that turn out to be entirely internal to the collapsed container
disappear. Expanding puts everything back exactly as it was, because nothing was ever changed —
the merged view is derived from the same records, not written into them.

This is the mechanic the predecessor's handoff calls the core feature, and the last piece of it.

## Scope

### In Scope

- Resolving a connection endpoint to the collapsed container standing in for it
- Suppressing connections that are wholly internal to a collapsed container
- Merging several connections that resolve to the same ordered pair into one drawn line, with a count
- Doing all of the above as **derivation** — no records created, changed or deleted on collapse
- Two clients deriving the identical merged view from the same records, without coordinating
- **Endpoint re-aiming, owed by SPEC-005.** FR-005 below is SPEC-005 FR-004, which that spec marked
  Completed without building: `getHandles` ships, but no `onHandleDrag` handler exists and
  `updateBinding` appears nowhere in `src/client`, so dragging an endpoint does nothing. It is picked
  up here rather than in a spec of its own because FR-006 withdraws exactly this affordance while a
  line is merged, and specifying the withdrawal of something that does not exist is not meaningful.
  The debt is also recorded against `docs/spec-delivery/SPEC-005-connections.md`.

### Out of Scope

- **Editing the diagram through a merged line.** A line standing for three connections is a view of
  three records, and re-aiming or deleting it can only act on one of them. FR-006 removes the
  endpoint handles while a line is merged; **deleting one is not blocked**, and deletes exactly the
  one connection it is, after which the remaining two re-merge behind a new representative. A
  "delete all connections this line stands for" affordance is a product question to answer after use.
- **Labels on the merged line beyond the count.** The predecessor accumulated each raw edge's label
  into the merged one; connections here have no label prop at all (SPEC-005 → Out of Scope), so there
  is nothing to accumulate. The seam is the same accumulator either way.
- **Edge sets.** The predecessor filtered by active set *before* merging. Deferred whole
  (`architecture.md` → Deferred / Non-goals); merging is specified over all connections.
- **Routing, bundling or offsetting parallel merged lines.** Two merged lines between the same pair
  in opposite directions are two straight lines, as they are today.
- **Auto-collapse, auto-expand, or any change to how collapse is toggled.** SPEC-004 owns that.
- **Changing what a *node* does on collapse.** Nodes still hide by ancestry, unchanged.

---

## Functional Requirements

### FR-001: An endpoint resolves to the container standing in for it

#### Description:

A connection bound to a node hidden by collapse is drawn against the collapsed container that hides
it, instead of being hidden itself. The stand-in is the **outermost** collapsed ancestor, not the
nearest: with a collapsed container inside another collapsed container, only the outer one is on
screen, and a line drawn to the inner one would be a line to something invisible.

**This supersedes SPEC-005 FR-003's last acceptance criterion** ("a connection whose endpoint is
hidden by collapse is itself hidden"), which that spec shipped deliberately as the safe placeholder
until this one existed. The supersession is not only prose: the assertion is live in
`e2e/connections.spec.ts` under *SPEC-005 FR-003*, and this spec **rewrites that test** rather than
leaving the implementer to meet a red suite and decide alone. A superseded marker is added to
SPEC-005 FR-003 and to its delivery doc in the same change.

#### Acceptance Criteria:

- [ ] With node X inside collapsed container P, and a connection X → Y where Y is outside P, one line
      is drawn between **P's border** and Y's border, asserted on rendered geometry — not on the
      connection merely still being visible
- [ ] Expanding P returns the line to X's border, and the connection's own props are unchanged
      throughout — the SPEC-005 fence that anchors are derived, never stored, still holds here
- [ ] With P collapsed *and* containing a collapsed Q which contains X, the line is drawn against
      **P**, the outermost collapsed ancestor. Asserted directly, because resolving to the nearest
      collapsed ancestor instead produces a line to a shape that is itself hidden, and every other
      criterion in this spec passes either way
- [ ] Both endpoints hidden by *different* collapsed containers produces one line between the two
      containers
- [ ] Moving a collapsed container re-routes the lines resolved onto it — the SPEC-005 criterion,
      re-asserted here because resolution introduces a new place it can be lost (see the Interface
      Contract's fence on what the index may hold)
- [ ] A connection with no endpoint hidden by collapse is drawn exactly as it is today
- [ ] The superseded assertion in `e2e/connections.spec.ts` is **replaced**, not deleted — the same
      arrangement now asserts the new behaviour, so the case stays covered

### FR-002: A connection internal to a collapsed container disappears

#### Description:

When both endpoints resolve to the same container, the connection is a relationship *inside* the
box, and the box is closed. It hides.

#### Acceptance Criteria:

- [ ] With X and Y both inside collapsed P, a connection X → Y is hidden
- [ ] Expanding P restores it
- [ ] A connection X → P, where X is inside P and **P is expanded**, stays visible and keeps SPEC-005
      FR-002's containment anchoring. The predecessor skipped this case for want of a sensible
      anchor; SPEC-005 built one and tests it, so the skip is **not** ported — and it is unnecessary,
      because after resolution one endpoint can only be a strict ancestor of the other when that
      ancestor is expanded (if it were collapsed, both would resolve to the same outermost container
      and FR-002's first criterion would already have hidden the line)
- [ ] A connection whose endpoint node is deleted while the container is collapsed still disappears
      entirely, rather than leaving a line drawn against the container — SPEC-005 FR-005's delete
      path is unchanged by resolution

### FR-003: Connections that become the same relationship merge

#### Description:

Three connections from three different children of P out to Y all become "P talks to Y" once P
collapses. Drawing three overlapping lines says nothing that one line does not, so they merge into
one, which reports how many it stands for.

#### Acceptance Criteria:

- [ ] Three connections from distinct children of collapsed P to the same outside node Y render as
      **one** visible line
- [ ] That line displays the count it stands for, and the count is 3 in the case above
- [ ] A line standing for exactly one connection displays **no** count — the count is information
      about merging, not decoration
- [ ] Direction is part of the identity: X → Y and Y → X resolving to the same pair of containers
      produce **two** lines, not one. Asserted on the set of **unhidden connection shape ids**, not on
      pixels: with parallel-line offsetting out of scope the two lines are coincident on screen
- [ ] Expanding P restores all three lines, each against its own child
- [ ] Two connections between the same pair of *visible* nodes do **not** merge — merging is a
      consequence of collapse, and this spec does not change what an expanded diagram looks like

### FR-004: The merged view is derived, never materialized

#### Description:

The tempting implementation is to create a merged connection record when a container collapses and
delete it on expand. Under sync that is a defect: two clients collapsing the same container both
write, and the room ends up with duplicate merged records that no expand deletes. The merged view is
a pure function of records that already exist, so it is computed on each client instead of written.

This is a new architectural decision and gets a full `decisions.md` entry at completion, per the
ritual in `CLAUDE.md` → *On spec completion*.

#### Acceptance Criteria:

- [ ] Collapsing and expanding a container creates and deletes **zero** records: the full set of
      shape ids and binding ids in the store is identical before collapse, while collapsed, and after
      expanding, asserted by enumerating the whole set rather than comparing counts
- [ ] `debugStoredSnapshot` is **extended to report every stored shape's `type`** — it currently
      reports one shape found by `props.label` plus the binding list, which cannot express this
      criterion — and the snapshot taken while a container is collapsed contains no shape type other
      than `diagramNode` and `diagramConnection`, and no more `diagramConnection` records than were
      drawn
- [ ] Two clients in one room, one of which collapses P, both derive the **same representative** —
      the merged line in each client is the same connection shape id. Asserted across clients,
      because a non-deterministic choice is invisible in a single client and produces two different
      pictures of one room
- [ ] After client A sets `collapsed: true` on P and nothing else crosses the wire, client B renders
      one line between P and Y showing a count of 3, from the collapse record alone

### FR-005: An endpoint can be re-aimed (owed from SPEC-005 FR-004)

#### Description:

A connection is wrong more often than it is missing. Dragging an endpoint onto a different node
re-binds it, without deleting and redrawing. SPEC-005 specified this and shipped the handles without
the handler; this builds it. The criteria are SPEC-005 FR-004's, unchanged in substance.

#### Acceptance Criteria:

- [ ] Dragging the source endpoint onto node C re-binds the source to C; the connection's shape id is
      unchanged, and exactly two `connectionEndpoint` bindings still exist for it
- [ ] The same for the target endpoint
- [ ] Dropping an endpoint on empty canvas leaves the binding as it was, rather than orphaning the
      connection
- [ ] Dropping an endpoint on the connection's *other* endpoint node is refused — a self-connection
      is not created by the back door
- [ ] The node under a dragged endpoint is hinted, so the user can see what it will attach to
- [ ] Re-aiming an endpoint onto a node inside a **collapsed** container binds to that node and the
      line immediately resolves onto the container, per FR-001 — the two features meet here, and the
      binding records what was dropped on rather than what is drawn

### FR-006: A merged line is not edited as though it were one connection

#### Description:

Re-aiming a line that stands for three connections would silently rebind one arbitrary member of the
three. Rather than pick, the affordance FR-005 builds is withdrawn while the line is merged.

#### Acceptance Criteria:

- [ ] A line standing for more than one connection offers **no** endpoint handles
- [ ] A line standing for exactly one connection — including one that has been resolved onto a
      collapsed container — keeps its handles and can still be re-aimed per FR-005
- [ ] Deleting a merged line deletes exactly the one connection it is; the remaining connections
      re-merge, a line is still drawn, and its count has dropped by one. This is the documented
      consequence of the Out of Scope decision above, asserted so it is a known behaviour rather than
      a discovered one
- [ ] Undo after that delete restores the connection and the count returns to its previous value

---

## Data Model

**No new records, and no new props on existing ones.** This spec adds no shape type, no binding type
and no migration. That is the whole point of FR-004, and it is worth stating in the data model
section precisely because the section is empty of records: a reader looking for what SPEC-006 stores
should find the answer "nothing" here rather than conclude the section was left unfinished.

What it adds instead is a derived index, held in memory on each client:

```ts
// src/shared/shapes/merge.ts -- pure, runtime-agnostic, injected accessors,
// exactly as hierarchy.ts is. No `tldraw` import, so it stays inside the
// allowlist shared-imports.test.ts enforces and is unit-testable without an Editor.

/** One connection's terminals, as the caller reads them off the bindings. */
export interface ConnectionEndpoints {
  connectionId: string
  /** The bound node id per terminal; null when that terminal has no binding. */
  startNodeId: string | null
  endNodeId: string | null
}

/** What the derivation concluded about one connection. */
export interface MergeEntry {
  /**
   * The single answer visibility.ts asks. True for: a connection internal to a
   * collapsed container, a binding pointing at a shape that is gone, and every
   * member of a merge group except the representative.
   */
  hidden: boolean
  /**
   * The shapes the line is drawn against, after resolution. Null on a terminal
   * with no binding -- the shape's own `start`/`end` prop is used there, exactly
   * as SPEC-005 already does mid-drag.
   */
  startNodeId: string | null
  endNodeId: string | null
  /** How many connections this line stands for; 1 when not merged, and always 1
      on a hidden entry, which nothing renders. */
  count: number
}

export type MergeIndex = ReadonlyMap<string, MergeEntry>

/** The outermost collapsed ancestor, or the shape itself when nothing hides it. */
export function visibleStandInFor(shape: HierarchyShape, getShape: GetShape): HierarchyShape

export function computeMergeIndex(
  connections: readonly ConnectionEndpoints[],
  getShape: GetShape,
): MergeIndex
```

**The derivation, stated so no part of it is left to the implementer:**

1. A connection with either terminal unbound is never hidden and never merged — `count: 1`, the null
   terminal drawn from the shape's fallback props. This is the mid-drag state.
2. A bound terminal whose node id resolves to no shape gives `hidden: true`. SPEC-005's
   `onBeforeDeleteToShape` should make this transient; hiding is the same defensive answer
   `visibility.ts` gives today.
3. Otherwise resolve both terminals through `visibleStandInFor`. Equal resolutions give
   `hidden: true` (FR-002).
4. Group the survivors by the ordered key `${startNodeId}=>${endNodeId}` **after** resolution. The
   **representative is the group member with the lexicographically smallest connection shape id**;
   it carries `count` = the group size, and every other member gets `hidden: true`. Smallest id
   rather than creation order or `index`, because two clients can create concurrently and only the
   id is a value both already agree on.

`visibleStandInFor` is the outermost-collapsed-ancestor walk FR-001 needs. It is **not** the same
function as `collapsedAncestorOf`, which SPEC-004 defined as the *nearest* collapsed ancestor and
which `isHiddenByCollapse` still needs unchanged — one answers "is this hidden", the other answers
"what is on screen in its place", and in the nested-collapse case they name different containers.
The two are related (`isHiddenByCollapse(s)` is exactly `visibleStandInFor(s) !== s`), so keeping
both is a deliberate decision **not** to refactor shipped, tested code inside a spec that has its own
subject — stated here so it is not re-raised later as duplication.

## API / Interface Contract

```ts
// src/client/mergeIndex.ts

// THE INDEX HOLDS IDS, FLAGS AND A COUNT. IT MUST NOT HOLD COORDINATES.
//
// SPEC-005's load-bearing result is that a connection's anchors are read from
// the bound shapes' page transforms at geometry time, so moving a CONTAINER
// re-routes lines bound to its descendants -- nothing fires a hook there. An
// index that also cached anchor points would put a second, staler answer beside
// the live one, and SPEC-005's own test would not catch it: that test uses an
// EXPANDED container and an unmerged connection, so it never reads a resolved
// entry at all. FR-001's fifth criterion is what covers the gap.
//
// The structural reason this cannot go wrong by accident: merge.ts is a pure
// src/shared module with no access to page transforms in the first place.
// getGeometry keeps reading live bounds, as it does today.
export function getMergeIndex(editor: Editor): MergeIndex

// Consumers, both existing:
//
//   src/client/visibility.ts   shouldHide() -- a connection hides when its entry
//                              says hidden. The binding-resolution branch
//                              SPEC-005 added is REPLACED by the index, not
//                              added to: two mechanisms answering one question
//                              is the drift this repo's shape rules exist to
//                              prevent. Both of that branch's behaviours are
//                              preserved by rules 1 and 2 of the derivation.
//
//   src/client/shapes/ConnectionShapeUtil.tsx
//                              getTerminalsInPageSpace() resolves each terminal
//                              through the index's startNodeId/endNodeId before
//                              reading bounds. getHandles() returns [] when
//                              count > 1 (FR-006) and gains an onHandleDrag /
//                              onHandleDragEnd pair (FR-005), which the class
//                              does not currently have. component() renders the
//                              count when count > 1 (FR-003).
```

The index is wrapped in tldraw's `computed` (re-exported from `tldraw`; **no new dependency**) so it
is derived once per store change rather than once per shape per store change, and so tldraw's own
reactivity invalidates the visibility callback and the geometry cache when a `collapsed` flag or a
binding changes.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/shapes/
│   ├── merge.ts            # NEW -- pure resolution + merge derivation
│   ├── merge.test.ts       # NEW -- unit tests, no Editor
│   ├── hierarchy.ts        # unchanged; collapsedAncestorOf keeps its meaning
│   └── index.ts            # + re-exports
├── client/
│   ├── mergeIndex.ts       # NEW -- the `computed` wrapper over the Editor
│   ├── visibility.ts       # connection branch now reads the index
│   └── shapes/
│       └── ConnectionShapeUtil.tsx   # resolution, count, handle withdrawal,
│                                     #   and the re-aim handler owed by SPEC-005
└── worker/
    └── RoomDurableObject.ts          # debugStoredSnapshot reports shape types
e2e/
├── merged-connections.spec.ts        # NEW
├── connections.spec.ts               # the superseded FR-003 assertion rewritten;
│                                     #   + the FR-004 re-aim tests never written
└── helpers.ts                        # + a helper reporting visible connection
                                      #   endpoints and counts as rendered
docs/
├── specs/SPEC-005-connections.md            # superseded marker on FR-003
└── spec-delivery/SPEC-005-connections.md    # the FR-004 debt recorded
```

## Implementation Phases

### Phase 1: The derivation, in isolation
- `src/shared/shapes/merge.ts`: `visibleStandInFor`, `computeMergeIndex`, and the four derivation
  rules including smallest-id representative selection
- Unit tests covering nested collapse, internal-to-container, direction, unbound and dangling
  terminals, and the ancestor case FR-002 keeps visible — all without an Editor, as
  `hierarchy.test.ts` does

### Phase 2: Wiring it to the canvas
- `src/client/mergeIndex.ts` and the `computed` wrapper
- `visibility.ts`: replace the binding-resolution branch with the index
- `ConnectionShapeUtil`: resolved terminals, the count, and withdrawn handles when merged
- Rewrite the superseded assertion in `e2e/connections.spec.ts`, and record the supersession in
  SPEC-005 and its delivery doc

### Phase 3: The owed re-aim (FR-005)
- `onHandleDrag` / `onHandleDragEnd` on `ConnectionShapeUtil`, updating the binding rather than
  recreating the connection
- The refusals and the drop hint, and the e2e tests SPEC-005 never wrote

### Phase 4: Proof
- `e2e/merged-connections.spec.ts` for FR-001 through FR-003 and FR-006, asserting rendered geometry
- Extend `debugStoredSnapshot` to report shape types
- FR-004's record-set enumeration, the snapshot assertion, and the two-client
  representative-agreement test
