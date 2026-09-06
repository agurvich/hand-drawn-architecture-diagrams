# Spec: Frames and narration

**ID:** SPEC-008  
**Status:** In Progress  
**Last Updated:** 2026-09-05 (rev 3 — post-review)  
**Depends On:** SPEC-004, SPEC-006, SPEC-007

## Overview

A diagram shows a system all at once. Explaining one never does — you say "start here, now this part opens up, now look at how these two talk". Today the only way is to collapse and expand containers by hand while someone watches, and to remember where you were.

This spec adds **frames**: named, saved ways of looking at the diagram. A frame records which containers read as folded, what is worth drawing attention to, and a line of commentary. Stepping through them walks a reader from an overview into the detail and back, over **one** graph that never changes.

The load-bearing decision, settled with the user on 2026-09-05: **a frame is a lens, not an edit.** Viewing one changes what *you* see and nothing else — not the diagram, and not what your colleague is looking at. Frames themselves are shared, so you both have the same set; where each of you is in that set is your own.

## Scope

### In Scope

- A `diagramFrame` record: a **custom record type**, the third thing this codebase declares once and consumes twice, after shapes and bindings — plus a session-scoped record holding where *you* are
- Creating, naming, reordering and deleting frames; capturing the current view into one
- Viewing a frame as a per-viewer lens over collapse, writing nothing to the diagram
- Stepping forward and back, and what happens when you touch the diagram mid-frame
- Highlighting: a frame can single out nodes and connections
- A narration surface with the frame list and the step controls
- **Widening the shared-import allowlist to `@tldraw/store`, and declaring it as a dependency** — see FR-001. It is a deliberate fence being moved and a new entry in CLAUDE.md's Tech Stack, not an implementation detail; it resolves today only by hoisting

### Out of Scope

- **Frames in the JSON document.** SPEC-007's document is `version: 1` and rejects unknown keys, so adding `frames` means a version 2 and a migration path keeping v1 documents importable. That is SPEC-009, and it is genuinely separable: frames are useful before they are portable.
- **Presenting — pushing your frame to everyone.** The user chose the lens and named Present as the natural next step. The seam is deliberate: because a frame never writes to the diagram, "follow me" can later be a shared pointer at a frame id, with no change to what a frame *is*.
- **Camera position.** A frame does not record where you were looking. tldraw keeps the camera per viewer, so applying one person's viewport to another is a different mechanism and its own product question. Seam: a `camera` field on the record.
- **Edge sets, node-lens grouping, per-frame sticky notes.** The predecessor's frame carried `activeSets`, `nodeLensKey` and `stickyNotes`; all three are deferred features, and a field for a feature that does not exist is a field authors fill in for nothing.
- **Automatic frame generation** — the deferred "trace a request" idea. Frames here are hand-authored.
- **Undoable frame authoring.** Frame edits are made outside the history stack — see FR-002. Deleting a frame is confirmed instead.
- **Any change to how a node, connection or collapse behaves when no frame is active.** This spec adds no shape type, no shape prop and no shape migration.

---

## Functional Requirements

### FR-001: Two records, declared once and consumed twice

#### Description:

A frame is not a shape. It has no geometry and nothing hit-tests it; forcing it into the shape model would mean a shape whose whole job is to not be on the canvas. tldraw 5 takes **custom record types** — `createTLSchema({ records })` on the worker, `useSync({ records })` on the client — so this is the same client/worker duality shapes and bindings already have, and it follows the same rules.

Two record types, at two scopes:

- **`diagramFrame`, `scope: 'document'`** — the frames themselves, persisted and synced.
- **`diagramFrameView`, `scope: 'session'`** — a **singleton** record, id `diagramFrameView:current`, holding which frame *this viewer* is on and which containers they have taken off-frame. Session scope is local to one client and never synced, which is exactly what "my place in the narration" is.

  **It does not survive a reload, and that is accepted rather than worked around.** tldraw persists the camera through a session snapshot whose field list is closed and hard-coded, written by the local-persistence client; `useSync` has no persistence path at all, so an arbitrary session-scoped record is simply gone on reload. Adding `localStorage` rehydration would be a new mechanism for the least valuable state in the feature — where you were in a narration, not anything you authored. You reopen the room at no frame, which is where you would start anyway.

