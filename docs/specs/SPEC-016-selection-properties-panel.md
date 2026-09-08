# Spec: Selection properties panel

**ID:** SPEC-016
**Status:** In Progress
**Last Updated:** 2026-09-08
**Depends On:** SPEC-008, SPEC-011, SPEC-013, SPEC-014, SPEC-015

## Overview

Selecting a node or a connection tells you nothing about it. Attributing a connection to the node
that performs it (SPEC-011), pinning an icon (SPEC-014), reading a merged edge's actors (SPEC-015) —
each is reachable only from a floating panel pinned to a fixed screen corner, with its own selection
condition, nowhere near the thing it acts on. Renaming is worse: it has no control at all, only a
double-click on the shape that nothing advertises. The owner of this project used the tool on an iPad
for the first time, selected shapes, saw nothing, and concluded the features had not been built. They
had. His words: *"When I select a node or an edge, it should have a properties menu that pops up so I
can rename it, select a new icon, identify it as an actor, add it to the scene, whatever. That's what
I expected and it didn't happen, so I don't know how to use the app if the features are there."*

This spec builds that menu: one panel, docked to the right of the canvas, that appears the moment
you select something and says what it is acting on. It **absorbs** the two panels that already do this work from a corner —
`IconPicker` and `ActorControl` — rather than adding a ninth independent cluster to chrome that is
already eight (`docs/handoff/2026-09-08-ipad-findings.md` → F7). Net chrome after this spec is one
cluster smaller, and the features stop being invisible.

## Scope

### In Scope

- One panel, docked to the right edge, that appears when exactly one node or one connection is
  selected and names its subject in a header.
- Renaming a node from the panel. **The panel's field is the discoverable rename; the existing
  double-click-to-edit textarea on the shape stays as it is.** They never run at once — FR-001
  suppresses the panel while its shape is being text-edited — so there is one live rename surface at
  any moment and no question of two undo granularities for one prop.
- Choosing a node's icon from the panel — `IconPicker`'s behaviour, moved inside.
- Attributing a connection from the panel — `ActorControl`'s behaviour, moved inside.
- Two read-only statements about a selected node: how many connections it performs, and how it
  stands relative to the active scene.
- Deleting `IconPicker` and `ActorControl` as independently-mounted chrome.
- A **portrait iPad viewport (820×1180)** added to the Playwright matrix, and the panel proved to
  clear the editor's chrome in both orientations.

### Out of Scope

- **Scene membership as a property of a shape.** The user asked to "add it to the scene". Scenes
  (SPEC-008/009) have no membership: a scene captures the collapsed state of the containers that had
  children when it was taken, and says nothing about any other node. FR-005 surfaces the state the
  model actually has; giving a shape a per-scene membership is a modelling change to the scenes area
  and belongs to its own spec.
- **A node-side "this is an actor" flag.** Attribution is a binding from a connection to a node
  (SPEC-011). The panel reports the bindings that exist; it does not introduce a flag on the node.
- **Properties for tldraw's own shapes** — geo, draw, native arrow. The panel renders nothing for
  them. That a native arrow looks like a connection and is not one is finding F3, and its own spec.
- **Multi-select properties.** More than one shape selected shows no panel, exactly as the two
  absorbed panels behave today.
- **Anchoring the panel to the selected shape.** Tried and abandoned. Placement failed three
  independent reviews in three different ways, the last of which built a conforming implementation
  that still covered the selected shape and its handles in 75% of node positions at 1024x768 with the
  icon sheet open. The decisive reason is structural rather than a tuning problem: a connection's
  bounds spans both endpoint nodes' CENTRES (`ConnectionShapeUtil.centreOf` resolves each terminal to
  `getShapePageBounds(nodeId).center`), so for a diagonal edge it is a large, nearly empty box that
  "beside the shape" has no meaning relative to -- and connections are half this panel's subjects.
  Connections also have `canResize() => false` and `hideRotateHandle() => true`
  (`ConnectionShapeUtil.tsx:63,66`), so the handle-clearance machinery an anchored panel needs is dead
  weight on them. A docked panel answers the finding -- something appears on selection, and it says
  what it applies to -- with none of that geometry.
- **Reclaiming the canvas the dock covers.** The dock occupies 320px of width whenever something is
  selected — 31% at 1024×768, 39% at 820×1180 — and a selected shape sitting under it cannot be
  resized or have its endpoints dragged without panning first. This is the same property tldraw's own
  style panel has today, and the mitigation is the same: two fingers pan. Nudging the camera to clear
  a selection it occludes is the obvious next move if this bites in use; it is deliberately not built
  here, because adding behaviour in response to a late review finding is how a spec's least-scrutinised
  work gets written.
- **A collapsible or resizable dock.** The panel is a fixed-width column, present only while something
  is selected. Letting the user drag or collapse it is not built here.
