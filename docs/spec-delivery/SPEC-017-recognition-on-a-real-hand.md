# Completed Spec — SPEC-017: Recognition that works on a real hand

## What was completed?

Sketch recognition now accepts a rectangle drawn by a hand. Against the 276 pencil strokes in
`docs/corpus/`, the twelve rectangles are all recognised where one was, with no false positive among
the other 264 and no change to any pre-existing fixture verdict.

- `recognise.ts` — corner turns summed with **sign** (`turnAngle`), magnitude taken once per merged
  corner; overshoot trimmed at both ends (`trimBothEnds`); `MIN_BOX_FILL` 0.82 → 0.70 with a second,
  higher bar (`MIN_BOX_FILL_WITHOUT_FOUR_CORNERS`) for a shape `CORNER_TOLERANCE` admitted without
  four corners; one new export, `measure()`, so the report and the classifier share one
  implementation of the numbers.
- `src/shared/sketch/__corpus__/` — `loadCorpus`, `labels` (`RECTANGLES`, `ARROWS`, `LINES`,
  `MARKS`, `NOTES`), `corpus.test.ts` (the scored population), `extract.tool.test.ts` (the fixture
  extractor, inert unless `EXTRACT_FIXTURES` is set).
- `src/client/sketch/convertPolicy.ts` — `shouldConnect`, lifted out of `convertStroke` so the
  connection override can be replayed against the corpus without a live editor.
- 21 new fixtures in `__fixtures__/strokes/`, drawn on the target device with a pencil, named
  `box-`/`line-`/`refuse-pencil-NNN`.

### Deliberate deviations

- **The spec's own diagnosis in the handoff was contradicted, not implemented.**
  `docs/handoff/2026-09-08-ipad-findings.md` recorded scale-dependent tolerances as the mechanism.
  `SIMPLIFY_EPSILON` is untouched: all twelve are recovered without it, and normalising strokes by
  scale *on top of* this fix adds 3–6 false positives. The handoff carries a superseded marker at
  all three sites that stated or assumed the old mechanism.
- **`shouldConnect` is generic over the id type**, not `string | undefined` as the spec's contract
  first said. A bare `string` loses tldraw's branded `TLShapeId` and pushes a cast to the call site.
- **The corpus report prints the rows that decide the margins**, not every stroke reaching the fill
  test — ~250 extra rows in every `npm test` run buried it. `CORPUS_REPORT=full` prints them all.

## What changed from earlier specs?

- **SPEC-010's classifier changes verdicts.** Same signature, same three verdicts; what it decides
  is different. Its stability guarantee (FR-001, verdicts stable under reversal and rotation) is
  preserved and is now the *only* thing pinning `trimBothEnds` — the whole-corpus tally and the 24
  original fixtures are identical with overshoot trimmed forward-only.
- **`convertStroke` no longer states the connection rule**; it calls `shouldConnect`. Behaviour is
  unchanged.
- **`shared-imports.test.ts`** exempts `sketch/__corpus__` from the `src/shared` import fence, inside
  the import loop only — `sourceFiles()` also feeds the shape-type-literal check. `corpus.test.ts`
  carries the narrower guard that pays for the exemption.
- **`recognise.test.ts`** types `via` as a union (it was `string`) and its header no longer tells the
  reader every fixture was agent-drawn.
- **`CLAUDE.md`** lost the tldraw 5.x-vs-4.x and `@tldraw/store`-range rationale to
  `decisions.md` → *Canvas SDK: tldraw*; it was the only home of those facts, which the digest rule
  forbids. Recorded beside `CLAUDE_MAX_BYTES` in `scripts/docs-lint.sh`.

## Known constraint, carried forward

**`MIN_BOX_FILL`'s margin is narrower than its own measurement noise.** Fill swings ~±0.05 with the
point a stroke was started from, and the band between `refuse-pencil-055` rotated (0.7144) and
`refuse-pentagon` (0.6838) is 0.031 wide. 0.70 clears both by ~0.015. It holds for every stroke
measured, and the next rectangle a person draws could land under it. The durable repair is a
rectangle test that is not area-fill; it wants its own evidence and its own spec.

**Refusal is silent, and `MIN_BOX_EXTENT` is in page units.** At 8× zoom a screen-filling gesture is
~42×37 page units and is refused as too small to be a usable node, with no feedback. The constant
predates this spec and the silence is deliberate ("nothing is the default"), but before this spec
nothing converted at any zoom, so this is newly reachable. Recorded in the handoff for the drawing-path
spec rather than changed here.

**The twelve labels are human judgement.** Nothing derives them and no test checks them. A
mislabelled stroke tunes the classifier at the wrong target, silently — see `decisions.md` → *A
classifier is scored against a labelled population*.

## Verification

Local: `npm run build`, `npm test` (551 passed, 1 skipped), `npm run lint` (4 pre-existing
warnings), `npm run format:check`, `spec-lint.sh`, `docs-lint.sh`, `docs-lint-test.sh` (44 cases).

Every threshold this spec sets or moves is fenced in both directions, checked by moving it: `MIN_BOX_FILL`
(0.68 and 0.72 both redden), `MIN_BOX_FILL_WITHOUT_FOUR_CORNERS` (0.74 and 0.85), and
`MAX_MEAN_CORNER_ERROR` (19 and 30). The five-orientation criteria were verified by planting the
regressions they exist to catch: forward-only trimming reddens `corpus#84` reversed, `MIN_BOX_FILL
= 0.72` reddens `corpus#55` rotated, and dropping the second fill bar reddens strokes 199, 248 and
274 rotated. The extractor's refusals and the `__corpus__` import guard each ship planted violations and
silence cases rather than being run only over a repo that happens to pass.