**The view state goes in a record and not in a module-level atom, because `decisions.md` → *Derived views are computed, never materialized* says a value that cannot be recomputed from records is not a derived view, it is state, and it belongs in a record.** `activeFrameId` cannot be recomputed from anything. The precedents that might look like counter-examples are not: `mergeIndex` holds a *derivation* that is reconstructible at any moment, and `selection.ts` holds no state at all. Session scope is what makes "in a record" and "never reaches another client" both true at once.

#### Acceptance Criteria:

- [ ] Both record types' type strings, validators and migrations are declared once under `src/shared/`, and the **type-literal guard covers both new strings** — five now, one rule — with `src/shared/frames/frame.ts` added to the guard's definition-module exemptions, whose own test asserts each exempted file exists
- [ ] The declaration carries the `TLGlobalRecordPropsMap` module augmentation. Without it `TLRecord` never includes the type and `editor.store.put/get` does not typecheck — the same trap `node.ts` labels "REQUIRED, and easy to miss" for shapes
- [ ] **The shared-import allowlist gains `@tldraw/store`,** because `BaseRecord` and `RecordId` are imported by `@tldraw/tlschema` and not re-exported by it. This widens a deliberate fence, so the allowlist test states the reason in place, and the new entry is the whole widening — `tldraw` itself stays forbidden
- [ ] Ids follow tldraw's convention, `` `diagramFrame:${unique}` ``, validated with `idValidator`, because `RecordType.parseId` throws on anything else
- [ ] The migration sequence id is `com.tldraw.diagramFrame` (and `…diagramFrameView`), which tldraw asserts on and throws a mismatch for
- [ ] **`records` goes to the `useSync` branch that does NOT pass `schema`.** `TLStoreSchemaOptions` is a union, and passing both typechecks while the schema branch discards `records` silently — so the dev branch gets them through `devOnly.ts`'s own `createTLSchema({ records })` instead. A spec that said "both branches" would have a builder add a dead argument
- [ ] **The check is on the resulting SCHEMA, not on source text.** Every construction site's schema is asserted to carry the record type — `worker/schema.ts`'s directly, and `devOnly.ts`'s through the function that builds it. A source-text scan would pass happily on the dead argument above, which is exactly the failure this criterion exists to catch
- [ ] A frame created in one client appears in another and survives every client disconnecting, asserted on durable storage content through `debugStoredSnapshot`, extended to report frame records — not on a count
- [ ] A `diagramFrameView` record **never reaches another client**: with A on a frame, B's full record set contains no `diagramFrameView` of A's
- [ ] A room persisted **before** these record types existed opens without error and shows no frames, asserted by seeding an older snapshot through `debugSeedSnapshot`

*(There is deliberately no client/worker migration-version comparison here, of the kind `boundary.test.ts` runs for shapes and bindings. A custom record has no client-side util, so both sides read the same exported object and the check would be `X === X` — it could not fail. The registry-consumption criterion above is the check that can.)*

### FR-002: Creating, naming, ordering and capturing

#### Description:

A frame is made from what you are looking at. The expensive part of authoring narration is setting the view up; the cheap part should be saying "keep that".

**Frame authoring does not go on the undo stack.** Document-scoped records share the diagram's history, so without this, drawing a node after capturing a frame and pressing undo twice deletes the frame — for everyone. Frame edits are made with history ignored, and deletion is confirmed instead.

**Session-scoped records reach the history stack too** — the store's history interceptor has no scope filter — so the same rule has to cover stepping. Which writes record and which ignore is set out in full at FR-004.