- **Repositioning the Scenes bar, the JSON launcher or the sketch toggle** (findings F5/F7). This
  spec adds the portrait viewport the next spec needs and keeps its own panel clear of the chrome; it
  does not move the other clusters. F5 is still present and now measured at 820×1180 on `00c1e47`:
  the narration bar occupies x 8–324, y 1074–1124, and tldraw's quick actions sit at x 201–385,
  y ~1084, so undo, redo, delete and duplicate stay covered.

  **Why the existing overlap tests do not catch it, which is not the same as their being exempt.**
  `e2e/scenes.spec.ts:1155` asserts the narration bar overlaps no `.tlui-toolbar`, and
  `e2e/scenes.spec.ts:1022` does an `elementFromPoint` on `.tlui-toolbar`'s centre (`:1042`) — but
  both use `document.querySelector`, which returns the **first** match. Measured at 820×1180 on
  `00c1e47`, that first match is the style panel's inner toolbar at x 664–812, y 6–118, not the bottom
  bar holding the quick actions. F5 therefore survives on DOM order, not on design, and a tldraw bump
  could flip it either way. FR-007 fixes the selector discipline for the panel this spec adds;
  repairing the two scenes assertions and moving the bar is the chrome spec's job.
- **Any change to shape props.** No prop is added, removed or retyped, so this spec ships no
  migration. A future revision that adds one must.

---

## Functional Requirements

### FR-001: A docked panel that appears with the selection and names it

#### Description:

A single panel mounts beside `<Tldraw>` as a **column docked to the right edge**, rendered only when
the current selection is exactly one `diagramNode` or one `diagramConnection`. It has a fixed width
and a fixed top and bottom; it scrolls internally when its content is taller than it is; and its
header names the subject, so the connection between the selected shape and the controls acting on it
is stated rather than implied by proximity.

**Why one dock serves both orientations.** The chrome was measured on `00c1e47` with a node selected,
by `document.querySelectorAll` on each interactive cluster:

| | landscape 1024x768 | portrait 820x1180 |
|---|---|---|
| menu zone + its toolbar | x 0-297, y 0-42 | x 0-117, y 0-42 |
| style panel (node selected) | x 868-1016, y 6-50 | x 664-812, y 6-50 |
| JSON launcher | x 481-543, y 8-52 | x 379-441, y 8-52 |
| narration bar | x 8-324, y 662-712 | x 8-324, y 1074-1124 |
| sketch toggle | x 925-1016, y 662-712 | x 721-812, y 1074-1124 |
| quick actions | (in the top bar) | x 199-387, y 1082-1126 |
| main toolbar | x 293-731, y 712-760 | x 191-629, y 1124-1172 |
| navigation panel | x 0-96, y 728-768 | x 0-60, y 1140-1180 |

**The style panel's height depends on the selection, and the dock's `top` depends on that.** Measured
with a `diagramNode` selected it is 44px tall (y 6-50), because a node shares no style props with
tldraw's own shapes. With nothing selected it is far taller — y 6-290 at 820×1180, the rect FR-007
quotes. The two figures are both true and do not conflict: the dock exists **only** while exactly one
node or connection is selected, which is exactly the condition that shrinks the panel. Stated here
because a reader comparing the two tables otherwise concludes one is wrong.

Everything on the right edge below the style panel is free until the sketch toggle, in both. A column
inset from the right, starting below the style panel and ending above the lowest of the bottom-edge
clusters, therefore clears every one of them under a single rule. The two numbers that differ between
orientations are the dock's bottom edge and its width; both are static CSS, and the clearance test in
FR-007 is what keeps them honest.

**Layout containers are deliberately not obstacles.** `.tlui-layout__top__right` spans x 860-1024,
y 0-712 in landscape -- the full height of the right side -- while the only thing drawn inside it is
the 44px-tall style panel. Treating that container as an obstacle would forbid the entire right edge
and there would be no dock. `CHROME_SELECTORS` names interactive clusters only, and this paragraph is
why.

#### Acceptance Criteria:

- [ ] With nothing selected, no element with `data-testid="selection-panel"` is in the document.
- [ ] Selecting one node renders the panel; selecting one connection renders the panel.
- [ ] Selecting two or more shapes renders no panel; selecting one tldraw `geo`, `draw` or `arrow`
      shape renders no panel.
- [ ] The panel's header names the subject. For a node: its label, or "Untitled" when empty. For a
      connection: the labels of its two endpoints **as the canvas resolves them** — through
      `ConnectionShapeUtil.nodeIdFor`, which returns the container a folded endpoint is drawn as, and
      **not** the raw binding (`boundNodeIds`, `:369`), which names the hidden child. This is the same
      rule `ActorControl` follows for a *reading* (`ActorControl.tsx:93-107`), and picking the raw
      binding would reproduce one row higher in the same panel the exact defect that read exists to
      prevent: the panel and the canvas saying different sentences about one line.
