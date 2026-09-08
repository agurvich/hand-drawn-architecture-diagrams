# Spec: Recognition that works on a real hand

**ID:** SPEC-017
**Status:** In Progress
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
the tremor that follows it. Each of his rectangles has one corner reading between 118.5° and 284.9°
where he drew 90°. Every one of them is closed, and every one has exactly four corners. **Ten** of
the twelve are refused for not being *square enough*, by a test that is measuring his shakiness
rather than his corners; stroke 54 clears squareness and is refused one test later on fill; and
stroke 67 is the single box the whole session produced. Summing the same turns **with sign** puts
all twelve between 3.2° and 16.3° of square.

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
      16.2°–81.3°, so ten of the twelve fail this on the current code; measured 3.2°–16.3° after
      the change.
- [ ] Every one of the twelve is `box` in **all five orientations** the existing suite checks a
      rectangle in: as drawn, reversed, and started from three other points on its own perimeter.
      Three of them (84, 98, 162) fail *reversed* once corners are summed with sign and overshoot is
      still trimmed forward-only, and stroke 55 fails one *rotation* if the head trim is allowed to
      cut an edge — so this criterion fails on the current code and on two plausible fixes.
- [ ] The mean corner error of each of the twelve differs by no more than 10° between the two
      traversal directions. Measured worst case 7.6°.
- [ ] No stroke in `src/shared/sketch/__fixtures__/strokes/` changes its verdict, and
      `recognise.test.ts`'s existing reversal and rotation stability tests stay green — including
      once FR-003 adds the pencil rectangles to the population they run over.

### FR-002: A hand-drawn rectangle is accepted at the sizes a hand draws

#### Description:

With FR-001 alone, six of the twelve are accepted; the other six are refused by `MIN_BOX_FILL`, which
asks what fraction of its bounding box a closed path encloses. Real pencil rectangles bow, and the
lowest of the twelve encloses 0.7552 of its box. The threshold sits at 0.82 — inside that range,
refusing half of them. It was calibrated on mouse-drawn fixtures, which do not bow.

The threshold's other job is refusing a pentagon, and it must keep doing it: `refuse-pentagon`
measures 0.6838.

**The margin must be measured across all five orientations, not on the stroke as drawn.** Fill is
rotation-sensitive at the ±0.05 level, because rotating a loop changes where overshoot trimming cuts
it. Stroke 54 as drawn measures 0.7552, which makes 0.72 look comfortable; stroke 55 started from
its own midpoint measures **0.7144**, which makes 0.72 wrong. So the admissible band is
**(0.6838, 0.7144]** — 0.031 wide, narrower than fill's own rotational noise. A threshold quoted
against the forward stroke alone will read comfortable while being false.

Below roughly 0.75 the fill test is no longer what separates a rectangle from a rounded 'O';
`MAX_MEAN_CORNER_ERROR` and `CORNER_TOLERANCE` are. Fill's remaining job is the pentagon.

#### Acceptance Criteria:

- [ ] All twelve corpus rectangles are `box`.
- [ ] None of the other 264 corpus strokes is `box`.
- [ ] No stroke in `src/shared/sketch/__fixtures__/strokes/` changes its verdict.
- [ ] The chosen threshold is at least 0.01 in fill units below the **lowest fill any of the twelve
      reaches in any of the five orientations**, and at least 0.01 above the highest stroke refused
      by the fill test itself. Both numbers, and the orientation the low one came from, are recorded
      in the comment beside the constant. Measured: 0.7144 (stroke 55, rotated to its own midpoint)
      and 0.6838 (`refuse-pentagon`), which a threshold of 0.70 clears by 0.0144 and 0.0162.