#### Acceptance Criteria:

- [ ] A control creates a frame from the **current effective view**, including any off-frame overrides in force — "effective" means what is on your screen, not what the props say
- [ ] Capturing **activates the new frame and clears `offFrame`.** Stated because at capture time the recorded value, the own prop and the effective value all coincide, so a test written the day it is built cannot tell the choices apart — and they diverge the moment a prop changes
- [ ] Capture records **every node that has children at capture time**, explicitly, with its effective state. A node with no children is not recorded; a leaf that later gains children therefore falls back to its own prop, per FR-003. Stated because "container" is not a type in this codebase — every `diagramNode` carries `collapsed` — so the population has to be named
- [ ] A frame can be renamed, and carries a note of at least a sentence
- [ ] Frames have an explicit order a user can change, and the order is shared — two clients list them identically
- [ ] Deleting a frame is confirmed, and leaves the diagram untouched — asserted by enumerating shape and binding records before and after
- [ ] Re-capturing an existing frame overwrites its collapse map and highlight and keeps its id, name, note and position — refining a frame is not rebuilding it
- [ ] **No frame edit appears on the undo stack:** capture a frame, draw a node, undo twice, and the frame is still there with the diagram back to its prior record set

### FR-003: A frame is a lens, and never writes to the diagram

#### Description:

Viewing a frame changes what you see. It does not change the diagram, and it does not change what anyone else sees. Every other requirement rests on this.

Mechanically it is SPEC-006's move again — derived, not materialised — but the injection point matters and is not where it first appears. **Collapse is read in two places, not one:** `visibility.ts` walks ancestry through `isHiddenByCollapse`, and `mergeIndex.ts` walks it again through `merge.ts`'s `visibleStandInFor`. Both bottom out in `hierarchy.ts`'s `isCollapsedContainer`, which reads `props.collapsed` raw. Changing only the first would hide a container's descendants while the connections crossing its boundary stayed unmerged and drawn to shapes that are no longer there.

The fix is to override at the **`GetShape` boundary both consumers already share**: a client-side `frameAwareGetShape(editor)` returns each node with its effective `collapsed`, and both `visibility.ts` and `mergeIndex.ts` use it. `hierarchy.ts` and `merge.ts` do not change — they are pure, they take only an injected `GetShape`, and `HierarchyShape.props` is already deliberately loose enough to carry a substituted value. **One override function, used by both, is what makes "merging follows the frame" true rather than hopeful.**

#### Acceptance Criteria:

- [ ] Viewing a frame that folds container P hides P's descendants for this viewer, through the same visibility path collapse already uses
- [ ] **Merging follows the frame.** With P folded by a frame only, connections crossing P's boundary merge and re-anchor onto P exactly as they do when P's own prop is set — asserted directly, because this is the criterion that fails if the override is applied at one call site and not the other
- [ ] **P itself reads as folded.** Its rendered state, its collapse control's label and `aria-expanded`, and its hidden-descendant badge all follow the effective value, not the prop — otherwise a frame hides the children while the container still shows "Collapse" and no count
- [ ] **No shape record changes.** The full set of shape and binding records is identical before viewing a frame, while viewing, and after leaving — enumerated, not counted
- [ ] **A second client sees nothing.** With A viewing a frame that folds P, B's rendered view and record set are both unchanged
- [ ] The effective state of a node is: its own prop if it has been taken off-frame (FR-004); else the frame's value if the frame names it; else its own prop. That order is the contract
- [ ] A frame's highlight accents the named nodes and connections, and ids that no longer resolve are ignored rather than erroring
- [ ] **A frame that survives an import degrades safely.** SPEC-007's import replaces the page but frames are not shapes, so they outlive it and their collapse maps may name nothing that exists. A frame is **stale** when it names at least one node and *none* of the ids it names — in `collapsed` or `highlighted` — resolves to a shape. A frame that names nothing is empty, not stale, and a frame with one surviving id is neither. The surface marks a stale frame rather than presenting it as working
- [ ] Leaving frames returns every node to its own prop, including ones the frame had folded

