# Spec: Sketch to clean shape

**ID:** SPEC-010  
**Status:** Draft  
**Last Updated:** 2026-09-05 (rev 2 — post-review)  
**Depends On:** SPEC-004, SPEC-005, SPEC-006, SPEC-008

## Overview

Draw a rough box with the pencil and get a real node — one that nests, collapses, connects and
exports. Draw a line from one node to another and get a real connection.

This is the last of the three reasons the tool was rebuilt, and the only one tldraw does not hand us:
it ships freehand drawing and it ships clean shapes, but nothing that turns the first into the
second. It is also the feature that decides whether the tool feels like *drawing* or like *filling in
a form* — every node today is made from a toolbar, which is a mouse gesture wearing a pencil's
clothes.

The thing that makes it dangerous is the same thing that makes it good: this app deliberately keeps
hand-drawn work. SPEC-007 puts a confirmation in front of destroying it. A recogniser that quietly
converts every rectangle-ish scribble into a node destroys annotation instead, and does it one stroke
at a time with no confirmation at all. **So recognition is a mode you turn on, off by default** — see
FR-004, which is the requirement the rest of the spec exists to be safe under.

## Scope

### In Scope

- A pure recogniser: simplify a stroke, classify it, and say what it should become
- A closed, roughly-rectangular stroke becoming a `diagramNode`
- A stroke from one node to another becoming a `diagramConnection`
- Nesting: a box drawn inside an expanded container becomes its child
- A mode control, **off by default**, and one undo restoring the original stroke
- **One new session-scoped record** for the mode, with the ceremony SPEC-008's pattern requires —
  the `TLGlobalRecordPropsMap` augmentation, a branded id, the `com.tldraw.<type>` migration
  sequence id, registration on **both** the worker schema and `useSync`, and the type-literal guard.
  SPEC-008 also widened the shared-import allowlist to `@tldraw/store` for `BaseRecord`/`RecordId`;
  this depends on that having landed

### Out of Scope

- **Ellipses, diamonds, arrows, text recognition, handwriting.** One shape and one line. The
  predecessor had none of this, so every one of them is new surface with no usage behind it, and a
  recogniser that guesses between five categories is wrong far more often than one that guesses
  between two and a refusal.
- **Recognising anything already on the canvas.** This converts a stroke as it is finished. A
  "tidy up this sketch" pass over existing strokes is a different feature with a different failure
  mode — it would rewrite work the user has already accepted.
- **Beautifying the node.** A recognised node is an ordinary node with the default styling, sized to
  the stroke's bounding box. It does not keep the wobble.
- **Recognition on by default.** FR-004. Deliberately not a preference we ship enabled and let people
  discover; the cost of a wrong conversion is a destroyed annotation.
- **Changing what a node or connection IS.** No new SHAPE type, no new shape prop, no shape
  migration. The mode record above is a new *record* type, which is a different thing and is in
  scope.

---

## Functional Requirements

### FR-001: A recogniser that is a pure function

#### Description:

Classification takes a list of points and returns a verdict. No Editor, no store, no canvas — which
means it is unit-testable against recorded strokes, and that is the only way a recogniser gets tuned
without guessing.

The method is the ordinary one: reduce the point list to its corners with Ramer–Douglas–Peucker, then
look at what is left. Four corners and a closed path is a box. Two endpoints far apart, with the path
between them not doubling back, is a line. Anything else is **not recognised**, which is a first-class
verdict and not an error.

#### Acceptance Criteria:

- [ ] The recogniser lives in `src/shared/`, imports no `tldraw`, and is tested with no Editor —
      the same shape `hierarchy.ts`, `merge.ts` and `document.ts` already have
- [ ] It returns one of exactly three verdicts: a box (with its bounding box), a line (with its two
      endpoints), or **nothing**. "Nothing" is the default, not the error path
- [ ] A **recorded-stroke corpus** drives the tests, stored as fixtures with expected verdicts. A
      recogniser tuned against hand-written point lists is tuned against the author's idea of a
      rectangle
- [ ] **The capture mechanism is built, because none exists.** Replay does — `e2e/canvas.spec.ts`
      drives the draw tool through raw CDP pen events — but nothing writes a real stroke to a file.
      A dev-only route dumping the last stroke's decoded points as JSON, gated the way
      `devOnly.ts` already gates, is the cheap version and reuses machinery that is there
- [ ] **Strokes captured through CDP pen input count as real for this purpose**, and the corpus says
      so per file. `architecture.md` records an open defect — the app renders blank on iPad — so
      pencil-on-glass capture is not available, and a spec that waited for it would not be
      buildable. Recorded honestly rather than implied away
- [ ] The corpus includes strokes that must be **refused**: a scribble, a spiral, a single dot, a
      squiggly underline, a triangle, and a box drawn so badly it should not count. A corpus of only
      successes cannot see a false positive, and a false positive here eats someone's annotation
- [ ] Tolerances are named constants with the reason beside them, not magic numbers inline
- [ ] The verdict is stable under reversal and rotation of the point order: the same stroke drawn
      clockwise, anticlockwise, or starting from a different corner classifies the same