- [ ] That comment states that the band is narrower than fill's rotational noise, so the next person
      to move it knows the margin is thin by nature and not by choice.

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
- [ ] Fixture names keep the prefixes the existing suite selects on: the rectangles are named
      `box-…`, so `recognise.test.ts`'s rotation-stability suite — which filters on that prefix —
      runs over them. Naming them anything else would silently exempt real pencil rectangles from a
      SPEC-010 guarantee, which FR-001 forbids. The prefix must be on the JSON **`name` field**,
      which is what the suite filters, as well as on the filename: a file called
      `box-pencil-054.json` whose `name` reads anything else is exempt, silently.
- [ ] Extracted fixtures cover all three verdicts: the rectangles, at least three strokes that must
      be `line`, and at least six handwritten strokes that must be `none`.
- [ ] The extractor is re-runnable and rewrites the same files byte-for-byte from an unchanged
      corpus, and its output passes `prettier --check` unchanged.
- [ ] Points are rounded to the precision the existing fixtures use, and the verdict check runs on
      the **rounded** points, so a fixture always describes the stroke actually written to the file.
- [ ] Each fixture's `why` is authored, not generated — `recognise.test.ts` requires a real
      sentence — and the extractor refuses an index that has no note rather than emitting a
      placeholder.
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
- [ ] The asserted numbers name the **corpus file** they were measured from — the corpus is frozen,
      so it is the half of the pair that can be named — and say that `git log -p` on the report is
      the record of when each number changed and why. A commit cannot name its own sha, and the
      numbers a phase pins are only true *after* that phase's change, so naming a parent commit
      would be wrong at every re-pin.
- [ ] The report emits the per-refusal-reason breakdown and, for each stroke that reaches the fill
      test, its fill in **all five orientations** together with the minimum of them — so FR-002's
      margins are re-derivable from its output. A forward-only fill column does not satisfy this:
      FR-002's low margin is 0.7144, which stroke 55 reaches only when rotated, and a reviewer
      handed forward fills could tick the criterion while the number justifying the threshold is
      absent. Vitest's default reporter swallows `console.log` from a passing test, so the report
      writes to stdout directly or to a file.
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
      that policy out of `convertStroke` into a pure, editor-free function is in scope, and
      `convertStroke` must then call it rather than restating it. Its node parameters are
      `string | undefined`: "no node under that end" is the common case and the main reason the
      override does not fire, and a signature that cannot express it pushes half the policy back to
      the call site.
- [ ] Resolving *which* node is under a point stays outside that function. The replay supplies node
      rectangles directly and stands in for `getShapeAtPoint({ hitInside: true })` with innermost
      containment; the test says so in a comment, because that part is a stand-in and the e2e from
      SPEC-010 is what covers the real hit test.

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

// ...plus ONE new export. FR-001 and FR-002 are stated in corner counts, mean
// corner error and fill, none of which `Verdict` carries and all of which are
// computed inside `recognise` from private helpers. A report that recomputed
// them would be a copy that drifts from the thing it claims to measure, so
// `recognise` and this share one implementation.
measure(points: readonly Point[]): Measurement | undefined // undefined if not closed

interface Measurement {
  corners: number
  meanCornerError: number
  fill: number // undefined-ish cases excluded: only set once the fill test is reached
}

// src/shared/sketch/__corpus__/loadCorpus.ts — new, test-only
loadCorpus(): CorpusStroke[]   // decodes the room snapshot; no network, no editor

// src/client/sketch/convertPolicy.ts — new, extracted from convertStroke (FR-005)
//
// A discriminated result, not a boolean. "No node under that end" is the common
// case, so the ids are optional -- and a bare boolean leaves the caller to
// re-narrow them, which is half the policy restated at the call site. A type
// predicate cannot do it either: a predicate narrows one parameter, and this
// decision is about two.
type Connection =
  | { connect: true; fromId: string; toId: string }
  | { connect: false }

