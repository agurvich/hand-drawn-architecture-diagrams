# Spec: Recognition that works on a real hand

**ID:** SPEC-017
**Status:** Draft
**Last Updated:** 2026-09-08
**Depends On:** SPEC-010

## Overview

Sketch recognition does not work. Drawn on an iPad with a pencil, one stroke in the whole
2026-09-07 session became a node, and the person drawing concluded the feature was not built. This
spec makes the recogniser accept a rectangle drawn by a hand rather than by a mouse, and pins that
behaviour to the strokes that hand actually drew.

The failure has a cause, and it is not the one `docs/handoff/2026-09-08-ipad-findings.md` recorded.
A corner is measured by summing the turn angles across a rounded corner, and those angles are summed
as **magnitudes**, so a hand's tremor along an edge adds to the corner instead of cancelling out. His
rectangles report corners of 119°–285° where he drew 90°. Every one of them is closed, and every one
has exactly four corners; they are refused for not being *square enough*, by a test that is measuring
his shakiness rather than his corners. That is the whole of the primary defect, and the corpus says
so unambiguously: summing the same turns **with sign** puts all twelve of his rectangles between 3°
and 11° of square.

## Scope

### In Scope

- Summing corner turns with sign, so a corner measures the turn a person drew.
- Making the rectangle test admit a hand-drawn rectangle at the sizes he draws at, with a stated
  margin on both sides rather than a threshold that happens to fit.
- A real-pencil fixture path: strokes from `docs/corpus/` promoted into the fixture corpus that
  `recognise.test.ts` already reads, carrying their own provenance.
- A whole-corpus measurement that fails when the numbers move, so the next change to the classifier
  is scored against 276 real strokes rather than 24 synthetic ones.
- The regression this spec's own success creates: once boxes become nodes, a stroke with an end in
  two different nodes converts regardless of shape, and handwriting sits among nodes.

### Out of Scope

- **Changing `SIMPLIFY_EPSILON` or normalising strokes by scale.** Measured below: all twelve
  rectangles are recovered without touching it. Scale-dependence is real and it amplifies the defect
  this spec fixes, but it is not what refuses his rectangles, and a change with no measurable effect
  on the corpus is a change nothing can score.
- **Recognising anything that is not a rectangle or a line.** Circles, diamonds, cylinders and arrow
  heads stay unrecognised marks.
- **Recognising a shape drawn as several strokes.** Every container in the corpus is a single
  stroke; multi-stroke assembly is a different mechanism and would need its own evidence.
- **Handwriting recognition.** 269 of the 276 corpus strokes are handwritten letters. They must stay
  marks; nothing here tries to read them.
- **The connection tool and native-arrow impersonation** (finding F3), and **node header/body**
  (finding F4). Separate specs in the *iPad readiness* arc.

---

## Functional Requirements

### FR-001: A corner is the turn a person drew, not the wobble around it

#### Description:

`closedCorners` merges the turns inside one rounded corner and sums them. It sums `turnAngle`, which
returns a magnitude, so every tremor between two merged samples adds to the total instead of
cancelling against the tremor that follows it. The larger the stroke, the more samples survive
simplification inside one merge window, and the more inflated the corner. Sum the turns with sign,
and take the magnitude of the corner only once it is whole.

This is stated as an outcome on measured strokes rather than as a diff, so that a different
implementation satisfying it is allowed.

#### Acceptance Criteria:

- [ ] Each of the twelve corpus rectangles listed in *Data Model* reports exactly four corners.
- [ ] Each of the twelve has a mean corner error at or under 12° — measured today at 3°–11° with
      signed sums, against 16°–81° with magnitudes, so this criterion fails on the current code.
- [ ] No stroke in `src/shared/sketch/__fixtures__/strokes/` changes its verdict.
- [ ] A stroke traversed anticlockwise and the same stroke traversed clockwise get the same corner
      count and the same mean error.

### FR-002: A hand-drawn rectangle is accepted at the sizes a hand draws

#### Description:

With FR-001 alone, six of the twelve are accepted; the other six are refused by `MIN_BOX_FILL`, which
asks what fraction of its bounding box a closed path encloses. Real pencil rectangles bow, and fill
0.749–0.881 of their box. The threshold sits at 0.82 — inside that range, refusing half of them. It
was calibrated on mouse-drawn fixtures, which do not bow.