### FR-002: A sketched box becomes a node

#### Description:

Finish a roughly-rectangular stroke with recognition on, and the stroke is replaced by a node at its
bounding box.

#### Acceptance Criteria:

- [ ] The `draw` shape is deleted and one `diagramNode` is created at the stroke's bounding box, with
      the shape's default props otherwise
- [ ] Both happen inside **one recorded change** after a history mark, so a single undo restores the
      original stroke exactly — asserted on the restored record, not on a shape count
- [ ] A box drawn entirely inside an **expanded** container becomes that container's child, created
      with an explicit `parentId` — not `reparentShapes`. The distinction matters: reparenting
      converts the position, whereas creating with a parent takes x/y as already parent-local, so
      naming the wrong one silently misplaces every nested box
- [ ] A box drawn over a **collapsed** container does not become its child — the container refuses
      children while folded, and a node parented into it would vanish on creation
- [ ] The new node is selected after conversion, so the next thing you do is name it
- [ ] A box too small to be a **usable node** is refused and left as a stroke — a different and
      larger threshold than `MIN_STROKE_EXTENT`'s "this is a dot, not a shape". The default node is
      200×120; a stroke can clear "not a dot" and still be a node nobody can see or select, so the
      two constants are separate and both are named

### FR-003: A sketched line between two nodes becomes a connection

#### Description:

A stroke that starts on one node and ends on another is the gesture for "these are related".

#### Acceptance Criteria:

- [ ] A line stroke whose first point is inside node A and last point is inside node B creates one
      `diagramConnection` bound to both, and deletes the stroke — one recorded change, one undo
- [ ] Direction follows the stroke: the end you started from is the source
- [ ] A line stroke that starts and ends on the **same** node creates nothing and is left as a stroke
- [ ] A line stroke with one or both ends on empty canvas is left as a stroke — a connection to
      nowhere is not a thing this tool has
- [ ] An endpoint inside a **collapsed** container binds to the container, matching what SPEC-006's
      re-aim already does: a hidden node is not a target because it is not on screen
- [ ] **The rule is outcome-shaped, not order-shaped: a stroke whose two ends resolve to two
      DIFFERENT nodes is a line, whatever the corner count says; otherwise box-then-line applies.**
      Box-first alone spends the weaker evidence first. Counterexample, and a required corpus entry:
      a connection routed around an obstacle — right, down, right — yields three corners, which
      `CORNER_TOLERANCE` admits, and if its ends happen to fall within `CLOSE_FRACTION` it is called
      a box. Both ends sit in distinct nodes, which is unambiguous connection evidence, and under a
      pure order rule it is never consulted. An intended connection becomes a node: exactly the
      annotation-eating failure FR-004 exists to prevent
- [ ] The recogniser stays **pure and node-blind**; the endpoint resolution above happens in the
      client adapter, which then overrides a box verdict. The corpus therefore tests the pure
      classifier, and one e2e tests the override

### FR-004: It never eats an annotation

#### Description:

The requirement everything else has to be safe under.

This app keeps hand-drawn work on purpose; SPEC-007 puts a confirmation in front of destroying it.
Recognition destroys it one stroke at a time, silently, and a false positive is indistinguishable
from a bug to the person whose note just became a rectangle.

#### Acceptance Criteria:

- [ ] Recognition is **off by default**, and a fresh room does not convert anything
- [ ] With it off, no stroke is ever converted, asserted by drawing a stroke that the recogniser
      classifies as a box and finding the `draw` shape still there and no node created
- [ ] The mode is per viewer and does not sync — one person tidying their sketches does not convert
      shapes under someone else's pencil. The seam SPEC-008 established for per-viewer state is the
      same one: a session-scoped record, not a module variable
- [ ] With it on, **one undo** returns the exact original stroke — same points, same id — for both
      the box and the line case
- [ ] A conversion is announced to assistive technology, since the canvas changing under you without
      a visible cause is the thing a screen-reader user cannot see. `role="status"`, per
      `docs/best-practices/accessibility/accessibility.md` 4.1.3

### FR-005: The control

#### Description:

A toggle, its state visible, reachable on an iPad.

#### Acceptance Criteria:

- [ ] A control toggles recognition, shows which state it is in, and persists for the session
- [ ] It is at least 44×44, labelled, keyboard reachable, and does not overlap tldraw's own UI —
      asserted on **overlap**, as SPEC-007's launcher now is
- [ ] Its accessible name says what it does rather than what it is called, so a voice-control user
      can ask for it
- [ ] Turning it off mid-session converts nothing further and leaves everything already converted

---

## Data Model

**No new SHAPE type, no new shape prop, no shape migration.** A recognised node is a `diagramNode`
and a recognised connection is a `diagramConnection`; the conversion is a gesture that creates the
shapes the toolbar already creates. The one new record is the mode, below.

