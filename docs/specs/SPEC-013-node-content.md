# Spec: Hand-drawn content inside a node

**ID:** SPEC-013  
**Status:** Completed  
**Last Updated:** 2026-09-06 (rev 3 — built)  
**Depends On:** SPEC-004, SPEC-006, SPEC-008, SPEC-010

## Overview

Write inside a box and the writing belongs to the box. Move the box and your writing goes with it;
fold the box and your writing folds away with it; delete the box and it goes too.

This is what makes the tool a sketchbook rather than a diagram editor with a pencil bolted on. Today
a node is a rectangle with a label, and anything you scrawl in it is a stranger that happens to be
sitting on top — drag the node an inch and the annotation stays behind, which is the moment the
illusion breaks and you stop trusting the surface.

The mechanism is one tldraw already has: a shape can parent another, and children move with their
parent for free. What the node does not do today is *accept* anything except another node. This spec
widens that, and then deals with the four places the rest of the system assumes a node's children
are all nodes.

## Scope

### In Scope

- A node adopting hand-drawn content — strokes, text, tldraw's own shapes — drawn inside it
- Dragging existing content into a node, and out of one
- Content moving, folding, hiding and deleting with its node
- The four consequences: export, the import confirmation, collapse, and sketch recognition
- **Started inside decides it** (settled 2026-09-06) — where the pen goes down chooses the parent

### Out of Scope

- **Clipping.** Content that runs past the node's edge stays visible (settled 2026-09-06). Nothing
  is ever invisible without being asked for, and the node does not clip today.
- **Scaling ANYTHING on resize.** Resizing a node leaves everything inside it exactly where it is,
  at the size it was (settled 2026-09-06). Enlarging a box does not enlarge your handwriting, and a
  non-uniform resize would distort it with no way back.

  **This changes SPEC-004 behaviour, deliberately and with the user's decision (2026-09-06):
  nested nodes scale with their container today, and after this they do not.** tldraw's hook is
  `canResizeChildren(parent)` — it takes the parent only, so it cannot answer differently for a
  stroke and for a child node. The choice was one rule for everything inside a box, or two rules
  plus code to re-apply the scale to nodes alone. One rule won: "you resize what you grabbed,
  nothing else" is the same mental model in both cases, and a container whose children jump when you
  drag its corner is the surprising one.
- **Content in the JSON document.** A stroke is not describable in that format and this spec does
  not make it one. FR-004 is about saying so honestly, not about carrying it.
- **Auto-layout, reflow, or a text field.** The node's label is unchanged; this is about what you
  draw, not about a second typed field.
- **Recognising content into structure.** A doodle inside a node stays a doodle. SPEC-010 already
  converts a box-ish stroke into a nested node when its mode is on, and that behaviour is unchanged.

---

## Functional Requirements

### FR-001: A node adopts what you draw inside it

#### Description:

tldraw already picks a parent for a new shape by scanning for one that contains the shape's origin
and says it accepts children of that type. A node says no to everything except another node. That
one answer is the whole feature.

**Everything except a connection.** A `diagramConnection` is parented to the page deliberately —
SPEC-005 forbids reparenting it, and SPEC-006's merge derivation depends on that. Everything else a
person can put on a canvas is content.

#### Acceptance Criteria:

- [ ] A stroke begun inside an expanded node becomes that node's child, asserted on `parentId`
- [ ] The same holds for tldraw's text, note and geo shapes — the rule is "not a connection", not a
      list of blessed types, and a list is what goes stale the first time tldraw adds a shape
- [ ] A stroke begun **outside** a node and finished inside it does **not** become its child. Where
      the pen goes down decides, because that is the only moment the person can predict
- [ ] A stroke begun inside a **collapsed** node is not adopted — the same refusal a dropped node
      already gets, for the same reason: a child of a folded container is hidden the instant it
      exists, so it would vanish as you drew it
- [ ] A stroke begun inside a node folded **by a scene** is likewise not adopted. The rule is
      `effectiveCollapsed`, not the raw prop — SPEC-008's lens hides children just as thoroughly,
      and SPEC-010 already reuses that rule for the same decision
- [ ] A `diagramConnection` is never adopted, asserted by drawing a connection whose start lands
      inside a node and finding it still parented to the page

### FR-002: Content belongs to its node

#### Description:

The point of the feature. All four of these are tldraw or existing behaviour once the parenting is
right, which is why they are one requirement rather than four — but each one is a separate way the
promise can silently fail, so each is asserted.

#### Acceptance Criteria:

- [ ] Moving a node moves its content with it, asserted on the content's **page** position before
      and after — not on `parentId`, which is what would still be right if nothing moved
- [ ] Folding a node hides its content. Falls out of `isHiddenByCollapse`'s ancestry walk, which is
      already type-blind; asserted rather than assumed
- [ ] Deleting a node deletes its content
- [ ] Content reaches a second client **as a child of the node** — asserted on `parentId`, not on
      presence. A `draw` shape already syncs today, before any change here, so a presence assertion
      cannot fail against this diff; the parenting is the part that could
