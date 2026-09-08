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
as **magnitudes**, so a hand's tremor along an edge adds to the corner instead of cancelling against
the tremor that follows it. Each of his rectangles has one corner reading between 119° and 285°
where he drew 90°. Every one of them is closed, and every one has exactly four corners; eleven of
the twelve are refused for not being *square enough*, by a test that is measuring his shakiness
rather than his corners. (The twelfth, stroke 54, clears squareness and is refused one test later,
on fill.) Summing the same turns **with sign** puts all twelve between 3° and 17° of square.

## Scope

### In Scope

- Summing corner turns with sign, so a corner measures the turn a person drew.
- Trimming a stroke's overshoot from **both** ends. Overshoot trimming is directional today, which
  is invisible while these strokes are refused in both directions and becomes a verdict difference
  the moment they are accepted — see FR-001.
- Making the rectangle test admit a hand-drawn rectangle at the sizes he draws at, with a stated
  margin on both sides rather than a threshold that happens to fit.
- A real-pencil fixture path: strokes from `docs/corpus/` promoted into the fixture corpus that
  `recognise.test.ts` already reads, carrying their own provenance.
- A whole-corpus measurement that fails when the numbers move, so the next change to the classifier
  is scored against 276 real strokes rather than 24 synthetic ones.
- The regression this spec's own success creates: once boxes become nodes, a stroke with an end in
  two different nodes converts regardless of shape, and handwriting sits among nodes.

### Out of Scope

- **Changing `SIMPLIFY_EPSILON` or normalising strokes by scale.** Not merely unnecessary —
  measured harmful. All twelve rectangles are recovered without touching it, and normalising each
  stroke to a common diagonal *on top of* this spec's fix adds 3–6 false positives (18 boxes at
  target 300, 15 at 500 and at 800) while recovering no rectangle that is not already found. Scale
  dependence is real and it amplifies the defect this spec fixes — a larger stroke keeps more sample
  points inside one corner-merge window, so more tremor accumulates — but it is a symptom's
  amplifier, not the cause, and normalisation is the wrong repair.
- **Recognising anything that is not a rectangle or a line.** Circles, diamonds, cylinders and arrow
  heads stay unrecognised marks.
- **Recognising a shape drawn as several strokes.** Every container in the corpus is a single
  stroke; multi-stroke assembly is a different mechanism and would need its own evidence.
- **Handwriting recognition.** The great majority of the 264 non-rectangle strokes are handwritten
  letters. They must stay marks; nothing here tries to read them.
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

That change alone exposes a second, older defect. **SPEC-010 FR-001 guarantees a verdict is stable
under reversal and rotation**, and `recognise.test.ts` asserts it per fixture. `trimOvershoot` scans
forward only, so a stroke reversed carries its overshoot at the head where nothing removes it. Today
that is invisible, because the affected strokes are refused in both directions; the moment they are
accepted it becomes a verdict difference, and strokes 84, 98 and 162 are `box` forward and `none`
reversed. Trimming from both ends restores the guarantee. This spec must not weaken it.

Stated as outcomes on measured strokes rather than as a diff, so a different implementation
satisfying them is allowed.

#### Acceptance Criteria:

- [ ] Each of the twelve corpus rectangles listed in *Data Model* reports exactly four corners.
- [ ] Each of the twelve has a mean corner error under `MAX_MEAN_CORNER_ERROR`. Measured today at
      16.2°–81.3°, so eleven of the twelve fail this on the current code; measured 3.2°–16.3° after
      the change.
- [ ] Every one of the twelve gets the **same verdict** traversed forwards and traversed backwards.
      Three of them (84, 98, 162) do not, once corners are summed with sign and overshoot is trimmed
      forward-only — so this criterion fails on the naive fix as well as on the current code.
- [ ] The mean corner error of each of the twelve differs by no more than 10° between the two
      traversal directions. Measured worst case 7.6°.
- [ ] No stroke in `src/shared/sketch/__fixtures__/strokes/` changes its verdict, and
      `recognise.test.ts`'s existing reversal and rotation stability tests stay green.

### FR-002: A hand-drawn rectangle is accepted at the sizes a hand draws

#### Description:

With FR-001 alone, six of the twelve are accepted; the other six are refused by `MIN_BOX_FILL`, which
asks what fraction of its bounding box a closed path encloses. Real pencil rectangles bow, and the
lowest of the twelve encloses 0.7552 of its box. The threshold sits at 0.82 — inside that range,
refusing half of them. It was calibrated on mouse-drawn fixtures, which do not bow.