```ts
// src/shared/sketch/recognise.ts -- pure, no tldraw import.

export interface Point {
  x: number
  y: number
}

/** Exactly three verdicts. "Nothing" is the default, not a failure. */
export type Verdict =
  | { kind: 'box'; min: Point; max: Point }
  | { kind: 'line'; from: Point; to: Point }
  | { kind: 'none'; because: string }

export function recognise(points: readonly Point[]): Verdict

/**
 * Tolerances, named with their reasons. A number inline is a number nobody can
 * argue with later.
 */
export const SIMPLIFY_EPSILON: number
/** Below this, a stroke is a dot or a tap, not a shape. */
export const MIN_STROKE_EXTENT: number
/** A path whose ends are within this fraction of its size is CLOSED. */
export const CLOSE_FRACTION: number
/** How far a corner count may stray from four and still be a box. */
export const CORNER_TOLERANCE: number
```

The session-scoped mode record follows SPEC-008's `diagramSceneView` — same scope, same reason, same
registration path, and **the same governing rule: its writes are history-IGNORED.** tldraw's history
filters on `source`, not on record scope, so without that the toggle is undoable and FR-004's "one
undo returns the exact original stroke" is false whenever the toggle was the last write. That is the
criterion the whole spec exists to protect, and SPEC-008 learned this by measurement rather than by
reading.

## API / Interface Contract

```ts
// src/client/sketch/recogniseOnDraw.ts
//
// registerAfterChangeHandler('shape', ...), gated on the stroke COMPLETING:
// prev.props.isComplete === false && next.props.isComplete === true.
//
// NOT registerAfterCreateHandler. tldraw creates the draw shape ONCE, at
// pointer-down, with a single point at the origin; every subsequent point is an
// update, and `complete()` is an update too. An after-create hook therefore sees
// one point at (0,0), classifies it as nothing, and the feature is inert -- the
// same class of mistake SPEC-004 made with onDragShapesOver, arrived at from the
// opposite direction.
//
// The change handler needs a RE-ENTRANCY GUARD: deleting the draw shape and
// creating the node both fire handlers.
//
// Every conversion is one editor.run() after markHistoryStoppingPoint(), for the
// reason documentIO.ts records: `run` batches a transaction but does not create
// an undo boundary, and "one undo restores the stroke" is FR-004's criterion.
export function registerSketchRecognition(editor: Editor): () => void
```

**Getting the points out is two steps, and both are easy to get wrong.**

A `TLDrawShapeSegment` has no `points` field. It has `path: string` — delta-encoded base64. Decoding
is `b64Vecs.decodePoints`, which `@tldraw/tlschema` exports, so it is inside the shared allowlist;
`getPointsFromDrawSegments` is in `tldraw` and is not.

And the decoded points are **shape-local, not page space**: the tool seeds `Vec(0,0)` and writes
`getPointInShapeSpace(shape, currentPagePoint)` thereafter. Feeding them to `nodeAtPoint` — which is
SPEC-006's helper and hit-tests in PAGE space — tests the wrong coordinates entirely. A
`getShapePageTransform` pass is required, along with the shape's `scale`, and FR-002's "bounding box"
means `getShapePageBounds`, not the local extent.

With those two steps done, `nodeAtPoint` answers "which node is under this page point" excluding
hidden ones, and FR-003's collapsed-container criterion falls out of reusing it.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/
│   └── sketch/
│       ├── recognise.ts            # NEW -- simplify, classify, the tolerances
│       ├── recognise.test.ts       # NEW -- unit, driven by the corpus
│       ├── __fixtures__/strokes/   # NEW -- recorded point lists, boxes, lines, refusals
│       └── mode.ts                 # NEW -- the session-scoped record, per SPEC-008's pattern
├── client/
│   ├── sketch/
│   │   └── recogniseOnDraw.ts      # NEW -- the side effect, and the conversions
│   ├── panels/
│   │   └── SketchToggle.tsx        # NEW
│   └── Room.tsx                    # + the toggle, + the registration
└── worker/
    └── schema.ts                   # + the mode record
e2e/
└── sketch.spec.ts                  # NEW
```

## Implementation Phases

### Phase 1: The recogniser and its corpus
- Capture real pencil strokes into `__fixtures__/strokes/` — boxes, lines, and the refusals first
- `recognise.ts`, tuned against the corpus rather than against an idea of a rectangle
- The reversal/rotation stability criterion, which is what catches a classifier that happens to work
  on the way the author draws

### Phase 2: The mode
- The session-scoped record and its registration, following SPEC-008's path
- The off-by-default criterion, asserted before anything can convert

### Phase 3: The conversions
- `recogniseOnDraw.ts`: box → node, line → connection, one recorded change each
- Nesting, the collapsed-container cases, the refusals, and the undo criteria

### Phase 4: The control and proof
- `SketchToggle`, routed through `docs/best-practices/INDEX.md` first
- `e2e/sketch.spec.ts`, driving real pointer input rather than calling the recogniser — the gesture
  is the feature, and a test that calls `recognise` directly would pass against a build where no
  stroke ever reaches it
