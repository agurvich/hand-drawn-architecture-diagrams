# Completed Spec — SPEC-006: Merging connections into a collapsed container

## What was completed?

- **`src/shared/shapes/merge.ts`** — the whole collapsed view as a pure function. `visibleStandInFor`
  gives the **outermost** collapsed ancestor; `computeMergeIndex` applies five rules in order:
  unbound terminal, dangling binding, internal-to-container, grouping by resolved key, and the gate.
  No `tldraw` import, no Editor, 30 unit tests.
- **`src/client/mergeIndex.ts`** — the derivation as a `computed` held in a `WeakMap` keyed on the
  editor, with an `isEqual` so unrelated shape movement does not invalidate every connection's
  geometry, handles and visibility caches.
- **`ConnectionShapeUtil`** — terminals resolved through the index, `×N` at the midpoint when a line
  stands for more than one connection, and no endpoint handles while it does.
- **`visibility.ts`** — the connection branch is now one question asked of the index; SPEC-005's
  binding-resolution branch was replaced rather than added to, its two answers preserved as rules 1
  and 2 of the derivation.
- **Endpoint re-aiming (`onHandleDrag`/`onHandleDragEnd`)** — the SPEC-005 debt, built and asserted.
- **`nodeAtPoint.ts`** — one definition of "which node is under this point", so the connection tool
  and endpoint re-aiming cannot disagree about what a drop attaches to.
- **`debugStoredSnapshot`** reports every stored shape by `type`.
- **`selection.ts` now asks `editor.isShapeHidden`**, the same question the canvas asks, instead of
  `isHiddenByCollapse` — and gained a reaction, because the existing guard only fires when the
  SELECTION changes, never when a selected shape BECOMES hidden. See below.

### Deliberate deviations

- **The re-aim criterion for a collapsed container was rewritten mid-build.** The spec asked that
  dropping an endpoint over a collapsed container bind to the **node inside** it. That is
  unbuildable: `getShapeAtPoint` skips hidden shapes unconditionally, so a hidden node is not a
  pointer target and the user cannot express the gesture. It now binds to the container — the shape
  actually on screen and actually under the finger. Found by the plan review, not by the spec review.
- **`isCollapsedContainer` and `isShapeId` were exported from `hierarchy.ts`** rather than
  reimplemented in `merge.ts`, so `'diagramNode'` and `.collapsed` are still tested together in one
  place.

## What changed from earlier specs?

- **SPEC-005 FR-003's last criterion is superseded.** A connection whose endpoint is hidden by
  collapse is no longer hidden; it is re-drawn against the container. The live assertion in
  `e2e/connections.spec.ts` was rewritten in place — same arrangement, new expected answer — so the
  case stays covered. Markers are on SPEC-005 FR-003 and on its delivery doc's closing paragraph,
  which still stated the old behaviour as current.
- **SPEC-005 FR-004 (re-aiming) was owed and is now paid.** That spec was marked Completed with the
  FR unimplemented and untested: `getHandles` shipped, no drag handler did, and dragging an endpoint
  silently did nothing. Found by SPEC-006's spec review. Six e2e now cover its criteria, labelled
  under both spec numbers.
- **`collapsedAncestorOf` keeps its meaning** (nearest) and `visibleStandInFor` is new (outermost).
  They differ only under nested collapse, which is exactly the case each is for. Not refactored into
  one: `isHiddenByCollapse` is shipped, tested code with its own subject.

## A defect this spec surfaced rather than caused

**A merged-away connection stayed selected, and Delete then destroyed it unseen.**
`stripHiddenFromSelection` asked `isHiddenByCollapse`, which walks `parentId` — and a connection is
parented to the page, so it answered "not hidden" for every connection there has ever been. It also
only ran as a *before* handler on the selection, so a shape that became hidden while already
selected was never re-checked at all; SPEC-004's own test collapses first and then selects, which is
why neither half showed up.

Harmless while a hidden connection's endpoints were hidden with it. Once a line is still drawn in
its place, it is a data-loss path: select the visible line, press Delete, and a different invisible
connection is destroyed with no feedback but a count quietly changing. Found by the diff review
frame that drove the running app rather than reading the diff.

Both halves are fixed and both are mutation-tested. The second half was never connection-specific —
collapsing a container while one of its children was selected left the child selected too — so there
is a test for the node case as well.

## Verification

typecheck 0 · oxlint 0 errors · prettier 0 · unit 76/76 · e2e 82/82 · spec-lint 0 · docs-lint ok.

**Every load-bearing rule was mutation-tested rather than assumed:**

| Mutation planted | Caught by |
|---|---|
| Re-aim drop does not call `updateBinding` (the original SPEC-005 bug) | 3 of the 6 re-aim tests |
| Endpoint hint never set | the hint test |
| `visibleStandInFor` returns the *nearest* collapsed ancestor | the nested-collapse test |
| Rule 5's gate removed (group merges unconditionally) | 2 tests |
| Re-aim silently refused for a *resolved* terminal | the resolved-handle test — **added by the diff review, which found this one surviving** |
| Selection reaction does nothing | both selection tests |
| Selection filter drops the `isShapeHidden` check | both selection tests |

The criterion worth naming: **collapsing and expanding creates and deletes zero records.** Asserted
by enumerating the full shape-and-binding id set at three points in time, not by comparing counts,
and confirmed against *worker storage* through `debugStoredSnapshot`'s shape-type census — a client
could hide what it wrote, storage cannot. Two clients then derive the same representative from the
collapse record alone, and the second client's record set is identical to the first's.

One test in this spec shipped **flaky** in an intermediate commit and was caught by a reviewer
running it twelve times: it pinned the merge representative to a randomly-generated shape id, so it
held about a third of the time. `addConnection` now takes an optional id, and the test pins it —
which makes the deletion under test the one the user can actually see, rather than a coin toss
between a visible and a hidden shape. The lesson is the cheap one: a test that names a *specific*
member of a set ordered by random ids is flaky by construction, and running it once hides that.

Not asserted by any test: the count badge's halo (`.diagram-connection__count`), which is styling
only. It was shipped inert in the first draft — `var(--color-background)` is defined nowhere, tldraw's
token is `--tl-color-background` — and caught by a reviewer reading the running page's computed
style, not by a test. A screenshot test was judged not worth its maintenance here.

Not covered: labels on a merged line beyond the count, offsetting coincident parallel lines, and
deleting every connection a merged line stands for. Deleting a merged line deletes exactly the one
connection it is — the count then re-derives rather than decrementing, which has its own test
because "the count drops by one" is the obvious wrong expectation.