- [ ] A **half-bound** connection — `nodeIdFor` returns `null` for one terminal, the state
      `e2e/helpers.ts`'s `addHalfConnection` exists to create — shows the bound endpoint's label and
      says the other end is unattached. It does not render "undefined" or fall back to the raw binding.
- [ ] An endpoint whose label is empty reads "Untitled", as a node subject does.
- [ ] On a **merged** line the header names the group's endpoints, and the panel says the line stands
      for several connections. `ActorField` already says this two rows down; the header must not
      contradict it by presenting the line as a single connection.
- [ ] Renaming a node through FR-002 updates the header, including when that node is an endpoint of a
      selected connection.
- [ ] The panel's bounding box intersects none of the rects `chromeRects()` returns, at 1024x768 and
      at 820x1180, with the icon sheet closed **and** open, and **after a sketch recognition has
      announced**. That last state is the one that actually collides and the one a fresh room cannot
      reach: `.sketch-toggle`'s status region is written by `recogniseOnDraw.ts` and never cleared, so
      `:not(:empty)` padding (`index.css:805`) permanently raises the cluster's top edge for the rest
      of the session. A clearance test run only in a fresh room measures the one state that cannot
      fail — the failure mode FR-007's own quick-actions argument describes.
- [ ] **The dock is not rendered while the JSON panel is expanded.** The two cannot coexist:
      `.diagram-io` is `left: 50%` with `width: min(420px, calc(100vw - 16px))` (`index.css:304,334`),
      so it spans x 302-722 at 1024 and x 200-620 at 820, and a right-edge dock intersects it in both
      — clearing a centred 420px panel at 820px would need a dock no wider than 192px. Both carry
      `z-index: 1000` and `DiagramIOPanel` mounts first, so the dock would paint over its right edge
      and reproduce verbatim the defect `index.css:820` records: export/import unreachable whenever a
      connection was selected. Opening the JSON panel does not clear the selection, so this must be
      explicit. The open flag lifts into `Room.tsx` as ordinary React state shared by the two panels —
      it is ephemeral view state, not domain state, so it does not belong in the tldraw store.
- [ ] Closing the JSON panel brings the dock back with the same selection still selected.
- [ ] The panel declares `z-index: 1000`, as every other floating sibling in `index.css` does
      (`:86, :309, :480, :757`). `.tl-container` sets no z-index and tldraw's UI layer is 300, so an
      `auto` dock paints beneath the whole tldraw UI.
- [ ] The panel's bounding box lies entirely within the viewport at both sizes, and its presence does
      not change `document.documentElement.scrollWidth`.
- [ ] Content taller than the dock scrolls **inside** the panel: with the icon sheet open at 1024x768,
      the panel's `scrollHeight` exceeds its `clientHeight`, its last control is reachable by
      scrolling, and the panel's own rect is unchanged by opening the sheet.
- [ ] Panning or zooming the camera does not move the panel. Nothing about the panel's position
      depends on where the selected shape is.
- [ ] Collapsing an ancestor container so the selected shape becomes hidden removes the panel, because
      the selection is stripped (`stripHiddenFromSelection`).
- [ ] The panel is not rendered unless the editor is in `select.idle`. (`select.editing_shape` is
      already not idle, so double-click-to-rename suppresses it without a separate check.)
- [ ] A pointer-down anywhere on the canvas outside the panel reaches the canvas: drawing a stroke
      that starts outside the dock is unaffected by the panel being open.
- [ ] When focus is inside the panel and the panel unmounts for any reason, focus moves to
      `.tl-container` -- the only focusable canvas element -- rather than being dropped to `<body>`
      (`best-practices/accessibility/accessibility.md` -> 2.4.3). The check must capture
      `panelRef.current.contains(document.activeElement)` in the effect body, **before** cleanup runs,
      since by cleanup time `document.activeElement` is already `<body>`.
- [ ] Every interactive control in the panel is at least 44x44 CSS px, the bar `e2e/scenes.spec.ts`
      already holds the narration controls to. This includes the "Performed by" control, whose current
      rule is `min-width: 0` (`index.css:857`).
- [ ] The panel and every scrollable or interactive descendant set an explicit `touch-action`
      (`manipulation` for controls, `pan-y` for the scroll container). `.canvas-host` sets
      `touch-action: none` (`index.css:26`) and the used value is intersected with ancestors, so a
      scroll container that omits it cannot be scrolled by touch on the target device while working
      under a desktop mouse wheel.

### FR-002: Rename a node from the panel

#### Description:

The node panel carries a labelled text field bound to the node's `label` prop. It is a controlled
field writing straight through to the shape — there is no local buffer — so the canvas updates as you
type and the change syncs. An editing session is one undo step.

#### Acceptance Criteria:

- [ ] With a node selected, a field with an accessible name of "Name" shows the node's current label.
- [ ] Typing into it updates the node's rendered label on the canvas.
- [ ] After typing into the field and blurring it, one `editor.undo()` restores the label the node had
      before the first keystroke. The history mark is taken on the **first keystroke of a session**,
      not on focus: marking on focus leaves an empty mark behind when a user focuses and blurs without
      typing, and the next undo is then a press that does nothing.
