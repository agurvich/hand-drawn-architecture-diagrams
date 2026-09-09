# Completed Spec — SPEC-018: Edge kinds

## What was completed?

- **A connection carries a set of kinds** — `data`, `permission`, `sequence` — from a closed
  vocabulary in `src/shared/shapes/connection.ts` (`EDGE_KINDS`, `EdgeKind`, `normaliseKinds`), with
  the connection shape's first migration (`AddKinds`). One edge says everything it is; the diagram
  gains no parallel edge layers.
- **The canvas draws them.** `strandsFor` in `ConnectionShapeUtil` returns one offset strand per
  known kind, each with its own `<marker>`, or the plain `currentColor` line when there are none.
  Colours are `--edge-kind-*` in `index.css` — the app's first custom properties of its own — and
  the kinds are in the shape's accessible name.
- **The panel sets them.** `KindField` (`src/client/panels/fields/`), mounted under `ActorField`;
  read-only on a merged line.
- **The colour of the stroke picks the kind.** `kindForStrokeColour` / `kindsForStrokeColour` beside
  `shouldConnect` in `convertPolicy.ts`; `convertStroke` carries the drawn colour onto the created
  connection.
- **A merged edge carries every kind its members name** — `MergeEntry.kinds` and `distinctKinds` in
  `merge.ts`, by the rule `decisions.md` → *A folded view shows every answer, never none*.

Register entry: `decisions.md` → *An edge carries a set of kinds*.

### Deliberate deviations

- **Black gets no kind**, which departs from the owner's own mapping ("black for structure and
  sequence"). Black is the default pen and records no decision, and if it meant `sequence` the
  drawing path could not produce a connection that claims nothing. `sequence` is panel-only. **This
  is the spec's call, not his** — one line in `kindForStrokeColour` to reverse.
- **An unknown kind is stored and not drawn.** The validator is structural (`T.arrayOf(T.string)`),
  not closed over `EDGE_KINDS`, because a closed one turns a newer build's kind into a record
  rejected at the room boundary. `normaliseKinds` preserves it; the renderer filters it out, because
  `var(--edge-kind-nonsense)` resolves to nothing and an invisible strand still consumes an offset
  slot.
- **FR-002's rendering criteria and FR-003's behavioural ones are e2e, not jsdom.** Nothing in this
  repo mounts a `ShapeUtil`'s `component()` or a panel field under Testing Library, and only a real
  browser resolves a custom property. `e2e/edge-kinds.spec.ts` asserts computed colours, which is
  stronger than the attribute match the plan first proposed.

## What changed from earlier specs?

- **`ConnectionShapeProps` gained `kinds`**, so `ExportableConnection.props` did too. The frozen v1
  and v2 document corpora (`document-v1.test.ts`, `document-v2.test.ts`) each gained `kinds: []` per
  connection record, and their "a change here means v1 documents stopped meaning what they meant"
  comments were **amended rather than edited around**: `DocumentConnection` is untouched and
  `toDocument` never reads kinds, so the exported JSON is byte-identical. The document format is
  still v3.
- **`MergeEntry` and `ConnectionEndpoints` (SPEC-006, SPEC-015) each gained a field**, and
  `mergeIndex.ts`'s `sameEntry` — the memo's `isEqual` — now compares it. That function is exported
  and directly tested for the first time; a field it forgets never reaches a renderer, with no error
  and every derivation test still green.
- **`decisions.md` → *Secondary features deferred pending real use* is amended, not retired.** It
  fenced five features; only the edge-sets clause is answered, and it is answered by being
  **declined**. Superseded markers sit at `CLAUDE.md` → Key Decisions → *Scope* and
  `architecture.md` → *Deferred / Non-goals*.
- **`penStroke` (e2e) takes an optional pen colour**, set through `stylesForNextShape`.
- **The e2e-browser rationale moved out of `CLAUDE.md`** to `architecture.md` → Known Constraints. It
  was the only home of that fact and it was spending the always-loaded byte budget; the budget's
  reasoning is updated beside `CLAUDE_MAX_BYTES` (15633/16000, ~367 bytes, recorded as thinner than
  the previous re-ratchet's 525 rather than rounded up).

## Verification

Local: `npm run build`, `npm run typecheck`, `npm run lint` (4 pre-existing warnings, none in
touched files), `npx prettier --check`, `npm test`, `sh scripts/spec-lint.sh`,
`sh scripts/docs-lint.sh` and `sh scripts/docs-lint-test.sh`, plus the full Playwright suite.

Two gates were proved to bite by defeating them: deleting the `kinds` clause from `sameEntry` reddens
four tests, and mistyping `light-green` as `lightgreen` in the colour map reddens two — including
the corpus replay, which is the spec's measured evidence (his strokes 80 and 188 → `data`, 259 →
`permission`). Nothing was deferred to a green CI run.
