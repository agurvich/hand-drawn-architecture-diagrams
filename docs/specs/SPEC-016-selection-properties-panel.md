# Spec: Selection properties panel

**ID:** SPEC-016
**Status:** Draft
**Last Updated:** 2026-09-08
**Depends On:** SPEC-008, SPEC-011, SPEC-014, SPEC-015

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

This spec builds that menu: one panel, anchored to the selected shape, carrying the properties of
whatever is selected. It **absorbs** the two panels that already do this work from a corner —
`IconPicker` and `ActorControl` — rather than adding a ninth independent cluster to chrome that is
already eight (`docs/handoff/2026-09-08-ipad-findings.md` → F7). Net chrome after this spec is one
cluster smaller, and the features stop being invisible.

## Scope

### In Scope

- One panel that appears when exactly one node or one connection is selected, anchored to that
  shape's on-screen bounds, clear of the shape's own manipulation handles and of the editor's
  controls.
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
- **Occlusion of shapes other than the selected one.** A panel anchored to a selection necessarily
  covers some canvas. It is dismissed by deselecting, which is a tap on empty canvas, and it never
  covers the *selected* shape or its handles (FR-001). Making it collapsible or draggable is not built
  here.
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

### FR-001: The panel appears with the selection, anchored to it

#### Description:

A single panel mounts beside `<Tldraw>` and renders only when the current selection is exactly one
`diagramNode` or one `diagramConnection`. It is placed adjacent to the selected shape, clear of that
shape's manipulation handles, clear of the editor's chrome, and inside the viewport. It re-anchors
when the shape moves, the camera changes, or the panel's own size changes; and it is suppressed while
the editor is doing something other than sitting idle with a selection.

Because the panel floats **over the canvas** rather than in a corner, it must not take gestures that
belong to the canvas. This is the one genuinely new risk in the change: the two panels it replaces
were pinned to corners and could never sit over a shape or its handles.

**Placement is a search over candidates, not an offset plus a clamp.** The obstacles it must miss —
tldraw's style panel, the quick-actions cluster — sit in the middle of an edge or away from every
edge, so a single "safe rect" cannot express them: a rect inset far enough to exclude the quick
actions at 820×1180 (which are 76px off the bottom and 201px off the left) would have to swallow most
of the viewport. `placePanel` therefore generates candidate placements and rejects the ones that
collide.

**The panel is offset from the shape's INTERACTION rect, not its bounds.** tldraw's handles extend
past the selection on a coarse pointer, and both Playwright projects set `hasTouch: true` because the
product is an iPad app. At zoom 1, from `SelectionForegroundOverlayUtil.mjs:325-328, 165`:
`mobileHandleMultiplier = 1.75`, `hitTargetSize = 6/zoom × 1.75 = 10.5`,
`hitTargetSizeX/Y = 10.5 × (1.75 × 0.75) = 13.78`, `cornerHitHalfSize = 13.78 × 1.5 = 20.67` — so a
corner handle's hit polygon reaches **20.67px past each edge**, and it is constant in *screen* px
because the constants scale by `1/zoom` in page space. A 12px offset from the bounds would put the
panel's top 8.67px inside both bottom corner handles, and the panel — a DOM sibling painted above the
canvas — would win the pointer. Above the shape it is worse: the mobile rotate handle is centred at
`cy = -hitTargetSize × 1.5 = -15.75` (`:401`) with its own radius on top. With a fine pointer the
reach is 6.75px and a small offset looks fine, so **desktop testing cannot see this** — which is why
the criteria below are drag tests on real handles, not arithmetic.

#### Acceptance Criteria:

- [ ] With nothing selected, no element with `data-testid="selection-panel"` is in the document.
- [ ] Selecting one node renders the panel; selecting one connection renders the panel.
- [ ] Selecting two or more shapes renders no panel; selecting one tldraw `geo`, `draw` or `arrow`
      shape renders no panel.
- [ ] The panel's rect intersects neither the selected shape's bounds nor its interaction rect
      (`INTERACTION_INSET`), in every one of `placePanel`'s four candidate sides.
- [ ] **On a coarse pointer at 820×1180, a drag started on each of the four corner resize handles
      resizes the shape, and a drag on the mobile rotate handle rotates it** — with the panel
      rendered. These are the criteria that actually gate the offset; the arithmetic above is the
      reason, not the test.
- [ ] A pointer-down inside the selected shape's bounds but *outside* the panel reaches the canvas: a
      drag begun there moves the shape, and is not interrupted by the panel mounting.