- [ ] The change is visible to a second browser context in the same room (sync).
- [ ] Clearing the field to empty is allowed and leaves the node with an empty label; the icon falls
      back to whatever `resolveNodeIcon('', '')` gives, unchanged from today.
- [ ] Selecting a different node shows that node's label. The field holds no state the shape does not
      have, so there is nothing uncommitted to carry across; a test selects node A, types, selects B,
      and asserts B's field shows B's label and B's props are untouched.
- [ ] Double-clicking the node still opens the existing in-canvas textarea
      (`data-testid="diagram-node-input"`), and while it is open the panel is not rendered — so the
      two rename surfaces are never both live. `e2e/custom-shape.spec.ts:159` still passes.

### FR-003: Choose a node's icon from the panel

#### Description:

`IconPicker`'s control moves into the node panel. Its three states, its too-small note and its
keyboard behaviour are preserved. Its **focus machinery is not** — it has to change, because the
component's current correctness depends on never unmounting.

`IconPicker` today early-returns `null` while its hooks keep running; its own comment says so
(*"The component stays mounted across the change, so `open` has to be reset explicitly"*). Inside a
panel that unmounts on deselect, the `[open]` effect's `else if (wasOpen.current) launcher.current?.focus()`
never runs on unmount — `launcher.current` is already null — and focus lands on `<body>`, the exact
failure the component's own comment at `IconPicker.tsx:98` warns about. FR-001's focus criterion is
what covers this, and it belongs to the panel, not the field.

#### Acceptance Criteria:

- [ ] All three icon states are reachable from the panel: "Automatic" clears `icon` to `''`,
      "No icon" sets `ICON_NONE`, and a grid cell pins that key.
- [ ] Pinning an icon is one undoable step.
- [ ] The launcher's accessible name still distinguishes "chosen automatically" from "chosen by hand"
      and names the current icon.
- [ ] The sheet closes on Escape, opening moves focus into the sheet, and a user-performed close
      returns focus to the launcher.
- [ ] Selecting a different node closes an open sheet **and does not steal focus**
      (`e2e/icons.spec.ts:309`). The field is **not** keyed on the node id: a `key` would remount it
      and make the existing `nodeId` reset effect dead code, and that effect is what orders the reset
      before the focus effect re-runs. FR-002 needs no key either, since its field is controlled.
- [ ] On a node too small to draw an icon beside its label, the explanatory note still appears.
- [ ] The sheet renders **inside the dock's scroll flow**. Its `width: min(320px, 100vw - 16px)` and
      `max-height: min(420px, 100dvh - 140px)` (`index.css:951`) were both calibrated for a launcher
      pinned at `top: 60px` over open canvas. **Both are removed, not recomputed**: the sheet takes the
      column's width and no max-height of its own, and the column scrolls. A sheet that caps and
      scrolls itself would keep the panel's `scrollHeight` equal to its `clientHeight` and red
      FR-001's scroll criterion, so the two are not interchangeable.
- [ ] The sheet's 320px width is removed rather than inherited: `min(320px, calc(100vw - 16px))`
      resolves to 320px at both viewport widths, and `overflow-y: auto` forces `overflow-x` to compute
      to `auto`, so leaving it would give the dock a horizontal scrollbar. A test asserts the dock's
      `scrollWidth` equals its `clientWidth` with the sheet open.
- [ ] The sheet drops `role="dialog"`. Over open canvas it was a popover; inside the column it is an
      inline expanded region with the launcher and every other field still visible and operable around
      it, and a dialog role there is the role without the behaviour. The launcher keeps
      `aria-expanded`, and Escape still closes and returns focus — `e2e/icons.spec.ts:252` holds
      either way, since the listener is on `window` and the panel is a sibling of `<Tldraw>`.
- [ ] Every assertion in `e2e/icons.spec.ts` about icon *state* passes unchanged. Exactly one test is
      rewritten: `e2e/icons.spec.ts:420` *"the picker does not cover any other control"*, which
      contains no state assertion at all — it is wholly positional, and one of the selectors it
      checks (`[data-testid="actor-control"]`) stops existing under FR-006. It is replaced by
      FR-007's clearance test.

### FR-004: Attribute a connection from the panel

#### Description:

`ActorControl`'s "Performed by" control moves into the connection panel unchanged in behaviour,
including the three cases it took two specs to get right: the merge-index read, the several-actors
option, and the folded stand-in note.

#### Acceptance Criteria:

- [ ] With one connection selected, a control with an accessible name of "Performed by" lists the
      page's nodes plus "Nobody in particular", and choosing one attributes the connection.
- [ ] On a merged line the control reads through the merge index, is disabled, and the note names the
      count and — when there is more than one — every actor, wrapping rather than truncating.