- [ ] **Resizing a node leaves its content exactly where it is**, at the size it was — asserted on
      the content's page bounds **and its `parentId`**, through the real resize handle.
      Both halves, because they fail differently and the position half alone proves nothing:
      reparenting **preserves page position**, so a bounds-only assertion passes either way.
- [ ] **Shrinking a node CLEAR OF its content returns that content to the page** — the stated price
      of content being hand-draggable (settled 2026-09-06). tldraw's kickout cannot tell an explicit
      drag from an automatic one, so allowing the first allows the second. Rev 2 of this spec
      asserted the opposite here; it was corrected after the build measured it, rather than left to
      contradict what ships
- [ ] **A nested NODE also stays put on resize**, asserted the same way. This is the SPEC-004
      behaviour change above, and it is a criterion rather than a note because a future reader will
      otherwise read it as a regression
- [ ] Dragging content out of a node returns it to the page, and dragging it into another node
      re-parents it — both through real pointer input, not by calling `reparentShapes`. **Built and
      confirmed as tldraw's own behaviour (2026-09-06), after three false starts that each made it
      look broken: the test content was an UNFILLED rectangle, which is only hit on its outline, so
      the drag fell through to the box behind it; the draw tool was still current after drawing, so
      the drag drew instead of moving; and a hand-written escape rule fired mid-drag, which tldraw's
      translate then undid by restoring the parent it recorded at drag start. With those fixed,
      nothing of ours is needed.**

### FR-003: It does not fight sketch recognition

#### Description:

SPEC-010 converts a box-ish stroke into a node while its mode is on. That happens at stroke
*completion*; adoption happens at stroke *creation*. Both fire for the same stroke, and the
interaction has to be stated rather than discovered.

The good news is that it mostly resolves itself: handwriting is not box-shaped and not line-shaped,
so the recogniser refuses it and it stays content **even with the mode on**. The mode is a
convenience here, not a requirement.

#### Acceptance Criteria:

- [ ] With recognition **on**, handwriting drawn inside a node stays a `draw` child of that node —
      the recogniser refuses it, and the refusal path must leave the parenting alone
- [ ] With recognition **on**, a box-ish stroke drawn inside an expanded node becomes a nested
      `diagramNode`, exactly as SPEC-010 already specifies. Unchanged, and asserted here so that a
      later change to adoption cannot quietly break it
- [ ] With recognition **off**, a box-ish stroke drawn inside a node stays a `draw` child
- [ ] A converted stroke's replacement is parented by SPEC-010's own containment rule, not by
      whatever the stroke's parent happened to be. Stated because the stroke is now a child, so
      "delete the stroke and create a node" runs in a context it did not before

### FR-004: The system says what happens to content

#### Description:

A stroke cannot be described in the JSON document and this spec does not make it one. What it must
not do is let that be a surprise.

The machinery is already there and already correct — `undocumentableShapeCount` is
`onPage - (nodes + connections)`, and `getCurrentPageShapes` returns children as well as top-level
shapes, so content is already counted. This requirement is to **prove** that, because "it already
works" is exactly the claim that ships broken.

#### Acceptance Criteria:

- [ ] Content inside a node counts toward the export panel's undocumentable warning, asserted with
      content that exists **only** inside nodes — a count that happens to be right because there is
      also loose content on the page proves nothing
- [ ] Importing a document over a room with content inside nodes asks for confirmation, and one undo
      brings the content back
- [ ] The authoring guide says that content drawn inside a node is not carried by the format. It
      already says hand-drawn work is not exported; this makes it explicit that being *inside* a
      node does not change that, which is the reasonable wrong assumption

### FR-005: Nothing else regressed

#### Description:

Widening `canReceiveNewChildrenOfType` changes an answer that four other systems ask. This
requirement is the sweep.

#### Acceptance Criteria:

- [ ] **Connection targeting is unaffected**: a connection dropped on a node whose content sits under
      the cursor still binds to the node. `nodeAtPoint` filters to `diagramNode`, so this should
      hold — asserted because the failure is silent and it is the commonest gesture in the app
- [ ] **Merging is unaffected**: a container holding both content and child nodes still merges its
      connections on collapse exactly as SPEC-006 specifies
- [ ] **Export is unaffected**: a room whose nodes hold content exports **the same document** it
      would without the content. Not "byte for byte" — `getCurrentPageShapes` has no documented
      order, so a byte assertion would pin an implementation detail that can flip underneath it
- [ ] The node's own selection, resize handles and label editing behave as before with content
      present
- [ ] **The collapse toggle and its "N hidden" count are decided rather than inherited.**
      `descendantCount` is type-blind, so a box holding three pen strokes sprouts a collapse control
      and claims "3 hidden" — which reads as a claim about nested structure. Folding content with
      the node is right (FR-002); counting a pen stroke as a hidden *thing* is a separate question,
      and this criterion is to answer it deliberately in the build and say which way in the delivery
      doc