The threshold's other job is refusing a pentagon, and it must keep doing it: `refuse-pentagon`
measures 0.6838. So the admissible band is **(0.6838, 0.7552]**, and what this FR forbids is a value
picked at either edge of it.

The band's honest reading is narrower than it looks, and the implementer must record why. Nine
strokes sit **above** any threshold in that band and are refused by other tests, not by fill — the
nearest being corpus stroke 248 at 0.7538, an 'O' refused on squareness, and `refuse-l-shape` and
`refuse-bad-box` at 0.744 and 0.743, both refused on corner count. Below roughly 0.75 the fill test
is no longer what separates a rectangle from a circle; `MAX_MEAN_CORNER_ERROR` and
`CORNER_TOLERANCE` are. A margin quoted in fill units alone will read comfortable while that is
true.

#### Acceptance Criteria:

- [ ] All twelve corpus rectangles are `box`.
- [ ] None of the other 264 corpus strokes is `box`.
- [ ] No stroke in `src/shared/sketch/__fixtures__/strokes/` changes its verdict.
- [ ] The chosen threshold is at least 0.02 in fill units below the lowest **accepted** rectangle and
      at least 0.02 above the highest stroke **refused by the fill test itself**. Both numbers are
      recorded in the comment beside the constant.
- [ ] That comment also names the strokes sitting above the threshold that are refused by a
      *different* test, and which test refuses each — so the next person to loosen a corner
      constant can see what it was holding.

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
- [ ] Every extracted fixture carries a `via` identifying it as pencil-drawn, and the existing
      assertion that every fixture is `cdp-pen` (`recognise.test.ts`, the `via` expectation) is
      widened rather than deleted.
- [ ] Extracted fixtures cover all three verdicts: the rectangles, at least three strokes that must
      be `line`, and at least six handwritten strokes that must be `none`.
- [ ] The extractor is re-runnable and rewrites the same files byte-for-byte from an unchanged
      corpus.
- [ ] Running the extractor with a label that does not match the recogniser's verdict fails loudly
      rather than writing a fixture asserting the wrong thing.

### FR-004: The whole corpus is measured, and the measurement is a gate

#### Description:

The 276 strokes are the only evidence in the repo about how this classifier behaves on a real hand,
and today nothing reads them — nothing in `src/` or `e2e/` references `docs/corpus`. A change that
improves the 24 fixtures while regressing the corpus is invisible. This FR makes the corpus a scored
population: a report that classifies all 276 and asserts the counts.

The corpus is large; `docs/corpus/*.json` must be queried by the report, never read into a session's
context.

#### Acceptance Criteria:

- [ ] A test classifies all 276 corpus strokes and asserts the exact count of each verdict.
- [ ] The test fails when a rectangle stops being recognised, and fails when a stroke that is not one
      of the twelve becomes a `box`.
- [ ] The asserted numbers are recorded with the commit they were measured at.
- [ ] The report prints the per-refusal-reason breakdown and the per-stroke fill of every stroke that
      reaches the fill test, so FR-002's margins are re-derivable from its output.
- [ ] The report runs in the normal `npm test` run and needs no network, no browser and no fixtures
      outside the repo.

### FR-005: Recognition does not eat the handwriting it is now surrounded by

#### Description:

`convertStroke` turns a stroke into a connection when its two ends resolve to two different nodes,
whatever the classifier said, gated only by `isPurposeful` for refused strokes. That override is
inert today because nothing on his canvas is a node. This spec's success is what arms it: twelve
containers appear, and the drawing's handwriting sits inside and between them.

Measured against the corpus with those twelve as nodes, **three** strokes convert — 80, 188 and 259,
which are two orange arrows and a green one, exactly the marks the colour convention in
`docs/corpus/README.md` says are transfers and permissions. No other stroke converts. So this FR
pins a result that already holds rather than demanding new behaviour, which is the point: it is the
assertion that goes red when a later change to the override starts eating annotations.

It does not hold on `main` — with nothing recognised there are no nodes and nothing converts — so it
is a criterion this spec makes true, not one it inherits.

#### Acceptance Criteria:

- [ ] With the twelve recognised rectangles as the only nodes on the page, replaying every corpus
      stroke through the client's conversion policy converts exactly strokes 80, 188 and 259.
- [ ] No corpus stroke **other than the twelve rectangles** becomes a node, and no stroke other than
      those three becomes a connection.