- [ ] When the attributed node is folded away, the stand-in note names both the real actor and what
      the canvas draws in its place.
- [ ] Duplicate node labels are still disambiguated in the list.
- [ ] The `id="actor-control-select"` / `htmlFor` pair still associates label and control, and appears
      exactly once in the document.
- [ ] The control stacks rather than sitting in a row. `.actor-control` is `display: flex;
      align-items: center` — a label, a select and two notes side by side, which was legible across a
      full-viewport bar and is not inside a 312px column.
- [ ] Every assertion in `e2e/actors.spec.ts` about attribution *behaviour* passes unchanged. Exactly
      three tests are rewritten, all of them measuring the old fixed position or a width the panel no
      longer has: `:353` *"the control does not cover the JSON launcher or any tldraw UI"* (replaced
      by FR-007's clearance test), `:404` *"the control fits a 375px viewport"* (its premise is the
      `left: 8px; right: 8px` full-width bar at `index.css:828`, which stops existing), and `:421`
      *"a MERGED line names its actors somewhere READABLE at 375px"* (its readability now depends on
      the panel's own width rules, and it must assert against the panel's measured rect).

### FR-005: The panel states what the selected node already is

#### Description:

Two read-only lines on the node panel, each present only when it has something true to say. The first
answers "identify it as an actor" from the node's side. The second answers "add it to the scene" as
far as the model allows.

The scene line's predicate is stated here rather than left to the implementer. A scene records a
collapsed value only for nodes that **had children when it was captured** (`captureCollapsedMap`,
`sceneView.ts:225`), so it has no opinion about anything else and the panel must not invent one.
Separately, the off-scene set is **add-only** (`takeOffSceneAndToggle`, `sceneView.ts:164`:
`if (nodeIds.includes(shape.id)) return`), so membership of that set does *not* mean the node
currently differs from the scene — toggle a container twice and it matches again while still being in
the set. The predicate is therefore about **values**, not about set membership.

The actor count needs a reverse read that does not exist yet: `actorIdOf`/`actorBindingsOf` go
connection→node, and `getBindingsToShape` appears nowhere in `src/`. It is new code, and it lives at
`src/client/actors.ts` beside the other three, not in the panel.

#### Acceptance Criteria:

- [ ] `connectionsPerformedBy(editor, nodeId): TLShapeId[]` is added to `src/client/actors.ts`,
      returning the connections whose chosen actor binding points at this node, ordered by id so two
      clients agree.
- [ ] A node that is the actor of no connection shows no actor line.
- [ ] A node that is the actor of one connection shows a line saying so in the singular; a node that
      is the actor of three shows the count.
- [ ] The count is of bindings — the document's answer. When one or more of those connections is
      currently hidden (`editor.isShapeHidden(id)`, which is how a member of a merge group is hidden
      behind its representative), the line also says how many are drawn right now, in the same spirit
      as `ActorControl`'s stand-in note: the panel and the canvas may differ, and when they do it is
      said out loud rather than left to be discovered.
- [ ] Deleting the connection a node performs removes the line without reselecting.
- [ ] With no scene active, no scene line appears.
- [ ] With a scene active but no captured value for this node — `Object.hasOwn(scene.collapsed, id)`
      is false, which is every node that had no children when the scene was taken — **no scene line
      appears.** A "following the scene" line on a leaf node the scene never mentions is a false
      statement, and this criterion is the one that forbids it.
- [ ] With a scene active and a captured value equal to the node's effective state
      (`effectiveCollapsed(id, own, scene, offScene)`), the panel says the node matches the scene.
- [ ] With a scene active and a captured value that differs from the effective state, the panel says
      the node has been changed away from the scene, and offers a restore control.
- [ ] **Toggling such a node twice shows the match line, not the changed-away line** — even though the
      node is still in the off-scene set. This is the criterion that fails an implementation keyed on
      set membership instead of on values.
- [ ] The restore control calls `viewScene(editor, activeSceneId)` and introduces no new mutation. Its
      label says that it restores the whole scene, not this node — because that is what `viewScene`
      does (`sceneView.ts:110`, it clears the entire off-scene set) and a control on a node panel
      would otherwise read as acting on that node alone.

### FR-006: The absorbed panels stop existing as separate chrome

#### Description:

`IconPicker` and `ActorControl` are no longer mounted as independent floating boxes. Their code moves
into the panel's field components; the standalone files and their positioned CSS go. Each is deleted
in the **same phase** that absorbs it, so no build ever has two of either.

#### Acceptance Criteria:

- [ ] `src/client/panels/IconPicker.tsx` and `src/client/panels/ActorControl.tsx` no longer exist, and
      `Room.tsx` mounts neither.
- [ ] With one node selected, `getByTestId('icon-picker')` resolves to exactly one element; with one
      connection selected, `getByTestId('actor-control')` resolves to exactly one. Playwright's
      strict mode makes this the criterion that fails loudest if an absorb-then-delete is ever split
      across two commits — there are 23 such call sites in `icons.spec.ts` and 21 in `actors.spec.ts`.