### FR-004: Stepping, and going off-frame

#### Description:

Narration is a sequence. Forward and back are the controls that matter, and the interesting case is the reader who stops following and starts poking.

#### Acceptance Criteria:

- [ ] **Exactly one narration write records history, and it is the toggle.** Moving between frames and selecting one from the list write `activeFrameId` with history ignored; clearing `offFrame` on a frame change is ignored too. Only FR-004's collapse toggle records — writing the node's prop and its `offFrame` entry as one change, which is what makes the undo criterion below true. Without this, undo walks the reader backwards through the narration, and an unrelated node edit's undo drags them with it
- [ ] Forward and back move through the frame order and stop at the ends rather than wrapping
- [ ] Stepping is per viewer: two clients on different frames each see their own, simultaneously, over one diagram
- [ ] **The collapse control always shows the EFFECTIVE state.** On a node a frame folds but whose own prop is open, the control offers "expand" — matching what is on screen rather than what is stored
- [ ] **Activating it takes that node off-frame for you** and writes the opposite of the effective state to its own prop. The rest of the frame keeps applying
- [ ] **Undo of that toggle also clears the off-frame entry**, so undo is the true inverse. Without this, undoing restores the prop while the node stays off-frame, and the user sees a change they never made
- [ ] **`offFrame` is per-frame, not per-session: changing the active frame clears it.** Otherwise frame 1's overrides silently suppress frame 2's captured values for those nodes, and the reader sees a frame that is not the frame. Re-selecting the same frame therefore also restores its full set
- [ ] The surface says when you are off-frame
- [ ] A frame deleted by another client while you view it drops you out of frames rather than leaving you pointed at a record that is gone

### FR-005: The narration surface

#### Description:

The frame list, the step controls, and enough of the note to be worth reading. Built for the iPad first, like every other surface here.

#### Acceptance Criteria:

- [ ] The frame list shows every frame in order, marks which is active, and selecting one applies it
- [ ] Forward and back are reachable without opening the list, since stepping is the common action and list management is not
- [ ] The active frame's note is visible while it is active
- [ ] Controls are at least 44×44, reachable by keyboard, and labelled, per `docs/best-practices/accessibility/accessibility.md`
- [ ] The surface does not cover the canvas when no frame is active and the list is closed
- [ ] With no frames yet, the surface says what a frame is for rather than showing an empty list

---

## Data Model

```ts
// src/shared/frames/frame.ts -- one declaration, both runtimes.
//
// Imports @tldraw/store for BaseRecord/RecordId: @tldraw/tlschema imports them
// and does not re-export them, so the shared allowlist gains that one entry.
// `tldraw` itself stays forbidden -- it would pull React and the DOM into the
// Worker bundle, which is the reason the fence exists at all.

export const FRAME_RECORD_TYPE = 'diagramFrame'
export const FRAME_VIEW_RECORD_TYPE = 'diagramFrameView'

export interface FrameRecord extends BaseRecord<typeof FRAME_RECORD_TYPE, RecordId<FrameRecord>> {
  name: string
  /** Commentary shown while the frame is active. Empty is fine. */
  note: string
  /**
   * Every node that had children when the frame was captured, with its
   * effective state. A node absent from this map falls back to its own prop --
   * which is how a node created after the frame behaves sensibly.
   * Keys are raw tldraw shape ids (`shape:…`); SPEC-009 strips the prefix on
   * the way into a document, as SPEC-007 does for node ids.
   */
  collapsed: Record<string, boolean>
  /** Shape ids to accent. Ids that no longer resolve are ignored. */
  highlighted: string[]
  /** Sort key for the frame order. */
  index: string
}

/**
 * Where THIS VIEWER is. One record per session, never synced.
 *
 * In a record rather than a module atom because it is authoritative state, not
 * a derivation -- `activeFrameId` cannot be recomputed from anything, and
 * `decisions.md` -> Derived views are computed, never materialized says such a
 * value belongs in a record. Session scope is what makes "in the store" and
 * "never reaches another client" both true.
 */
export interface FrameViewRecord
  extends BaseRecord<typeof FRAME_VIEW_RECORD_TYPE, RecordId<FrameViewRecord>> {
  /**
   * BRANDED, not `string`. `editor.store.get(view.activeFrameId)` does not
   * typecheck against a plain string, so every lookup would need an unchecked
   * cast -- in the one place a STALE id is expected (FR-004: the frame another
   * client just deleted).
   */
  activeFrameId: RecordId<FrameRecord> | null
  /** Nodes taken off-frame by a manual toggle. Cleared when the frame changes. */
  offFrame: string[]
}

declare module '@tldraw/tlschema' {
  interface TLGlobalRecordPropsMap {
    [FRAME_RECORD_TYPE]: FrameRecord
    [FRAME_VIEW_RECORD_TYPE]: FrameViewRecord
  }
}
```

