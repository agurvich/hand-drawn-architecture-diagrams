# Completed Spec — SPEC-008: Scenes and narration

## What was completed?

- **Two custom record types**, the third kind of declared-once-consumed-twice thing after shapes and
  bindings: `diagramScene` at document scope (shared, persisted) and two session-scoped records
  holding this viewer's place.
- **`src/shared/scenes/scene.ts`** — the lens as pure functions: `effectiveCollapsed`,
  `withEffectiveCollapsed`, `isSceneStale`. No Editor, no `tldraw` import.
- **`src/client/sceneView.ts`** — the shared `GetShape` override, and every mutation with its history
  rule attached.
- **`NarrationPanel`** — step forward and back without opening anything, plus capture, rename,
  reorder, delete-with-confirm, the note, the stale marker and the off-scene marker.

### Deliberate deviations

- **"Frame" became "scene"** partway through, at the user's request: it collided with tldraw's own
  frame shape, which this codebase already refers to for a clipping container. Mechanical rename; the
  record type strings changed with it, and no migration was written because rooms are dev-only and no
  surface had shipped.
- **Capture takes the current selection as the highlight.** The spec left the authoring gesture open;
  this needs no new control and is a gesture a reader already performs.
- **Highlight rendering is not built.** FR-003's accent criterion is the one thing this spec did not
  deliver — the record carries `highlighted` and `isSceneStale` reads it, but nothing draws it. Owed,
  and recorded here rather than left to be discovered.

## What changed from earlier specs?

- **`@tldraw/store` became a direct dependency** at a range, for `BaseRecord`/`RecordId`, widening the
  shared-import allowlist by exactly one entry.
- **`NodeShapeUtil` reads the effective collapsed state**, not the raw prop — its control, label,
  `aria-expanded`, hidden count and its refusal to accept drops.
- **`visibility.ts` and `mergeIndex.ts` share one accessor.** That is the whole mechanism.

## Verification

typecheck 0 · oxlint 0 errors · prettier 0 · unit 191/191 · e2e 135/135 · build 0 · spec-lint 0 ·
docs-lint ok.

**The claim the design rests on: merging follows the scene.** Collapse is read in two places — the
visibility walk and the merge derivation — and both bottom out in the same pure predicate. A unit test
asserts the merge output is deep-equal to setting the prop for real; an e2e asserts it on the canvas.

| Mutation planted | Caught by |
|---|---|
| `mergeIndex` back to the raw accessor | the merging e2e |
| The container back to the raw prop | the reads-as-folded test |
| The drop refusal back to the raw prop | the refuses-drops test |
| The view record promoted to document scope | the second-client test |
| The off-scene write deleted | 2 history tests |
| `viewScene` recording history | 2 history tests |
| No history mark before the toggle | the single-undo test |
| Off-scene not cleared on scene change | the clears-on-change test |
| Scene edits recording history | 2 authoring tests |
| Capture recording every node, not just containers | 3 tests |
| Stepping wrapping at the ends | the stops-at-the-ends test |

Two of those survived a first round and were found by review: the off-scene write had **no test at
all** — deleting it left every test green — and the record shape itself was wrong, which took a
reviewer driving the app to see. `activeSceneId` and the off-scene set need opposite undo treatment
and cannot share a record; that is now a `decisions.md` entry.

Not covered: highlight rendering (owed, above), and scenes in the JSON document, which is SPEC-009.