- [ ] The test names the three converting strokes explicitly, so a change that converts a different
      three fails rather than passing on the count.
- [ ] The replay calls the **same** policy function the runtime calls, not a copy of it. No unit
      test in this repo drives a live tldraw `Editor` (`App.test.tsx` states why), so extracting
      that policy out of `convertStroke` into a pure, editor-free function — verdict, purposefulness
      and two resolved node ids in, a decision out — is in scope, and `convertStroke` must then call
      it rather than restating it.

---

## Data Model

The twelve rectangles, by index into the `draw` shapes of
`docs/corpus/ipad-aws-2026-09-07.room.json` **in the order they appear in the file's `documents`
array** — not the order of the shapes' fractional `index` props, which disagrees at every position.
Labelled by eye from a rendered contact sheet of all 276 strokes; a reviewer should re-render and
check them rather than take them on trust, and the extractor of FR-003 is what makes that cheap.

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
// src/shared/sketch/recognise.ts — unchanged signature
recognise(points: readonly Point[]): Verdict

// src/shared/sketch/__corpus__/loadCorpus.ts — new, test-only
loadCorpus(): CorpusStroke[]   // decodes the room snapshot; no network, no editor

// src/client/sketch/convertPolicy.ts — new, extracted from convertStroke (FR-005)
shouldConnect(verdict: Verdict, purposeful: boolean, fromId: string, toId: string): boolean
```

## Configuration / Environment

None. No new dependency, no new env var, and no new `package.json` script beyond the one the FR-003
extractor needs to be invoked deliberately.

## File & Folder Structure

`__corpus__` is **test-only**, exactly as `__fixtures__` is: it reads from `docs/` with `node:fs`
and must never be imported by `src/client` or `src/worker`, which would break CLAUDE.md's
runtime-agnostic rule for `src/shared`. A test asserts that no file outside `__corpus__` imports it.

```
src/shared/sketch/
├── recognise.ts                    # FR-001, FR-002 — the only production change here
├── recognise.test.ts               # unchanged loader; picks up the new fixtures
├── __corpus__/                     # new, test-only
│   ├── loadCorpus.ts               # decode the room snapshot
│   ├── labels.ts                   # RECTANGLES, ARROWS
│   └── corpus.test.ts              # FR-004 the scored population
└── __fixtures__/strokes/           # FR-003 adds ipad-pencil strokes here

src/client/sketch/
├── convertPolicy.ts                # FR-005, extracted from convertStroke
├── recogniseOnDraw.ts              # calls it rather than restating it
└── convertPolicy.test.ts           # FR-005 replay against the twelve nodes

scripts/
└── extract-corpus-fixtures.ts      # FR-003, run deliberately, not in CI
```

## Implementation Phases

### Phase 1: The corpus becomes readable

- `loadCorpus.ts`: decode `docs/corpus/*.room.json` to page-space points via `b64Vecs.decodePoints`.
- `labels.ts` with `RECTANGLES` and `ARROWS`; the import guard described above.
- The FR-004 report, asserting **today's** numbers first, so the fix is scored by moving them.

### Phase 2: The corner fix and the trim it exposes

- Signed turn summation in `closedCorners`; magnitude taken once per merged corner.
- Symmetric overshoot trimming, and the FR-001 reversal criteria that pin it.
- Re-derive the comments on `MAX_MEAN_CORNER_ERROR`, `CORNER_MERGE_FRACTION` and
  `CLOSING_TRAVEL_FRACTION`, which describe the behaviour of the code being replaced.
- Update the FR-004 assertions to the new counts.

### Phase 3: The rectangle test

- Move the accept/refuse boundary with FR-002's margins measured and recorded beside it, including
  the strokes above it that other tests refuse.
- Re-derive the `MIN_BOX_FILL` comment: its pentagon reasoning survives, its numbers do not.

### Phase 4: Pencil fixtures

- The extractor, its verdict check, and the extracted fixtures.
- Widen `via`, and correct `recognise.test.ts`'s header — which currently tells the reader every
  fixture is CDP-drawn — alongside the assertion that enforces it.

### Phase 5: The override guard

- Extract the conversion policy; have `convertStroke` call it; replay the corpus against the twelve.
- Correct `docs/handoff/2026-09-08-ipad-findings.md` at **both** sites that state the F1 mechanism —
  §2's F1 entry and §5's "things not to redo". §5's other claim, that scale-normalisation alone
  moved the corpus from 1 box to 8, is true and stays; only the attribution of the cause is wrong.
