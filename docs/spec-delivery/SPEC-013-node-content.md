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
- **No `canRemoveChildrenOfType` override.** One was written and removed: it suppressed tldraw's
  kickout, which also broke dragging a nested node out — SPEC-004 behaviour the nesting suite caught
  within minutes of the change. The claim in its comment that only the automatic path was affected
  was simply wrong.

## What changed from earlier specs?

- **SPEC-004's resize behaviour**, above.
- Nothing else. No record, no shape, no prop, no migration.

## Verification

335 unit + 238 e2e green, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

Five mutations, all caught: adoption reverted to nodes-only (10 tests); `canResizeChildren` back to
its default (2); the collapse guard removed (2); the scene lens swapped for the raw prop (1); and the
shrink test's geometry, which had to be rebuilt because the original shrink never actually separated
the box from its content — so nothing was at risk and the test proved nothing.

**A mechanism was built and then deleted, which is the most useful thing in this delivery.** Dragging
content out of a box appeared not to work, so `nodeContent.ts` was written to enforce it: a child
whose bounds no longer meet its parent's returns to the page. Every mutation of it survived —
including deleting it outright — which is how it was found to be dead code. The real causes were
three test defects stacked:

1. the content was an **unfilled** rectangle, hit only on its outline, so a drag from its middle fell
   through to the box behind it;
2. the **draw tool was still current** after drawing the stroke, so the drag drew a new stroke;
3. and the hand-written rule itself **fired mid-drag**, after which tldraw's translate restored the
   parent it had recorded at drag start — so the rule made the thing it was written to fix look
   permanently broken.

With those fixed, tldraw's own `onDragShapesOut` and `kickoutOccludedShapes` do the job, and there is
less code than before the investigation started.

**Not covered:** clipping (content deliberately overflows), scaling content on resize, and content in
the JSON document — a stroke is not describable in that format, and the export panel's
undocumentable count already includes content inside nodes, which FR-004 asserts with content that
exists *only* inside a node.