- [ ] The panel's bounding box intersects none of the rects `chromeRects()` returns, at 1024×768 and
      at 820×1180, and its presence does not change `document.documentElement.scrollWidth`.
- [ ] The panel's bounding box lies entirely within the viewport at both sizes.
- [ ] Panning the camera by 200px moves the panel by the same 200px in the same direction (±2px)
      **while `clamped` is false and `side` is unchanged between the two placements.** A flip from
      one side to another is a legitimate placement change and is excluded, not a failure.
- [ ] Opening the icon sheet re-runs placement: with the panel anchored low in the viewport, the sheet
      is fully inside the viewport and still clears every chrome rect. (The sheet is up to 320×420 in
      normal flow below its launcher, so a placement computed on the closed panel is wrong the moment
      it opens.)
- [ ] Collapsing an ancestor container so the selected shape becomes hidden removes the panel, because
      the selection is stripped (`stripHiddenFromSelection`).
- [ ] The panel is not rendered unless the editor is in `select.idle`. (`select.editing_shape` is
      already not idle, so double-click-to-rename suppresses it without a separate check.)
- [ ] When focus is inside the panel and the panel unmounts for any reason, focus moves to
      `.tl-container` — the only focusable canvas element — rather than being dropped to `<body>`
      (`best-practices/accessibility/accessibility.md` → 2.4.3). The check must capture
      `panelRef.current.contains(document.activeElement)` in the effect body, **before** cleanup runs,
      since by cleanup time `document.activeElement` is already `<body>`.
- [ ] Every interactive control in the panel is at least 44×44 CSS px, the bar `e2e/scenes.spec.ts`
      already holds the narration controls to. This includes the "Performed by" control, whose current
      rule is `min-width: 0` (`index.css:857`) and can therefore render narrower.
- [ ] Every interactive control in the panel sets `touch-action: manipulation`. `.canvas-host` sets
      `touch-action: none` (`index.css:23`), which descendants inherit, so a control that omits it is
      dead to touch on the target device while working on desktop.
- [ ] `placePanel` is pure and unit-tested for: a fit on the first candidate; each of the other three
      candidates being chosen in turn; every candidate colliding (the least-overlapping one is
      returned with `overlapping: true`); a panel larger than the viewport (clamped, still inside);
      and `side` reported correctly in each case.

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
- [ ] The sheet's `max-height` is computed from the room actually available below the launcher, not
      from `100dvh - 140px` (`index.css:951`), which was calibrated for a launcher pinned at
      `top: 60px` and over-claims when the panel is low in the viewport.
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
- [ ] `e2e/node-content.spec.ts:332` passes in portrait because the node it places is clear of the
      style panel's rect, not because the assertion was weakened or the test skipped in one project.
- [ ] A clearance test asserts the selection panel's bounding box intersects **none** of the rects
      `chromeRects()` returns, for a selected node and for a selected connection, with the icon sheet
      closed and open, and it runs in both projects.
- [ ] **Each selector in `CHROME_SELECTORS` is asserted individually to resolve to at least one
      element at 820×1180, and `.tlui-toolbar` is asserted to resolve to more than one.** A single
      "the list resolves to more than one element" assertion is vacuous — the list has eight entries,
      so it passes with the quick-actions selector matching nothing, which is the very defect this
      test exists to catch. Per `docs/process.md` §3, a gate owes a case per construct, and a gate
      tested against the thing it guards is not tested.

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

```ts
// src/client/panels/placePanel.ts
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Side = 'below' | 'above' | 'right' | 'left'

export interface Placement {
  left: number
  top: number
  /** Which candidate won. FR-001's pan criterion excludes a change of side. */
  side: Side
  /** True when the viewport moved the placement. */
  clamped: boolean
  /** True when no candidate cleared every obstacle and the least-bad one was taken. */
  overlapping: boolean
}

/**
 * How far past a shape's bounds tldraw's coarse-pointer handles reach, in screen
 * px. Larger at the top for the mobile rotate handle, which is centred 15.75px
 * above the top edge and has a radius of its own. Derived in FR-001; the drag
 * criteria there are what actually gate it.
 */
export const INTERACTION_INSET = { top: 40, right: 24, bottom: 24, left: 24 }

/** The offset between the interaction rect and the panel. */
export const GAP = 8

/**
 * Pure: no Editor, no DOM. All rects are screen-space.
 *
 * Candidates are tried in order — below, above, right, left — each centred on the
 * interaction rect along the free axis. The first that fits the viewport and
 * intersects no obstacle wins. If none does, the candidate with the smallest total
 * obstacle-overlap area is returned with `overlapping: true`, clamped into the
 * viewport.
 */
export function placePanel(
  interaction: Rect,
  panel: { w: number; h: number },
  viewport: Rect,
  obstacles: readonly Rect[],
): Placement
```

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
// src/client/panels/chromeRects.ts