The threshold's other job is refusing a pentagon (0.683 on the fixture), and it must keep doing it.
What this FR forbids is a value chosen to fit the twelve with no room on either side: the margin is
part of the requirement, because the next rectangle he draws is not one of the twelve.

#### Acceptance Criteria:

- [ ] All twelve corpus rectangles are `box`.
- [ ] None of the other 264 corpus strokes is `box`.
- [ ] No stroke in `src/shared/sketch/__fixtures__/strokes/` changes its verdict.
- [ ] The distance from the accept/refuse boundary to the nearest **accepted** rectangle and to the
      nearest **refused** stroke are both recorded in a comment beside the constant, as numbers a
      reader can re-derive from the corpus report of FR-004.
- [ ] If the nearer of those two margins is under 0.02 in fill units, the spec's implementer says so
      out loud in the PR body rather than shipping the number silently — moving the constant is
      permitted, and pretending it is comfortable is not.

### FR-003: The fixture corpus contains strokes drawn by a pencil

#### Description:

Every one of the 24 fixtures was drawn by an agent through CDP-synthesised pen events. The file
header says so and names the limit: no hand jitter, no pressure. That is exactly the property that
made the classifier accept only tidy rectangles. `docs/corpus/` now holds 276 strokes from a real
pencil, and the labelled ones belong in the corpus the unit tests already read.

Extraction is scripted rather than hand-copied, so the labels can be re-derived and a reviewer can
check them against the drawing instead of trusting this spec.

#### Acceptance Criteria:

- [ ] `recognise.test.ts` reads pencil-drawn fixtures with no change to how it loads them.
- [ ] Every extracted fixture carries a `via` that identifies it as pencil-drawn and distinguishes it
      from the existing `cdp-pen` strokes.
- [ ] Extracted fixtures cover all three verdicts: the rectangles, at least three strokes that must
      be `line`, and at least six handwritten strokes that must be `none`.
- [ ] The extractor is re-runnable and rewrites the same files byte-for-byte from an unchanged
      corpus.
- [ ] Running the extractor with a label that does not match the recogniser's verdict fails loudly
      rather than writing a fixture asserting the wrong thing.

### FR-004: The whole corpus is measured, and the measurement is a gate

#### Description:

The 276 strokes are the only evidence in the repo about how this classifier behaves on a real hand,
and today nothing reads them. A change that improves the 24 fixtures while regressing the corpus is
invisible. This FR makes the corpus a scored population: a report that classifies all 276 and asserts
the counts.

The corpus is large; `docs/corpus/*.json` must be queried by the report, never read into a session's
context.

#### Acceptance Criteria:

- [ ] A test classifies all 276 corpus strokes and asserts the exact count of each verdict.
- [ ] The test fails when a rectangle stops being recognised, and fails when a stroke that is not one
      of the twelve becomes a `box`.
- [ ] The asserted numbers are recorded with the commit they were measured at.
- [ ] The report prints the per-refusal-reason breakdown, so a regression says which test refused the
      stroke rather than only that the count moved.
- [ ] The report runs in the normal `npm test` run and needs no network, no browser and no fixtures
      outside the repo.

### FR-005: Recognition does not eat the handwriting it is now surrounded by

#### Description:

`convertStroke` turns a stroke into a connection when its two ends resolve to two different nodes,
whatever the classifier said, gated only by `isPurposeful` for refused strokes. That override is
inert today because nothing on his canvas is a node. This spec's success is what arms it: twelve
containers appear, and 269 handwritten strokes sit inside and between them.

Measured against the corpus with those twelve as nodes, **three** strokes convert — 80, 188 and 259,
which are two orange arrows and a green one, exactly the marks the colour convention in
`docs/corpus/README.md` says are transfers and permissions. **None** of the 269 black strokes
converts. So this FR pins a result that already holds rather than demanding new behaviour, which is
the point: it is the assertion that goes red when a later change to the override starts eating
annotations.

#### Acceptance Criteria:

- [ ] With the twelve recognised rectangles as the only nodes on the page, replaying every corpus
      stroke through the client's conversion policy converts exactly the three named strokes.
