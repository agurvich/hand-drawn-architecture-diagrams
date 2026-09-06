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
- **Highlight is ring AND dim**, per the user (2026-09-05). It refuses to dim when nothing it names
  is **visible** -- not merely when nothing resolves. The difference is two clicks: a scene can fold
  the container its own highlighted node lives in, and a reader can fold it themselves through the
  off-scene gesture. The shape still resolves in both cases, so the first cut left the page grey
  with nothing lit -- the exact state the rule exists to prevent. A page where everything is faded
  and nothing is accented reads as broken rather than focused.
- **Dimming is 70%, and the number is a contrast floor rather than a taste.** A dimmed node stays
  in the accessibility tree, so it owes the 4.5:1 every other label does. Measured off the rendered
  node -- the label is `#2e2e2e`, not the `#111` the stylesheet suggests -- 35% gives 2.27:1 and 60%
  gives 3.86:1. The e2e computes the ratio from the live element, so the number cannot drift away
  from the rule it satisfies.

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
| Capture recording every node, not just containers | the containers-only test |
| Stepping wrapping at the ends | the stops-at-the-ends test |
| The note ignored on write | the note test |
| Re-capture dropping the note | the note test |
| Capture ignoring the selection | the highlight test |
| `moveScene` doing nothing | the reorder test |
| Dimming when nothing it names resolves | the deleted-highlight test |
| The ring's outline removed | the computed-style assertion |
| The dim opacity removed | the computed-style assertion |
| The bar back to content-sized | the drift test |
| The list row untruncated | the long-name test |
| The visibility half of the highlight filter | the folded-container tests |
| Dimming a page whose scene highlights nothing | the empty-highlight test |
| The connection dim rule, or the connection ring rule | the painted-connection test |
| The note moved back below the bar | the bar-drift test |
| The stale marker moved back inside the clip | the long-name stale test |
| The dim opacity back to 35% | the contrast test |

**Three survived a round and were found by review**, which is the honest count:

- the off-scene write had **no test at all** — deleting it left every test green;
- the record shape itself was wrong, which took a reviewer driving the app to see. `activeSceneId`
  and the off-scene set need opposite undo treatment and cannot share a record; that is now a
  `decisions.md` entry;
- the **entire note path** was unguarded — making the note a no-op passed 36/36 — along with list
  selection, whose rows nothing had ever clicked.

Review also caught three things that were correct-by-luck rather than by design: `recaptureScene`
committed a temporary scene in its own transaction, so a throw in the second one would have leaked a
duplicate to every client; `moveScene` re-indexed every scene from a fixed sequence, which two
clients reordering at once merge into neither person's order; and the panel read every record in the
store on every pointer frame.

**A third review read the highlight itself** and found the rule it advertised was false, and
reachable in two clicks -- plus a performance regression the last commit had just finished fixing
one function above (an unguarded read inside every shape's render scope re-rendered an unrelated
node 40 times across a 20-step drag), and three mutations that survived in the very class that
commit claimed to have closed: the connection accent was asserted on class names, so the rule could
be emptied in silence.

**A second review used the panel to author a five-scene walkthrough** and found four surface defects
no test had: with twenty scenes the column grew upward until the bar sat on top of tldraw's undo
button — and at 375px on the JSON launcher; a long name grew its list row from 44px to 424px; the
forward button drifted 56px between scenes, further than the button is wide; and a stale scene was
marked only inside the open list, so a presenter stepping with it closed saw a broken scene presented
as working. All four are fixed, and each has a test that fails without the fix.

Not covered: scenes in the JSON document, which is SPEC-009.