`diagramFrame` is `scope: 'document'` — persisted and synced, the reach a saved narration needs.
`diagramFrameView` is `scope: 'session'` — local to one browser, persisted there, never on the wire.

## API / Interface Contract

```ts
// src/shared/frames/frame.ts -- pure, unit-testable without an Editor.

/**
 * The effective collapsed state of one node.
 *
 * THE FRAME NEVER WRITES. This resolves; it does not mutate. The order is the
 * contract (FR-003) and FR-004's toggle depends on it:
 *
 *   1. taken off-frame by a manual toggle  -> its own prop
 *   2. the active frame names it           -> the frame's value
 *   3. otherwise                           -> its own prop
 *
 * "Names it" is `Object.hasOwn(frame.collapsed, nodeId)`, not `in` -- `in` finds
 * inherited keys and would answer for `toString`. Harmless for `shape:` ids, and
 * exactly the sort of thing two builders write differently.
 */
export function effectiveCollapsed(
  nodeId: string,
  ownCollapsed: boolean,
  frame: FrameRecord | null,
  offFrame: ReadonlySet<string>,
): boolean

/**
 * The override, as a PURE function -- which is what makes FR-003's merging
 * criterion unit-testable. Given the real `hierarchy.ts` and `merge.ts`, a test
 * asserts that substituting this accessor produces output deep-equal to setting
 * the prop for real, with no Editor anywhere.
 *
 * `frameAwareGetShape` below is a two-line client wrapper that reads the session
 * record and calls this. The seam exists so the claim is proved in Phase 2
 * rather than deferred to an e2e in Phase 4.
 */
export function withEffectiveCollapsed(
  getShape: GetShape,
  frame: FrameRecord | null,
  offFrame: ReadonlySet<string>,
): GetShape

/** Whether a frame names ids and none of them resolve (FR-003). */
export function isFrameStale(frame: FrameRecord, getShape: GetShape): boolean

// src/client/frameView.ts -- the ONE override, and both consumers use it.
//
// The injection point is `GetShape`, not `isHiddenByCollapse`. Collapse is read
// twice -- visibility.ts walks ancestry, and mergeIndex.ts walks it again
// through merge.ts's visibleStandInFor -- and both bottom out in the same pure
// `isCollapsedContainer`, which reads props.collapsed raw. Overriding at the
// accessor covers both without touching either pure module, and it is why
// "merging follows the frame" is a property rather than a coincidence.
//
// It also means hierarchy.ts and merge.ts do NOT change: they take only an
// injected GetShape, and HierarchyShape.props is deliberately loose enough to
// carry a substituted value.
export function frameAwareGetShape(editor: Editor): GetShape

/**
 * The active frame and off-frame set, from the singleton session record.
 *
 * Returns `{ frame: null, offFrame: empty }` when the record does not exist yet,
 * and does NOT create it -- reading must not write, or opening a room dirties a
 * store nobody has touched. It is created on the first step.
 */
export function frameState(editor: Editor): {
  frame: FrameRecord | null
  offFrame: ReadonlySet<string>
}
```