- [ ] No black corpus stroke converts to a node or a connection.
- [ ] The test names the three converting strokes explicitly, so a change that converts a different
      three fails rather than passing on the count.
- [ ] The replay uses the same `nodeAtPoint` and conversion policy the runtime uses, not a
      reimplementation of them.

---

## Data Model

The twelve rectangles, by index into the `draw` shapes of
`docs/corpus/ipad-aws-2026-09-07.room.json` in document order. Labelled by eye from a rendered
contact sheet of all 276 strokes; a reviewer should re-render and check them rather than take them
on trust, and the extractor of FR-003 is what makes that cheap.

```ts
// src/shared/sketch/__corpus__/labels.ts
export const RECTANGLES = [0, 18, 54, 55, 67, 78, 84, 98, 162, 174, 207, 228] as const

// Strokes that must convert once the rectangles are nodes (FR-005). Orange and
// light-green in a corpus that is otherwise black: his own colour convention
// for a transfer and a permission.
export const ARROWS = [80, 188, 259] as const

export interface CorpusStroke {
  index: number
  points: Point[] // page space: decoded shape-local points plus shape.x/y
  colour: string
  bounds: { w: number; h: number }
}
```

Fixture files keep the shape `recognise.test.ts` already reads, with `via` widened:

```ts
// src/shared/sketch/__fixtures__/strokes/*.json
interface Stroke {
  name: string
  expect: 'box' | 'line' | 'none'
  why: string
  via: 'cdp-pen' | 'ipad-pencil'
  points: Array<{ x: number; y: number }>
}
```

---

## API / Interface Contract

`recognise` keeps its signature and its verdicts; this spec changes what it decides, never what it
returns.

```ts
// src/shared/sketch/recognise.ts — unchanged
recognise(points: readonly Point[]): Verdict

// src/shared/sketch/__corpus__/loadCorpus.ts — new
loadCorpus(): CorpusStroke[]   // decodes the room snapshot; no network, no editor
```

## Configuration / Environment

None. No new dependency, no new env var, no new script in `package.json` beyond what the extractor
of FR-003 needs to be invoked deliberately.

## File & Folder Structure

```
src/shared/sketch/
├── recognise.ts                    # FR-001, FR-002 — the only production change
├── recognise.test.ts               # unchanged loader; picks up the new fixtures
├── __corpus__/                     # new
│   ├── loadCorpus.ts               # decode the room snapshot
│   ├── labels.ts                   # RECTANGLES, ARROWS
│   └── corpus.test.ts              # FR-004 the scored population
└── __fixtures__/strokes/           # FR-003 adds ipad-pencil strokes here

scripts/
└── extract-corpus-fixtures.ts      # FR-003, run deliberately, not in CI

src/client/sketch/
└── recogniseOnDraw.test.ts         # FR-005 replay against the twelve nodes
```

## Implementation Phases

### Phase 1: The corpus becomes readable

- `loadCorpus.ts`: decode `docs/corpus/*.room.json` to page-space points via `b64Vecs.decodePoints`.
- `labels.ts` with `RECTANGLES` and `ARROWS`.
- The FR-004 report, asserting **today's** numbers first, so the fix is scored by moving them.

### Phase 2: The corner fix

- Signed turn summation in `closedCorners`; magnitude taken once per merged corner.
- Re-derive the comments on `MAX_MEAN_CORNER_ERROR` and `CORNER_MERGE_FRACTION`, which describe the
  behaviour of the code being replaced.
- Update the FR-004 assertions to the new counts.

### Phase 3: The rectangle test

- Move the accept/refuse boundary with the margins of FR-002 measured and recorded beside it.
- Re-derive the `MIN_BOX_FILL` comment: its pentagon reasoning survives, its numbers do not.

### Phase 4: Pencil fixtures

- The extractor, its verdict check, and the extracted fixtures.
- Widen `via` and correct the `recognise.test.ts` header, which currently tells the reader every
  fixture is CDP-drawn.

### Phase 5: The override guard

- Replay corpus strokes through `convertStroke` with the twelve rectangles as nodes.
- Correct `docs/handoff/2026-09-08-ipad-findings.md` §F1, whose stated mechanism this spec
  disproves — leaving it would send the next session after `SIMPLIFY_EPSILON`.
