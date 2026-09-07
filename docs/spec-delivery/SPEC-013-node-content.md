# Completed Spec — SPEC-013: Hand-drawn content inside a node

## What was completed?

Write inside a box and the writing belongs to the box. Move it, fold it, delete it, share it — the
writing goes too.

- `src/client/shapes/NodeShapeUtil.tsx` — `canReceiveNewChildrenOfType` widened to everything except
  a connection, and `canResizeChildren` added.
- `e2e/node-content.spec.ts`, and four helpers in `e2e/helpers.ts`.

### Deliberate deviations

- **Nested nodes stop scaling with their container.** `canResizeChildren` takes the parent only, so
  it cannot answer differently for a pen stroke and a child node. The user chose one rule for
  everything inside a box (2026-09-06): you resize what you grabbed, nothing else. This is a
  deliberate change to SPEC-004 behaviour, and it has its own criterion so a later reader does not
  read it as a regression.
- **Shrinking a box clear of its content returns that content to the page**, rather than keeping it.
  The price of content being hand-draggable: tldraw's kickout cannot tell an explicit drag from an
  automatic one, so allowing the first allows the second. The spec asserted the opposite until the
  build measured it; the criterion was corrected rather than left contradicting the code.
- **The "N hidden" count is about STRUCTURE, not content.** Answered here because the criterion
  asked for it to be decided rather than inherited: a box holding only handwriting has no collapse
  control at all, because there is nothing nested to fold, and a folded box's count names only the
  nodes inside it. Counting content made a box with one scribbled note announce "1 hidden", which is
  a claim about nesting that is not true. Folding a box that *does* have structure still hides its
  writing, because hiding walks ancestry and does not care what it finds.
- **A `frame` dropped inside a node is adopted, and a node inside that frame is dropped from the
  export.** Also answered here rather than fixed: `documentableNodeIds` requires every ancestor to be
  an exported `diagramNode`. Measured — the export omits the node and the panel warns "2 shapes …
  cannot be described", so it *is* inside the undocumentable count and nothing is lost silently. What
  the warning does not say is that a *named node* was among them; that is a wording gap in SPEC-007's
  dialog, not a hole here.
- **The nudge double-move does not occur** on this tldraw. Measured: node and content both selected,
  nudged 50px, content moved 50px. The criterion existed because a review predicted it from the
  source; it was checked rather than repeated.
- **No `canRemoveChildrenOfType` override.** One was written and removed: it suppressed tldraw's
  kickout, which also broke dragging a nested node out — SPEC-004 behaviour the nesting suite caught
  within minutes of the change. The claim in its comment that only the automatic path was affected
  was simply wrong.

## What changed from earlier specs?

- **SPEC-004's resize behaviour**, above.
- Nothing else. No record, no shape, no prop, no migration.

## Verification

335 unit + 238 e2e green, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

Seven mutations, all caught: adoption reverted to nodes-only (10 tests); `canResizeChildren` back to
its default (2); the collapse guard removed (2); the scene lens swapped for the raw prop (1); the connection guard deleted (1, and see below); the count including content again (1); and the
shrink test's geometry, which had to be rebuilt because the original shrink never actually separated
the box from its content — so nothing was at risk and the test proved nothing.

**A review found the connection criterion asserted by a test that could not fail.** `addConnection`
creates its shape at (0,0), outside every node in any fixture, so tldraw's parent scan never reached
the guard — deleting `type === CONNECTION_SHAPE_TYPE` left the entire 238-test suite green. The test
now creates the connection at a point deep inside a node, and deleting the guard fails it.

**One reported defect did not reproduce**, and now has a test so it stays that way: clicking a box
that holds content, and double-clicking to rename it, were reported as doing nothing. Both work, on
the box's centre, with and without content — but if they ever stopped, a box you had written one word
in would be unusable.

**A mechanism was built and then deleted, which is the most useful thing in this delivery.** Dragging
content out of a box appeared not to work, so `nodeContent.ts` was written to enforce it: a child
whose bounds no longer meet its parent's returns to the page. Every mutation of it survived —
including deleting it outright — which is how it was found to be unnecessary. The real causes were
three test defects stacked:

1. the content was an **unfilled** rectangle, hit only on its outline, so a drag from its middle fell
   through to the box behind it;
2. the **draw tool was still current** after drawing the stroke, so the drag drew a new stroke;
3. and the hand-written rule itself **fired mid-drag**, after which tldraw's translate restored the
   parent it had recorded at drag start — so the rule made the thing it was written to fix look
   permanently broken.

With those fixed, tldraw's own `onDragShapesOut` and `kickoutOccludedShapes` do the job, and there is
less code than before the investigation started.

**"Dead code" was too strong, and a review measured the difference.** Two paths genuinely do *not*
return content to the page: an arrow-key **nudge** (`nudgeShapes` never calls the kickout) and a
**programmatic move**. Content moved either way stays parented to a box it is nowhere near, and
moving that box then drags it along. Both are pre-existing for nested nodes, so the mechanism was not
restored — but the honest statement is "no test exercised those paths", not "it was dead".

**Not covered:** clipping (content deliberately overflows), scaling content on resize, and content in
the JSON document — a stroke is not describable in that format, and the export panel's
undocumentable count already includes content inside nodes, which FR-004 asserts with content that
exists *only* inside a node.