shouldConnect(
  verdict: Verdict,
  purposeful: boolean,
  fromId: string | undefined,
  toId: string | undefined,
): Connection
```

## Configuration / Environment

None. No new dependency, no new env var, and no new `package.json` script beyond the one the FR-003
extractor needs to be invoked deliberately.

## File & Folder Structure

`__corpus__` is **test-only**: it reads from `docs/` with `node:fs`, and CLAUDE.md's
runtime-agnostic rule for `src/shared` is about code that ships to the client and the worker.
`src/shared/shapes/shared-imports.test.ts` enforces that rule today with a hardcoded exemption for
`src/shared/shapes/__fixtures__`, so **it must be widened in the same commit that adds
`__corpus__`** or Phase 1 lands red. The guard this spec adds is the narrower one: no file that
ships — anything that is not a test and not the extractor — may import `__corpus__`. FR-005's
replay is a test and imports it legitimately.

The extractor is a deliberately-run **vitest** tool rather than a `scripts/*.ts` file, following
`playwright.capture.ts`'s precedent for a harness that is not part of the normal run. A bare `.ts`
under `scripts/` is covered by no tsconfig here and is `.prettierignore`d, so a type error in it is
invisible to every gate; it also would not run at all on Node 22.12–22.17, which `package.json`
admits, since unflagged type stripping arrives in 22.18.

```
src/shared/sketch/
├── recognise.ts                    # FR-001, FR-002 — the only production change here
├── recognise.test.ts               # unchanged loader; picks up the new fixtures
├── __corpus__/                     # new, test-only
│   ├── loadCorpus.ts               # decode the room snapshot
│   ├── labels.ts                   # RECTANGLES, ARROWS, and each fixture's `why`
│   ├── corpus.test.ts              # FR-004 the scored population
│   └── extract.tool.test.ts        # FR-003, run deliberately, excluded from the normal run
└── __fixtures__/strokes/           # FR-003 adds box-/line-/refuse- pencil strokes here

src/shared/shapes/
└── shared-imports.test.ts          # exemption widened for __corpus__ (Phase 1)

src/client/sketch/
├── convertPolicy.ts                # FR-005, extracted from convertStroke
├── recogniseOnDraw.ts              # calls it rather than restating it
└── convertPolicy.test.ts           # FR-005 replay against the twelve nodes
```

## Implementation Phases

### Phase 1: The corpus becomes readable

- `loadCorpus.ts`: decode `docs/corpus/*.room.json` to page-space points via `b64Vecs.decodePoints`.
- `labels.ts` with `RECTANGLES` and `ARROWS`; the import guard described above; and the widening of
  `shared-imports.test.ts`, without which this phase is red.
- The FR-004 report, asserting **today's** numbers first, so the fix is scored by moving them. Those
  first numbers are a baseline, not the FR-004 deliverable — FR-004's criterion about a rectangle
  regressing cannot bite at Phase 1, where eleven of twelve are already unrecognised. The report is
  re-pinned at the end of Phase 2 and again at the end of Phase 3.

### Phase 2: The corner fix and the trim it exposes

- Signed turn summation in `closedCorners`; magnitude taken once per merged corner.
- Symmetric overshoot trimming, and the FR-001 reversal criteria that pin it. Note the ordering:
  with `MIN_BOX_FILL` still at 0.82 only stroke 162 shows the reversal split — 84 and 98 are refused
  in both directions until Phase 3 moves the threshold — so this phase's reversal evidence is
  partial by construction, and FR-001's criteria only bite in full after Phase 3.
- The `measure` export the report needs, sharing one implementation with `recognise`.
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
- Correct `docs/handoff/2026-09-08-ipad-findings.md` at **three** sites that state or assume the F1
  mechanism: §2's F1 entry, §5's "things not to redo", and §3's proposed-work row, which titles this
  work "Recognition that works at any scale" — the phrasing this spec's Out of Scope rejects. §5's
  other claim, that scale-normalisation alone moved the corpus from 1 box to 8, is true and stays;
  only the attribution of the cause is wrong.
