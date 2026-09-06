# Completed Spec — SPEC-009: Scenes in the JSON document

## What was completed?

A document carries its **scenes** as well as its nodes and connections, so what you hand a colleague
— or ask a model for — is a walkthrough rather than a picture.

- `DOCUMENT_VERSION = 2`, `SUPPORTED_DOCUMENT_VERSIONS`, and `upgradeV1` in `src/shared/document.ts`.
  A v1 document is upgraded on the way in and means exactly what it meant.
- `DocumentScene` / `ExportableScene`, validated per path — nine rejections, plus **two different**
  errors for a bad `collapsed` key, because naming nothing is a typo and naming a connection is a
  misunderstanding.
- **A frozen v1 corpus** at `src/shared/__fixtures__/v1/` with `src/shared/document-v1.test.ts`.
- `src/shared/scenes/sceneType.ts` — the scene type string and its id prefix, in a tldraw-free module
  both `scene.ts` and `document.ts` import.
- `replacedSceneCount` in `src/client/documentIO.ts`; `sceneRecords` and `pasteDocumentAndConfirm`
  in `e2e/helpers.ts`.
- The authoring guide gained a scenes section and a three-beat worked example.

### Deliberate deviations

- **The import confirmation now counts scenes**, which no FR asked for. The existing gate is
  `onPage - (nodes + connections)` and scenes are not page shapes, so a room with six hand-authored
  scenes and nothing undocumentable was replaced in silence. Recorded as a criterion in the spec
  rather than left as an undocumented extra; it applies the settled "everything, but ask first"
  decision rather than making a new one.
- **`node-and-connection-same-shape.json` was dropped from the corpus.** `document.ts` rejects a
  connection id equal to a node id, so a *valid* v1 fixture could only hold near-misses and would be
  vacuous. The namespace guard is a unit test instead.

## What changed from earlier specs?

- **`parseDocument`'s check order is reversed** (SPEC-007). Version, then a v1-with-scenes guard,
  then unknown keys, then the upgrade. Necessary: once `scenes` is legal in v2, a v1 document
  carrying one would be reported as a KEY problem when the author's mistake is the VERSION.
  Two consequences worth carrying forward — the key check runs pre-upgrade, so `TOP_LEVEL_KEYS` is
  permanently the **union of every version's keys**, and only that explicit guard stops a v1
  author's `scenes` being silently discarded. A v3 key will need its own.
- **`DiagramDocument` gained a required `scenes` key**, so `toEqual` assertions on a whole document
  changed. `toDocument` takes a **trailing optional** fourth parameter rather than a required one —
  23 of its 24 call sites pass three arguments.
- **`shared-imports.test.ts` grew `'diagramScene:'`.** The check looks for the closing quote, so the
  prefixed form slipped past `'diagramScene'` on a single colon — a second home for the type string
  hidden behind one character. It has its own fixture now.
- **SPEC-008's `guide-examples.test.ts` deferred-key guard was narrowed, not deleted**: `scenes`
  left, the other five stayed.

## Verification

245 unit + 166 e2e green locally, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

Every phase is mutation-verified — 20 mutations, each reverted individually. The ones worth naming,
because all of them would otherwise have shipped silently:

| Mutation | Caught by |
| --- | --- |
| The version check moved back after the unknown-key check | the ordering test |
| The v1-with-scenes guard deleted | the version-error test |
| `collapsed` built on a plain `{}` instead of `Object.fromEntries` | the `__proto__` test |
| `highlighted` filtered through `documentableNodeIds` (nodes only) | the surviving-connection test |
| `collapsed` filtered against STRIPPED ids | the surviving-node test |
| The `(index, id)` tiebreak dropped | the tied-index test |
| Scene-id uniqueness widened to the shape namespace | the same-id-as-a-node test |
| The scene id prefix left unstripped on export | 7 tests |
| Scene writes moved BEFORE `markHistoryStoppingPoint` | the single-undo e2e |
| Indices minted as `a${i+1}` | the twelve-scene e2e |
| The off-scene clear removed | the off-scene e2e |
| The scene count dropped from the confirmation gate | the scenes-only confirmation test |
| The guide's ` ```ts ` version reverted to 1 | the fenced-block sweep |

**Two mutations are dead, and it is worth being exact about which.**

*Moving the upgrade ahead of the unknown-key check* was live during Phase 2 — 12 tests red, the v1
corpus among them — and went **inert in Phase 3**, when `scenes` joined `TOP_LEVEL_KEYS`. It proves
the ordering was necessary while it was being built and proves nothing at HEAD. What pins the
ordering now is a direct assertion that `{"version": 9, "bogus": 1}` reports the *version*, not the
key. Every other version test passes a document with no unknown key, so they would stay green with
the checks in either order.

*Moving the scene writes merely outside `editor.run()`* does **not** break the single undo — everything after
`markHistoryStoppingPoint` accumulates into one pending diff regardless of transaction boundaries.
`run()` is still correct there, for atomicity and a single reactive flush, but a plan claiming that
mutation as proof would have been claiming proof from a green test. The live mutation is moving the
writes *before the mark*.

**A silent round-trip loss, found in review and fixed:** `__proto__` matches `DOCUMENT_ID_PATTERN`,
so it is a legal node id — and `JSON.parse` creates it as an own property, so it parsed and imported
correctly, but assigning it on a plain `{}` during export hit `Object.prototype`'s accessor and was a
no-op. The entry vanished from the export while the re-import still validated: the round trip lying
rather than failing. `Object.fromEntries` now builds the map, which creates it as an own property
without polluting anything. The runtime lens already had this right — `effectiveCollapsed` uses
`Object.hasOwn` deliberately.

**Not covered:** transactional atomicity of the import (nothing tests a throw mid-import), and there
is no v2 → v1 downgrade. A v1 build handed a v2 document reports `document.scenes: unknown key`,
because its own key check runs before its version check — nothing here reaches a build that already
shipped.
