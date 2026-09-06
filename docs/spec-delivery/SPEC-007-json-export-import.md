# Completed Spec — SPEC-007: JSON export/import and the AI-authoring schema

## What was completed?

- **`src/shared/document.ts`** — the format: a strict, total validator over raw text, plus
  `toDocument`/`fromDocument`, which meet exactly so the round trip composes with no bridge type.
  No `tldraw` import; unit-testable without an Editor.
- **`src/client/documentIO.ts`** — the Editor adapters. `exportDocument` reads the page,
  `importDocument` clears and rebuilds it as one undoable step, `undocumentableShapeCount` derives
  the number both the warning and the confirmation show.
- **`DiagramIOPanel`** — a text box holding the diagram's JSON, a paste box, a copy control that
  degrades, a rendered confirmation dialog, and an error surface that keeps the pasted text.
- **`docs/ai-authoring-guide.md`** — written to be handed to a model cold, edited down to what this
  tool actually has, with its examples proved by tests in both lanes.

### Deliberate deviations

- **The panel closes on a successful import.** Not specified either way; the point of pasting is to
  look at the diagram, and the panel covers it.
- **`jsonBlocks` lives in `src/shared/guideExamples.ts`**, not in a test file. Both lanes need it —
  vitest proves the guide's blocks parse, Playwright proves they import — and a copy in each is two
  rules that agree until they don't.
- **The e2e determinism test pins ids by importing.** Hand-drawn shapes get random ids, so comparing
  the export order of two hand-built rooms compares two random sort keys. The unit test covers the
  two-creation-orders case properly; the e2e covers array order, which is what it can control.

## What changed from earlier specs?

- **The type-literal guard now scans `src/shared`.** It covered only `src/client` and `src/worker`,
  which made `src/shared` the one tree where a duplicate shape-type string could land unseen — and
  this spec's module names all three types. Exclusions are anchored to full paths and asserted to
  still exist.
- **`hierarchy.ts` exports `SHAPE_ID_PREFIX`**, so the document module mints and strips `shape:`
  without writing the string a second time.
- **`Room.tsx` holds the editor in state** and renders the panel as a sibling of `<Tldraw>`, not a
  `components` override: a textarea inside the canvas tree fights the canvas's pointer and keyboard
  handling.

## Verification

typecheck 0 · oxlint 0 errors · prettier 0 · unit 164/164 · e2e 105/105 · build 0 · spec-lint 0 ·
docs-lint ok.

**The property worth naming: export can never emit a document its own validator rejects.** Two ways
that breaks and neither is obvious — a connection bound to a shape that has since been deleted, and a
node parented into a tldraw shape the schema cannot describe. One *documentable* rule closes both,
and each case is fed straight back through the validator.

**Sixteen mutations planted across the two PRs, sixteen caught**, including four the first round of
mutation testing had missed and two the reviews found surviving:

| Mutation | Caught by |
|---|---|
| `?? []` accepting an explicit `"nodes": null` | the null-hole test |
| Emitted shape records carry no `type` | the key-set test |
| Connection endpoints resolved by binding count, not per terminal | the two-bindings-on-one-terminal test |
| Cycle message naming the lowest member of the walk, not of the cycle | the tail-into-cycle test |
| Keyword colours rejected | the keyword-colour test |
| Id pattern dropped from connection ids | the connection-id test |
| Node default colour changed in the shape definition | a deliberate tripwire |
| Sort removed; unknown keys ignored; cycle check disabled; id namespaces split | 5, 3 and 3 tests |
| Binding join returned to a full scan | the 16,000-connection bound |
| Export reading the *rendering* shape list | 3 tests |
| Import without a history mark | the single-undo test |
| Undocumentable counted by shape type rather than derived | the half-bound-connection test |
| Confirmation gate removed | 5 tests |
| `w`/`h` validated as finite rather than positive | the zero-size test |
| Focus effect missing its `open` dependency | 2 focus tests |
| Launcher back at top-right, over tldraw's colour swatches | the overlap test |
| Panel without `box-sizing: border-box` | the 375px viewport test |

Two findings came only from running the code against a real editor, which no unit test could reach:
the emitted records had no `type`, so `createShapes` threw and tldraw's error boundary replaced the
canvas — a *well-formed* document would have taken down the app; and the binding join was quadratic,
2.0s at 16,000 connections, in a module that reasons about linearity twice elsewhere with
measurements attached.

**A well-formed document could crash the canvas.** `w: 0` and negative sizes are finite, so they
passed a finite-only check and then threw inside `createShapes` — which escapes to tldraw's error
boundary and replaces the canvas with a "Reset data" button, telling the user nothing. The guide's own
enforced list said only "finite numbers", so a model following it could emit exactly this. Found by
the review that used the app; sizes are now validated as positive.

**Four claims in the authoring guide were wrong**, all found by a reviewer who read it cold and
authored a 17-node diagram from it without opening the code: the worked example said three lines where
the app draws two; `x`/`y`'s origin was never defined; a collapsed container keeps the `w`/`h` you gave
it rather than shrinking; and a misspelled colour keyword renders *black*, not invisibly. That
reviewer's diagram imported first try and its predicted collapse rendering matched exactly, which is
the guide's best evidence — but a guide handed to a model as ground truth cannot carry four wrong
sentences, and no test can see prose.

Not covered: scenes, edge sets, node metadata, icons, actors, colour inheritance, z-order and array
order. Z-order and array order are losses a round trip does not carry, and the guide says so.