**Consumers to change, all of them named:**

| Site | Change |
|---|---|
| `src/client/visibility.ts` | pass `frameAwareGetShape(editor)` instead of the raw accessor |
| `src/client/mergeIndex.ts` | the same, so merging follows the frame |
| `src/client/shapes/NodeShapeUtil.tsx` | read the effective value for the rendered state, the control's label and `aria-expanded`, and the descendant badge |
| `src/client/Room.tsx` | `records` on both `useSync` branches; render the narration surface |
| `src/client/devOnly.ts` | `records` on the permissive dev schema |
| `src/worker/schema.ts` | `records` |

Reactivity comes free: the session record lives in the store, so anything reading it inside a `computed` — which `getMergeIndex` and `getShapeVisibility` both are — re-runs when it changes.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/
│   ├── frames/
│   │   ├── frame.ts               # NEW -- both record types, validators, migrations,
│   │   │                          #        effectiveCollapsed, withEffectiveCollapsed, isFrameStale
│   │   ├── frame.test.ts          # NEW -- unit, no Editor, including the merging claim
│   │   │                          #        run against the real hierarchy.ts and merge.ts
│   │   └── index.ts               # NEW -- the customRecordSchemas registry
│   └── shapes/
│       └── shared-imports.test.ts # allowlist gains @tldraw/store; guard covers 4 type strings
├── client/
│   ├── frameView.ts               # NEW -- frameAwareGetShape, frameState, the mutations
│   ├── visibility.ts              # uses the frame-aware accessor
│   ├── mergeIndex.ts              # the same
│   ├── devOnly.ts                 # + records
│   ├── Room.tsx                   # + records on BOTH useSync branches, + the surface
│   ├── shapes/NodeShapeUtil.tsx   # renders the effective state
│   └── panels/
│       ├── NarrationPanel.tsx     # NEW
│       └── NarrationPanel.test.tsx
└── worker/
    ├── schema.ts                  # + records
    └── RoomDurableObject.ts       # debugStoredSnapshot reports frame records
e2e/
└── frames.spec.ts                 # NEW
```

## Implementation Phases

### Phase 1: The records
- `src/shared/frames/`: both types, the augmentation, branded ids, migration sequence ids
- `@tldraw/store` added to `package.json` and to CLAUDE.md's Tech Stack, not left to hoisting
- The allowlist widening and the type-literal guard extension, with a fixture case for each
- Registration at all four schema sites, and the mechanical check that they use one registry
- FR-001's sync, session-isolation, durability and old-room criteria

### Phase 2: The lens
- `effectiveCollapsed` and its unit tests, including the three-way order
- `withEffectiveCollapsed` proved against the **real** `hierarchy.ts` and `merge.ts` in a unit test —
  substituting the accessor must produce output deep-equal to setting the prop
- `frameAwareGetShape`, the client wrapper, wired into **both** `visibility.ts` and `mergeIndex.ts`
- `NodeShapeUtil` reading the effective value
- FR-003's record-set enumerations, the second-client criterion, and the merging criterion — which is the one that catches the override being applied to only one consumer

### Phase 3: Authoring and stepping
- Create, capture, rename, reorder, delete-with-confirm, re-capture — all with history ignored
- Forward/back, the effective-state toggle, off-frame, undo clearing the off-frame entry, and the deleted-frame case

### Phase 4: The surface and proof
- `NarrationPanel`, routed through `docs/best-practices/INDEX.md` for React and accessibility first
- `e2e/frames.spec.ts` across FR-002 through FR-005, including two clients on different frames