/**
 * Every control cluster the panel must not cover.
 *
 * `querySelectorAll`, never `querySelector`: tldraw reuses `.tlui-toolbar` for
 * the style panel's inner toolbar AND for the bottom bar holding the quick
 * actions, and the first match at 820x1180 is the style panel's. That is why the
 * existing overlap tests never saw F5.
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
] as const

/** Zero-size and detached elements are skipped. Screen-space, viewport-relative. */
export function chromeRects(root?: Document): Rect[]
```

The narration bar is matched by class, not test id: its container is `<div className="narration">`
with no test id (`NarrationPanel.tsx:94`). `chromeRects` is exported so FR-007's clearance test
asserts against the same list the placement uses — one definition, checked from both sides.

**Screen space.** `placePanel`'s rects are viewport-relative (`getBoundingClientRect`'s frame). The
selection's rect comes from `editor.getShapePageBounds(id)` through `editor.pageToScreen`, which is
container-relative — the two coincide only because `.canvas-host` is `position: fixed; inset: 0`
(`index.css:24`). That coincidence is load-bearing; if the host ever gains an offset, the conversion
has to subtract the container's own rect.

**Re-placement.** Placement re-runs on: selection change, camera change, the selected shape's bounds
changing, viewport resize, and **the panel's own size changing** — a `ResizeObserver` on the panel
element, because opening the icon sheet grows it by up to 320×420 after it has already been placed.

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
├── SelectionPanel.tsx          # subject, placement, re-placement, focus handoff
├── SelectionPanel.test.tsx
├── selectionSubject.ts
├── placePanel.ts               # pure placement search
├── placePanel.test.ts
├── chromeRects.ts              # the clusters the panel must clear
└── fields/
    ├── NameField.tsx           # FR-002
    ├── IconField.tsx           # FR-003 — was panels/IconPicker.tsx
    ├── ActorField.tsx          # FR-004 — was panels/ActorControl.tsx
    └── NodeStatus.tsx          # FR-005
```

Deleted: `src/client/panels/IconPicker.tsx`, `src/client/panels/ActorControl.tsx`.
Changed: `src/client/actors.ts` gains `connectionsPerformedBy` (FR-005).

## Implementation Phases

Phases 2 and 3 each **absorb and delete in one step**. Splitting an absorb from its deletion would
leave two elements carrying the same test id, and Playwright's strict-mode `getByTestId` would red
44 call sites across two suites for as long as the split lasted — indistinguishable in CI from a real
regression.

### Phase 1: Subject, chrome and placement

- `selectionSubject`; `chromeRects` with the full selector list.
- `placePanel` — pure, with the unit tests FR-001's last criterion names.
- The `SelectionPanel` shell: anchored off the interaction rect, re-placed on camera, bounds, resize
  and its own size, rendered only in `select.idle`, with the focus handoff on unmount and
  `touch-action: manipulation` on its controls.
- Mount it in `Room.tsx`. It renders an empty frame; nothing is absorbed yet.

### Phase 2: Node fields, and IconPicker deleted

- `NameField` (FR-002), marking history on the first keystroke of a session.
- `IconField` (FR-003): move `IconPicker.tsx` in, keep its test ids and its `nodeId` reset effect, do
  **not** key it on the node id, and compute the sheet's `max-height` from available room.
- `NodeStatus` (FR-005) and `connectionsPerformedBy` in `actors.ts`.
- **Delete `IconPicker.tsx` and its mount in the same commit**, and rewrite `icons.spec.ts:420`.

### Phase 3: Connection field, and ActorControl deleted

- `ActorField` (FR-004): move `ActorControl.tsx` in, keeping the merge-index read, the several-actors
  option and the stand-in note, and giving the field its own width rule.
- **Delete `ActorControl.tsx` and its mount in the same commit**, and rewrite the three
  `actors.spec.ts` tests FR-004 names.

### Phase 4: Portrait in the matrix

- Add the `ipad-portrait` project at 820×1180.
- Move the node in `e2e/node-content.spec.ts:332` clear of the style panel.
- Add the clearance test (sheet closed and open) and the per-selector `CHROME_SELECTORS` resolution
  test, both running in both projects.
- Get the whole suite green in both.
