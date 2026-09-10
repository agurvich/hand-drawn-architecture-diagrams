# Completed Spec — SPEC-019: A vocabulary the user writes

## What was completed?

- **The vocabulary is the diagram's.** A `diagramKind` record — label, palette colour, dash — at
  document scope, in `src/shared/kinds/`, on the SPEC-008 custom-record pattern. `EDGE_KINDS` and
  `EdgeKind` are gone.
- **Seeds in code, overrides in records.** `SEED_KINDS` holds SPEC-018's three; `overlayVocabulary`
  matches records onto them by id. **Nothing is written to a room to make a kind exist.**
- **The panel writes it.** `KindField` creates, renames and recolours a kind beside the checkboxes
  that apply it, because a word is invented while drawing the line that needs it. A rename rewrites
  every connection carrying the old label, in one undo step.
- **The canvas reads it.** `getVocabulary` (memoised per editor, like `mergeIndex`) and
  `resolveKind`; `strandsFor` takes the vocabulary and paints each label from `KIND_PALETTE`.
- **A label the vocabulary does not list is DRAWN**, in a reserved near-black with a reserved dash,
  named as unlisted in the accessible name, and offered as a checkbox that turns it off.
- **The pen reaches it.** `kindForStrokeColour(colour, vocabulary)` — the vocabulary is a parameter,
  so `convertPolicy.ts` keeps the property its header states: replayable against the corpus with no
  live editor.

Register entries: `decisions.md` → *A kind is identified by its word*, *Seeds in code, overrides in
records*.

### Deliberate deviations

- **Deletion is out of scope**, and asserted absent. It asks what happens to the connections
  carrying the kind, and answering it wrong loses meaning silently.
- **Colour comes from a palette of eight**, not a picker: a picker lets a user defeat WCAG on their
  own diagram, invisibly to them.
- **Slate carries `pen: null`.** Putting `sequence`'s colour into the palette would have mapped it to
  the grey pen and made a grey stroke silently claim `sequence` — reversing SPEC-018's recorded
  "sequence is panel-only" decision as a side effect rather than as a choice. Found by a test that
  went red, not by review.
- **Import leaves `diagramKind` records untouched**, unlike scenes, which `documentIO` clears right
  beside it. The document carries no vocabulary, so it is authoritative about nothing here.

## What changed from earlier specs?

- **SPEC-018's closed vocabulary is retired.** `connection.ts`'s docblock is rewritten in place with
  a superseded marker; the `--edge-kind-*` custom properties are deleted and their WCAG measurements,
  colour-blindness rationale and provenance moved into `palette.ts` — that docblock was their only
  home. Markers also at `CLAUDE.md` → Key Decisions, `architecture.md` → *Deferred / Non-goals*,
  `component-inventory.md`, and `spec-delivery/SPEC-018-edge-kinds.md`.
- **`connectionStrands.test.ts`'s `EDGE_KINDS ↔ index.css` binding test retires with the properties.**
  A kind with no colour is now a type error rather than an invisible strand.
- **The export warning gained a sentence** about the vocabulary not being carried either.
- **The doc-size ratchet fired and was paid for by cutting, not raising** — for the third time. The
  advice SPEC-018 left ("look for a fact whose only home is here") did not apply: there was none
  left. What worked was the other half of the rule — three digest lines had grown into paragraphs
  carrying the worked example from their own `decisions.md` entry. Cut back to their claims: 15664 /
  16000, 336 bytes, recorded as thinner than SPEC-018's ~367 rather than rounded up.

## Verification

Local: `npm run build`, `npm run typecheck`, `npm run lint`, `npx prettier --check .`, `npm test`,
`sh scripts/spec-lint.sh`, `sh scripts/docs-lint.sh`, `sh scripts/docs-lint-test.sh`, and the full
Playwright suite.

Gates proved to bite by planting the mutation each was reported with: adding a near-duplicate palette
colour (the ΔE 20 floor); dropping the id exclusion from `labelCollision` (the case-only rename);
registering the record at session scope; deriving created ids from the label; and letting the
validator accept an untrimmed label.

**What the reviews found, recorded because the lessons are not about this spec.**

- **The seed design was unsound and two rounds were needed to see it.** "Write the three records into
  a room whose vocabulary is empty" reads as obviously correct. Undo, import and hydration each reach
  an empty vocabulary. The general form is worth more than the fix: *a default that is computed is
  safer than a default that is written*, because a written default needs a moment to be written at,
  and every such moment is a state reachable by accident.
- **An acceptance criterion in the spec was mathematically unsatisfiable**, and nothing in the
  process would have caught it before implementation — it took arithmetic. Requiring 3:1 contrast
  between every pair of palette colours caps a palette at **two** entries for any hues whatsoever (3
  → 9 → 27, and 27 > 21), so it also contradicted FR-001's three seeds. It was the wrong rule as
  well: two strands are separated by a gap of *background*, so each one's adjacent colour is the
  canvas. Replaced by a perceptual floor, ΔE 20 in CIE Lab, which binds at 20.6.
- **The plan review found two tests that could not fail** before either was written: "reading writes
  nothing" placed against a pure function that has no store in scope, and the `__proto__` guard
  placed in `convertPolicy.test.ts` after the plain object it guarded had been deleted. Both moved to
  where the hazard actually is.