- [ ] Neither field renders at a position of its own: the computed style of `.icon-picker` and
      `.actor-control` reports `position: static`, asserted in the DOM rather than by grepping CSS
      source — a source scan cannot see a rule that arrives from another selector, and
      `src/shared/scenes/boundary.test.ts:16` already sets the house precedent (*"Asserted on the
      resulting SCHEMA, not on source text"*).
- [ ] `.actor-control`'s notes still wrap rather than truncate at the panel's width. They currently
      rely on `.actor-control__note { max-width: 240px }` (`index.css:872`) inside a container spanning
      `left: 8px; right: 8px` (`:828`); the container width is what changes, so the field needs its
      own width rule rather than inheriting the viewport.
- [ ] `docs/component-inventory.md` names the panel and no longer names the two absorbed controls as
      standalone components.

### FR-007: Portrait iPad is in the e2e matrix

#### Description:

Playwright gains a second project at 820×1180 — the way the device is actually held to sketch. Every
overlap and fit assertion in the suite runs in both orientations, and the new panel is proved to clear
the chrome in each.

The size of the **viewport** half of this job is measured, not estimated. The whole suite was run at
820×1180 against `00c1e47` — before this spec's panel exists — and returned **284 passed, 1 failed**.
The one failure is `e2e/node-content.spec.ts:332` (*"a box with content can still be SELECTED and
RENAMED"*), which places a node at page x 550–850, y 150–350 and clicks its centre at screen
(700, 250); at 820px wide tldraw's style panel occupies x 664–812, y 6–290, so the click lands on the
style panel instead of the canvas. It is a test coordinate that only worked at 1024px, not an app
defect. That baseline sizes the *viewport* change only — the edits FR-003, FR-004 and FR-006 cause in
`icons.spec.ts` and `actors.spec.ts` are on top of it.

#### Acceptance Criteria:

- [ ] `playwright.config.ts` defines a second project named `ipad-portrait` at 820×1180 with the same
      touch and CDP settings as `ipad-chromium`, and both projects run by default.
- [ ] The whole e2e suite passes in both projects.
- [ ] `e2e/node-content.spec.ts:332` passes in portrait because the node it places is clear of **both**
      the style panel and the dock, at both viewport sizes — not because the assertion was weakened or
      the test skipped in one project. Clearing the style panel alone is not enough: in portrait the
      style panel is x 664-812 and the dock is x 500-812, so the click point must fall left of 500.
- [ ] **Six existing sites that pointer-down under the dock with a single shape selected are moved,
      and the fix is a sweep rather than a sample.** They are `node-content.spec.ts:216, :237, :263`
      (`dragCorner` on nodes whose bottom-right corner lands in the dock), `node-content.spec.ts:357`
      (a `dblclick` at a point the preceding click selected), `connections.spec.ts:322` and
      `merged-connections.spec.ts:477` (`dragEndpoint`, where the endpoint resolves into the band).
      `dragCorner` and `dragEndpoint` drive raw `page.mouse`, so there is no actionability error — the
      press lands on the dock and the drag silently does nothing, failing a downstream assertion about
      parentage or bindings. Two of these clear the landscape dock by 4px, so the sweep is re-run
      whenever the dock's width or inset changes.
- [ ] A clearance test asserts the selection panel's bounding box intersects **none** of the rects
      `chromeRects()` returns, for a selected node and for a selected connection, with the icon sheet
      closed and open **and after a sketch recognition has announced**, and it runs in both projects.
      The post-recognition state is the one a fresh room cannot reach and the reason `bottom` is 160px
      rather than the 114px a closed-state measurement gives.
- [ ] **Each selector in `CHROME_SELECTORS` is asserted individually**, not as a list. A single
      "the list resolves to more than one element" assertion is vacuous — the list has eight entries,
      so it passes with the quick-actions selector matching nothing, which is the very defect this
      test exists to catch (`docs/process.md` §3: a gate owes a case per construct, and a gate tested
      against the thing it guards is not tested). Specifically: at 820×1180 every selector resolves to
      at least one element and `.tlui-toolbar` to more than one; at 1024×768 the same holds **except
      `.tlui-main-toolbar__extras__controls`, which correctly resolves to none** — tldraw keeps the
      quick actions in the top bar in landscape and only moves them to the bottom below its
      `TABLET_SM` breakpoint. The landscape case is asserted as an expected zero so that a future
      reader does not "fix" it, and so that the selector going stale in portrait is still caught.

---

## Data Model

No new records and no changed shape props — therefore no migration. The panel is a view over records
that already exist.

```ts
// src/client/panels/selectionSubject.ts
export type SelectionSubject =
  | { kind: 'node'; id: TLShapeId }
  | { kind: 'connection'; id: TLShapeId }

/**
 * The one shape the panel is about, or null for none / several / an unsupported
 * type. Takes a non-null Editor; the null check stays in the caller, as it does
 * for every other panel in `Room.tsx`.
 */
export function selectionSubject(editor: Editor): SelectionSubject | null
```

There is no placement model, no obstacle search and no geometry: the dock's position is CSS, and it
needs no orientation media query at all. Both orientations take the same values, which is a
consequence of the measurements in FR-001 rather than a coincidence: the style panel ends at y 50 in
both, and the bottom-left/bottom-right clusters are anchored `bottom: 56px` (`index.css:478`) in both,
so they sit the same distance above the viewport floor whatever the height.

`bottom` is **160px, not the 114px the closed-state measurement suggests**, because `.sketch-toggle`
grows: `recogniseOnDraw.ts` writes its status region and never clears it, and
`.sketch-toggle__status:not(:empty)` then adds padding and a border (`index.css:805`), lifting the
cluster's top edge by roughly 40px for the rest of the session. 114px clears the bar you see in a
fresh room and not the one you have after drawing once.

```css
/* src/client/index.css */
.selection-panel {
  position: absolute;
  top: 58px;         /* clears the style panel (ends y 50) and the JSON launcher (ends y 52) */
  right: 8px;
  width: min(312px, calc(100vw - 96px));  /* 312 at 1024 and 820; 279 at 375 */
  bottom: 160px;     /* clears the sketch toggle AFTER its status region fills */
  z-index: 1000;     /* as every other floating sibling in this file */
  /* not rendered at all while the JSON panel is expanded — see FR-001 */
  overflow-y: auto;
  touch-action: pan-y;
}
```

`width` is capped rather than fixed at `312px`: `e2e/actors.spec.ts`
exercises a **375px** viewport, where a fixed 312px dock would leave 55px of canvas, and the
`min(320px, 100vw - 16px)` rule that used to handle narrow widths is being deleted with
`.icon-picker__sheet`. Two measured widths do not justify a rule at a third the suite already visits.

These numbers are a **starting point derived from the measurements, not a result**. FR-007's
clearance test is what decides whether they are right, and it runs in both orientations.

---

## API / Interface Contract

```tsx
// src/client/panels/SelectionPanel.tsx
export function SelectionPanel({ editor }: { editor: Editor | null }): React.JSX.Element | null
```

`React.JSX.Element`, not `JSX.Element`: React 19 removed the global `JSX` namespace, and the bare form
fails to compile under this repo's `@types/react` 19.2 with `TS2503: Cannot find namespace 'JSX'`.

```tsx
// The four fields. Each takes the resolved id, never the selection, so none of
// them repeats the subject logic.
function NameField({ editor, id }: { editor: Editor; id: TLShapeId }): React.JSX.Element
function IconField({ editor, id }: { editor: Editor; id: TLShapeId }): React.JSX.Element
function NodeStatus({ editor, id }: { editor: Editor; id: TLShapeId }): React.JSX.Element | null
function ActorField({ editor, id }: { editor: Editor; id: TLShapeId }): React.JSX.Element
```

Mounted exactly like the panels it replaces — **a sibling of `<Tldraw>`, not a `components`
override**. That is the whole pointer-isolation mechanism and it is load-bearing: a sibling sits
outside `.tl-container`, so its pointer events never reach tldraw's container listeners and no
`stopPropagation` is needed. Keyboard isolation comes free the same way — `e2e/icons.spec.ts:252`
already proves Escape inside the sheet leaves the node selected — so a text input in the panel will
not fire tldraw's shortcuts.

```ts
// e2e/chromeRects.ts

/**
 * Every interactive control cluster the docked panel must not cover.
 *
 * `querySelectorAll`, never `querySelector`: tldraw reuses `.tlui-toolbar` for
 * the style panel's inner toolbar AND for the bottom bar holding the quick
 * actions, and the first match at 820x1180 is the style panel's. That is why the
 * existing overlap tests never saw F5.
 *
 * LAYOUT CONTAINERS ARE NOT HERE. `.tlui-layout__top__right` spans the full
 * height of the right side while holding one 44px-tall panel; listing it would
 * forbid the dock's entire column. See FR-001.
 */
export const CHROME_SELECTORS = [
  '.tlui-menu-zone',
  '.tlui-style-panel',
  '.tlui-toolbar',
  '.tlui-navigation-panel',
  '.tlui-main-toolbar__extras__controls',
  '.narration',
  '.sketch-toggle',
  '[data-testid="diagram-io-open"]',
  // The LAUNCHER only. The expanded `[data-testid="diagram-io"]` is deliberately
  // absent: it is centred and 420px wide, so no right-edge dock can clear it,
  // and FR-001 resolves that by not rendering the dock while it is open rather
  // than by geometry. The two are mutually exclusive in the DOM anyway --
  // `DiagramIOPanel` early-returns the launcher when open -- so listing both
  // would make FR-007's per-selector resolution test unsatisfiable in any single
  // state.
] as const

/** Zero-size and detached elements are skipped. Viewport-relative. */
export function chromeRects(root?: Document): Rect[]
```

`chromeRects` lives in `e2e/`, not `src/`: the dock's position is static CSS and reads nothing at
runtime, so this is test-only code and shipping it in the client bundle would be dead weight. It is a
named module rather than an inline literal so FR-007's clearance test and its per-selector resolution
test assert against one list rather than two copies that drift. The narration bar is matched by class, not test id: its container is
`<div className="narration">` with no test id (`NarrationPanel.tsx:94`).

Test ids are **preserved from the absorbed panels** so the suites that prove their behaviour keep
proving it: `icon-picker`, `icon-picker-open`, `icon-picker-sheet`, `icon-picker-auto`,
`icon-picker-none`, `icon-picker-cell`, `icon-picker-too-small`, `actor-control`, `actor-select`,
`actor-select-several`, `actor-control-standin`, `actor-control-merged`. New: `selection-panel`,
`selection-name`, `selection-actor-of`, `selection-scene-state`, `selection-scene-restore`.

## Configuration / Environment

None. `E2E_PORT` already exists (`playwright.config.ts:18`) and the second project inherits it
without change.

## File & Folder Structure

```
src/client/panels/
├── SelectionPanel.tsx          # subject, header, focus handoff
├── SelectionPanel.test.tsx
├── selectionSubject.ts
└── fields/
    ├── NameField.tsx           # FR-002
    ├── NameField.test.tsx
    ├── IconField.tsx           # FR-003 — was panels/IconPicker.tsx
    ├── ActorField.tsx          # FR-004 — was panels/ActorControl.tsx
    ├── NodeStatus.tsx          # FR-005
    └── NodeStatus.test.tsx

e2e/
└── chromeRects.ts              # CHROME_SELECTORS + chromeRects(), test-only
```

`IconField` and `ActorField` get no new unit tests: their behaviour is already covered end to end by
`icons.spec.ts` and `actors.spec.ts`, which FR-003 and FR-004 hold to passing unchanged apart from the
four positional tests they name.

Deleted: `src/client/panels/IconPicker.tsx`, `src/client/panels/ActorControl.tsx`.
Changed: `src/client/actors.ts` gains `connectionsPerformedBy` (FR-005).

## Implementation Phases

Phases 2 and 3 each **absorb and delete in one step**. Splitting an absorb from its deletion would
leave two elements carrying the same test id, and Playwright's strict-mode `getByTestId` would red
44 call sites across two suites for as long as the split lasted — indistinguishable in CI from a real
regression.

### Phase 1: Subject, dock and chrome list

- `selectionSubject`; `e2e/chromeRects.ts` with the full selector list.
- The `SelectionPanel` shell: the docked column and its CSS, the subject header, internal scrolling,
  rendered only in `select.idle`, with the focus handoff on unmount and explicit `touch-action` on
  the scroll container and every control.
- Lift `DiagramIOPanel`'s open flag into `Room.tsx` so the dock can stand down while it is expanded.
- Mount it in `Room.tsx`. It renders a header and an empty body; nothing is absorbed yet.
- **Move the six sites FR-007 names in this phase, not in Phase 4.** The dock exists from the moment
  it is mounted, so `node-content.spec.ts:237` reds immediately at 1024x768 and `:263` goes
  *silently green* — its assertions are that the inner node did not move and is still parented, which
  a drag that did nothing satisfies, so it would stop exercising resize for three phases without
  saying so.

### Phase 2: Node fields, and IconPicker deleted

- `NameField` (FR-002), marking history on the first keystroke of a session.
- `IconField` (FR-003): move `IconPicker.tsx` in, keep its test ids and its `nodeId` reset effect, do
  **not** key it on the node id, and remove the sheet's own width and `max-height` so the column
  scrolls (FR-003).
- `NodeStatus` (FR-005) and `connectionsPerformedBy` in `actors.ts`.
- **Delete `IconPicker.tsx` and its mount in the same commit**, and rewrite `icons.spec.ts:420`.

### Phase 3: Connection field, and ActorControl deleted

- `ActorField` (FR-004): move `ActorControl.tsx` in, keeping the merge-index read, the several-actors
  option and the stand-in note, and giving the field its own width rule.
- **Delete `ActorControl.tsx` and its mount in the same commit**, and rewrite the three
  `actors.spec.ts` tests FR-004 names.

### Phase 4: Portrait in the matrix

- Add the `ipad-portrait` project at 820×1180.
- Move the node in `e2e/node-content.spec.ts:332` clear of both the style panel and the dock.
- Add the clearance test — sheet closed and open, and after a recognition has announced — plus the
  per-selector `CHROME_SELECTORS` resolution test and a test that the dock stands down while the JSON
  panel is expanded and returns when it closes. All in both projects.
- Get the whole suite green in both.