- [ ] **A `frame` adopted into a node does not silently drop nodes from the export.** `frame` is the
      one type where "everything except a connection" costs fidelity: `documentableNodeIds` requires
      every ancestor to be an exported `diagramNode`, so a node inside an adopted frame vanishes from
      the document with no warning. Reachable today via a page-level frame, so pre-existing — but
      this spec makes it easy, so it is either covered by the undocumentable count or `frame` joins
      the refusal list, and the delivery doc says which
- [ ] **Selecting a node together with its content and nudging does not double-move the content.**
      tldraw captures each shape's parent transform once and re-applies the stale matrix, so a child
      whose parent also moved lands at `initial + 2·delta` — measured at 100px for a 50px nudge.
      Pre-existing and true of nested nodes today, but content makes the selection trivial to build,
      because clicking a stroke selects the stroke. Attributed to tldraw in the delivery doc rather
      than fixed here, unless it is cheap

---

## Data Model

**No new record, no new shape, no new prop, no migration.** The change is one method's return value:

**TWO methods, not one.** Rev 1 said one, and a review measured that wrong before any code was
written — the second is what makes the settled resize behaviour true at all.

```ts
// src/client/shapes/NodeShapeUtil.tsx

/**
 * Everything except a connection, and nothing at all while folded.
 *
 * NOT a list of accepted types. A list is a thing that goes stale the first
 * time tldraw ships a new shape, and the rule is genuinely "is this a
 * connection", not "is this one of the six things we thought of".
 *
 * The cheap type test goes FIRST: this runs once per candidate parent on every
 * pointer-down of every stroke, and `sceneState` reads the store.
 */
override canReceiveNewChildrenOfType(shape: NodeShape, type: TLShape['type']) {
  if (type === CONNECTION_SHAPE_TYPE) return false
  const { scene, offScene } = sceneState(this.editor)
  return !effectiveCollapsed(shape.id, shape.props.collapsed, scene, offScene)
}

/**
 * Resizing a node does not resize what is inside it.
 *
 * `ShapeUtil.canResizeChildren` DEFAULTS TO TRUE, and tldraw's `Resizing` state
 * visits every descendant unless a parent says otherwise -- measured on the real
 * handle, a 300x200 node taken to 600x400 doubled its content and moved it, and
 * a non-uniform shrink squashed it by different factors on each axis. That is
 * exactly the outcome Out of Scope forbids, so "the change is one method"
 * was false.
 *
 * The hook takes the PARENT only, so it cannot answer differently for a stroke
 * and for a child node -- which is why the SPEC-004 change above is a product
 * decision rather than an implementation detail.
 */
override canResizeChildren() {
  return false
}
```

That the rest is free was rev 1's claim, and it did not survive: `canResizeChildren` was the
counterexample. FR-002 and FR-005 are where what remains of it is earned rather than asserted.

## API / Interface Contract

No new module. The one behaviour worth pinning in prose, because it is the thing a reader will
assume wrongly:

```
tldraw picks a parent at CREATION, in Editor.createShapes: it scans the page's
shapes back-to-front for one where canReceiveNewChildrenOfType is true, the
shape is not hidden, and isPointInShape holds for the partial's x/y.

For a draw shape that x/y is the POINTER-DOWN point. That is what makes "started
inside decides it" free -- and it is also why "entirely inside" would not be:
the stroke has no extent yet at the moment the parent is chosen.
```

## Configuration / Environment

None.

## File & Folder Structure

```
src/
└── client/
    └── shapes/
        └── NodeShapeUtil.tsx        # the one changed method
docs/
└── ai-authoring-guide.md            # + content inside a node is not exported
e2e/
└── node-content.spec.ts             # NEW -- all five FRs
```

## Implementation Phases

### Phase 1: Prove what happens AFTER adoption, before widening anything
- Rev 1 put the `createShapes` scan here. That was the wrong risk: a review verified it in twenty
  minutes and it was true. The risk is entirely post-adoption, and rev 1 had it landing in Phase 4 —
  after the plan, the PR grouping and three phases of work had all been built on "one method".
- So: **hand-parent a `geo` shape to a node with `reparentShapes`, then drive resize, kickout and
  the collapse count against it.** Those three answers decide how many methods the Data Model has,
  and therefore whether the plan being reviewed describes the real change
- Then the widening, and FR-001's criteria

### Phase 2: The promise
- FR-002 in full, each criterion separately — these are the ones a user would notice

### Phase 3: The interactions
- FR-003 and FR-004
- The guide sentence

### Phase 4: The sweep
- FR-005, which is the requirement that decides how much of "the rest is free" survived

**A note that belongs on every phase:** the e2e runs Chromium at an emulated iPad viewport, and
`architecture.md` carries an open defect that the app renders **blank on a real iPad**. This is an
iPad feature. A green suite here does not mean the gesture works on the device, and no criterion in
this spec can say that it does.
