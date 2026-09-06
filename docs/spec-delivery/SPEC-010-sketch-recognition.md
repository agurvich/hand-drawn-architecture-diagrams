# Completed Spec — SPEC-010: Sketch to clean shape

## What was completed?

Turn recognition on and draw a rough box with the pencil: you get a real `diagramNode` that nests,
collapses, connects and exports. Draw from one node to another and you get a real connection.

- `src/shared/sketch/recognise.ts` — the pure classifier (`recognise`, `simplify`, `trimOvershoot`,
  `isPurposeful`) and nine named tolerances.
- `src/shared/sketch/__fixtures__/strokes/` — 21 recorded strokes with expected verdicts.
- `e2e/tools/capture-strokes.spec.ts` + `playwright.capture.ts` — the capture harness, which had to
  be built; nothing wrote a real stroke to a file before.
- `src/shared/sketch/mode.ts` — the session-scoped `diagramSketchMode` record.
- `src/client/sketch/sketchMode.ts`, `src/client/sketch/recogniseOnDraw.ts`,
  `src/client/panels/SketchToggle.tsx`.

### Deliberate deviations

- **The node-pair override outweighs a REFUSAL, not only a box verdict.** The spec's motivating
  example is a connection routed around an obstacle, and it assumed that path reads as a box. Half
  the time it does not: right-down-right that does not return to its start is *open* and refused for
  deviation. An override that only beat a box verdict left the motivating case unconverted. It is
  gated on a second pure predicate, `isPurposeful` — a stroke no longer than 2.5× the straight run
  between its ends went somewhere; a scribble across the same two nodes did not.
- **A second, unspecified half to "the mode does not sync."** See below.

## What changed from earlier specs?

- **`src/shared/scenes/index.ts` now registers a record that lives in `src/shared/sketch/`.** One
  registry, deliberately: a second one is how the client and the worker come to disagree about the
  schema, which is the failure the whole client/worker duality exists to prevent.
- `shared-imports.test.ts` gained `'diagramSketchMode'` and the new definition module.
- `playwright.config.ts` gained `testIgnore: '**/tools/**'`.

## Verification

314 unit + 188 e2e green locally, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

**Ten tolerance constants, each pinned by a fixture that isolates it.** That took four rounds. The
first corpus left four of five free to be mutated to nonsense with the suite still green, because
each of those strokes was being refused by some *other* test — `refuse-l-shape` (only the corner
count), `refuse-tiny-box` (only the size), `refuse-tiny-flick` (only `MIN_STROKE_EXTENT`),
`refuse-bowed-line` (only the deviation test; a zigzag was caught by backtrack instead and left the
constant unpinned). A review then found `CLOSE_FRACTION` still free in the loosening direction, and
two comments crediting the wrong fixture — `MAX_MEAN_CORNER_ERROR` is pinned by `refuse-spiral` and
`refuse-triangle`, not `refuse-bad-box`, which is refused on its corner count. Both comments now say
what was measured.

**`MIN_BOX_FILL` was added because a pentagon was a node.** Five corners of about 72° is inside
`MAX_MEAN_CORNER_ERROR`, and `CORNER_TOLERANCE` admits five because real hand-drawn boxes sometimes
simplify to five — so every corner test passed a house, an arrow head or a cloud outline. A
rectangle fills its bounding box; a pentagon fills about three quarters. That is the property that
actually distinguishes them, and the corner tests cannot express it.

**Eight conversion mutations, all caught**, including the two that were real defects the e2e found
rather than confirmed:

| Mutation | Caught by |
| --- | --- |
| The `source !== 'user'` guard removed | the two-client mode test |
| Containment relaxed to overlap | the clipped-sibling test |
| Innermost container swapped for outermost | the nested-containers test |
| The page `parentId` omitted on the no-container path | the collapsed-container test |
| `MIN_BOX_FILL` relaxed | the pentagon tests |
| The state text left in the accessible name | the WCAG 2.5.3 test |
| The `isPurposeful` gate removed | the scribble-across-two-nodes test |
| The node-pair override removed | the routed-connection test |
| The mode defaulting to on | four tests |
| `markHistoryStoppingPoint` removed | the single-undo test |
| A collapsed container accepting children | the collapsed-container test |
| Page coordinates used as parent-local | the nested-box page-position test |
| The completion EDGE weakened to the completed state | the already-on-the-canvas test |

**A defect the review found that the e2e could not: the two-client test was incapable of failing.**
It asserted ~120ms after the stroke, and the failure it guards against is three hops — B draws, A
receives, A converts, the node syncs back. Removing the guard left it green. It now waits on A's own
view as a barrier, and the mutation kills two tests.

**Nesting was wrong in the ordinary case.** `containerFor` hit-tested four corners and required the
same answer at each; `nodeAtPoint` returns the *topmost* shape, so a box overlapping a sibling
already in the container got a different answer at one corner and fell through to "no container" —
and tldraw's own new-shape heuristic then adopted it into the sibling. A 200×120 node created as a
child of a 120×80 one, with the wrong collapse, merge and export behaviour following from it. It
now takes the innermost node whose bounds *contain* the box, which is the question actually being
asked, and the no-container path names the page explicitly so the heuristic cannot re-adopt it.

**Two defects the e2e found, not confirmed:**

*The mode was per-viewer in name only.* The session-scoped record keeps the SETTING local. It does
not keep the EFFECT local: a stroke arriving over the wire is a shape change like any other, so a
client with recognition on converted a stroke somebody else had just drawn, and the node synced
back — the second person watching their sketch become a rectangle having enabled nothing. Fixed with
a `source !== 'user'` guard in the change handler.

*The routed-connection case did not work at all.* Covered above under deviations.

**Honest limit on the corpus, recorded per fixture in a `via` field:** these are CDP-synthesised pen
events, not a pencil on glass, because the app renders blank on iPad (`architecture.md`, open
defect). They give up pressure and true timing.

The first version gave up more than that, and a review caught it: the harness dispatched one pointer
event per authored waypoint, so tldraw had nothing to smooth and every fixture came back
**byte-identical to the polyline in the harness source**. A corpus like that tests the encoder. The
harness now interpolates each gesture to roughly one sample every 4px and jitters each by up to
~1.4px from a seeded generator — deterministic, so a re-capture reproduces the corpus rather than
silently re-tuning it. The fixtures went from ~200 points total to ~2,500, and the classifier
passes against both, which is the evidence that the tolerances were not fitted to the sparse case.

**The re-entrancy flag was removed rather than kept**: it never fired. The handler runs inside the
store's atomic flush, so a nested `editor.run` queues its events for the *next* iteration of the
flush loop, by which time the flag has been reset. What actually stops recursion is the type check —
the conversion creates a node or a connection, never a `draw`. Removing it changed no test, which is
how it was found; the comment there now says what holds instead of what was assumed.

**Not covered:** ellipses, diamonds, arrows, text, handwriting; recognising strokes already on the
canvas (deliberately, and there is now a test that it does not); and any tuning against real pencil
strokes, which needs the iPad defect fixed first. `SketchToggle` has no co-located a11y unit test,
which `accessibility.md` recommends and `DiagramIOPanel` has — its criteria are covered in e2e
instead.
