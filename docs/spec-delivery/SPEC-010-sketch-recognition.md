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

**Nine tolerance constants, each pinned by a fixture that isolates it.** That took three rounds: the
first corpus left four of five free to be mutated to nonsense with the suite still green, because
each of those strokes was being refused by some *other* test. The strokes that closed the gaps —
`refuse-l-shape` (only the corner count refuses it), `refuse-tiny-box` (only the size does),
`refuse-tiny-flick` (only `MIN_STROKE_EXTENT`), `refuse-bowed-line` (only the deviation test; my
first attempt at it, a zigzag, was caught by backtrack instead and left the constant unpinned).

**Eight conversion mutations, all caught**, including the two that were real defects the e2e found
rather than confirmed:

| Mutation | Caught by |
| --- | --- |
| The `source !== 'user'` guard removed | the two-client mode test |
| The `isPurposeful` gate removed | the scribble-across-two-nodes test |
| The node-pair override removed | the routed-connection test |
| The mode defaulting to on | four tests |
| `markHistoryStoppingPoint` removed | the single-undo test |
| A collapsed container accepting children | the collapsed-container test |
| Page coordinates used as parent-local | the nested-box page-position test |
| The completion EDGE weakened to the completed state | the already-on-the-canvas test |

**Two defects the e2e found, not confirmed:**

*The mode was per-viewer in name only.* The session-scoped record keeps the SETTING local. It does
not keep the EFFECT local: a stroke arriving over the wire is a shape change like any other, so a
client with recognition on converted a stroke somebody else had just drawn, and the node synced
back — the second person watching their sketch become a rectangle having enabled nothing. Fixed with
a `source !== 'user'` guard in the change handler.

*The routed-connection case did not work at all.* Covered above under deviations.

**Honest limit on the corpus, recorded per fixture in a `via` field:** these are CDP-synthesised pen
events, not a pencil on glass, because the app renders blank on iPad (`architecture.md`, open
defect). What that gives up is human jitter and pressure variation. What it keeps — and what the
classifier actually consumes — is tldraw's own smoothing and segment encoding, which is the part no
hand-written point array reproduces.

**Not covered:** ellipses, diamonds, arrows, text, handwriting; recognising strokes already on the
canvas (deliberately, and there is now a test that it does not); and any tuning against real pencil
strokes, which needs the iPad defect fixed first.
