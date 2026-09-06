# Spec: Sketch to clean shape

**ID:** SPEC-010  
**Status:** Draft  
**Last Updated:** 2026-09-05  
**Depends On:** SPEC-004, SPEC-005

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
- **Changing what a node or connection IS.** No new shape type, no new prop, no migration.

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
- [ ] A **recorded-stroke corpus** drives the tests: real point lists captured from pencil input,
      stored as fixtures, each with its expected verdict. A recogniser tuned against
      hand-written point lists is tuned against the author's idea of a rectangle
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
- [ ] A box drawn entirely inside an **expanded** container becomes that container's child, with its
      position stored relative to the parent as SPEC-004 requires
- [ ] A box drawn over a **collapsed** container does not become its child — the container refuses
      children while folded, and a node parented into it would vanish on creation
- [ ] The new node is selected after conversion, so the next thing you do is name it
- [ ] A box too small to be a usable node is refused and left as a stroke. Named because the natural
      failure is a stray dot becoming a 4×4 node that nobody can see or select

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
- [ ] Classification order is stated and tested: a stroke that is **both** box-like and line-like —
      a long thin loop — resolves to whichever test is applied first, and the order is box, then
      line, so a closed shape is never mistaken for a connection

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

**No new records, no new props, no migration.** A recognised node is a `diagramNode` and a recognised
connection is a `diagramConnection`; the whole feature is a gesture that creates the shapes the
toolbar already creates.

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

The session-scoped mode record follows SPEC-008's `diagramFrameView` exactly — same scope, same
reason, same registration path. That is the third custom record type; if SPEC-008's is the pattern,
this is the first test of whether the pattern is reusable or was a one-off.

## API / Interface Contract

```ts
// src/client/sketch/recogniseOnDraw.ts
//
// Hooks tldraw's side effects: after a `draw` shape is created, classify it and
// convert. NOT during the drag -- SPEC-004 already paid for the lesson that a
// per-pointer-frame hook fires far more often than the gesture it looks like it
// describes.
//
// Every conversion is one editor.run() after markHistoryStoppingPoint(), for the
// reason documentIO.ts records: `run` batches a transaction but does not create
// an undo boundary, and "one undo restores the stroke" is FR-004's criterion.
export function registerSketchRecognition(editor: Editor): () => void
```

**Where the endpoints are tested against nodes** matters and is easy to get wrong: a stroke's points
are in page space, and `nodeAtPoint` (SPEC-007's shared helper) already answers "which node is under
this page point", excluding hidden ones. FR-003's collapsed-container criterion falls out of reusing
it rather than writing a second hit test.

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
