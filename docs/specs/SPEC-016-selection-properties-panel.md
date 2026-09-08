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
  shape's on-screen bounds and kept clear of the editor's own controls.
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
- **Repositioning the Scenes bar, the JSON launcher or the sketch toggle** (findings F5/F7). This
  spec adds the portrait viewport the next spec needs and keeps its own panel clear of the chrome; it
  does not move the other clusters. F5 is still present and now measured at 820×1180 on `00c1e47`:
  the narration bar occupies x 8–324, y 1074–1124, and tldraw's quick actions sit at x 201–385,
  y ~1084, so undo, redo, delete and duplicate stay covered.

  **Why the existing overlap tests do not catch it, which is not the same as their being exempt.**
  `e2e/scenes.spec.ts:1155` asserts the narration bar overlaps no `.tlui-toolbar`, and
  `e2e/scenes.spec.ts:1022` does an `elementFromPoint` on `.tlui-toolbar`'s centre (`:1042`) — but both use
  `document.querySelector`, which returns the **first** match. Measured at 820×1180 on `00c1e47`,
  that first match is the style panel's inner toolbar at x 664–812, y 6–118, not the bottom bar
  holding the quick actions. F5 therefore survives on DOM order, not on design, and a tldraw bump
  could flip it either way. FR-007 fixes the selector discipline for the panel this spec adds
  (`querySelectorAll`, and the quick-actions container named explicitly); repairing the two scenes
  assertions and moving the bar is the chrome spec's job.
- **Any change to shape props.** No prop is added, removed or retyped, so this spec ships no
  migration. A future revision that adds one must.

---

## Functional Requirements

### FR-001: The panel appears with the selection, anchored to it

#### Description:

A single panel mounts beside `<Tldraw>` and renders only when the current selection is exactly one
`diagramNode` or one `diagramConnection`. It is positioned from the selected shape's screen-space
bounds — below them by a fixed gap, flipped above when the below placement would leave the safe rect
— and clamped into a **safe rect derived at runtime** from the editor's own chrome (see the interface
contract). It re-anchors when the shape moves or the camera changes, and is suppressed while the
editor is doing something other than sitting idle with a selection.

Because the panel floats **over the canvas** rather than in a corner, it must not take gestures that
belong to the canvas. This is the one genuinely new risk in the change: the two panels it replaces
were pinned to corners and could never sit over a shape.

#### Acceptance Criteria:

- [ ] With nothing selected, no element with `data-testid="selection-panel"` is in the document.
- [ ] Selecting one node renders the panel; selecting one connection renders the panel.
- [ ] Selecting two or more shapes renders no panel; selecting one tldraw `geo`, `draw` or `arrow`
      shape renders no panel.
- [ ] When the panel fits below the selection inside the safe rect, its top edge is `GAP` px below the
      selection's bottom edge (±2px). Otherwise it is placed above, with its bottom edge `GAP` px
      above the selection's top edge. When neither fits, it is clamped inside the safe rect and
      `flipped` reports which side it ended on.
- [ ] The panel's bounding box intersects none of the chrome rects `chromeRects()` returns, at
      1024×768 and at 820×1180, and its presence does not change
      `document.documentElement.scrollWidth`.
- [ ] Panning the camera by 200px moves the panel by the same 200px in the same direction (±2px)
      **while the placement is unclamped** — i.e. while `placePanel` returns a position the safe rect
      did not modify.
- [ ] Collapsing an ancestor container so the selected shape becomes hidden removes the panel, because
      the selection is stripped (`stripHiddenFromSelection`).
- [ ] The panel is not rendered while a shape is being dragged, resized or rotated, nor while
      `editor.getEditingShapeId()` is the selected shape; it returns when the editor is idle again.
- [ ] A pointer-down inside the selected shape's bounds but *outside* the panel reaches the canvas: a
      drag begun there moves the shape, and the drag is not interrupted by the panel mounting.
- [ ] The panel does not intersect the selected shape's own resize handles; a drag on each of the four
      corner handles resizes the shape.
- [ ] When focus is inside the panel and the panel unmounts for any reason — selection cleared,
      shape hidden, editing begun — focus moves to the canvas container rather than being dropped to
      `<body>` (`best-practices/accessibility/accessibility.md` → 2.4.3).
- [ ] Every interactive control in the panel is at least 44×44 CSS px, the bar `e2e/scenes.spec.ts`
      already holds the narration controls to.
- [ ] `placePanel` is a pure function with unit tests covering: room below, no room below (flip),
      overflow left, overflow right, and a panel taller than the safe rect (clamped, not flipped
      off-screen).

### FR-002: Rename a node from the panel

#### Description:

The node panel carries a labelled text field bound to the node's `label` prop. Editing it writes to
the shape, so the change syncs. An editing session is one undo step, not one per keystroke.

#### Acceptance Criteria:

- [ ] With a node selected, a field with an accessible name of "Name" shows the node's current label.
- [ ] Typing into it updates the node's rendered label on the canvas.
- [ ] After typing into the field and blurring it, one `editor.undo()` restores the label the node had
      when the field took focus — not an intermediate keystroke.
- [ ] The change is visible to a second browser context in the same room (sync).
- [ ] Clearing the field to empty is allowed and leaves the node with an empty label; the icon falls
      back to whatever `resolveNodeIcon('', '')` gives, unchanged from today.
- [ ] Selecting a different node re-points the field at that node's label without carrying the
      previous node's uncommitted text.
- [ ] Double-clicking the node still opens the existing in-canvas textarea
      (`data-testid="diagram-node-input"`), and while it is open the panel is not rendered — so the
      two rename surfaces are never both live. `e2e/custom-shape.spec.ts:159` still passes.

### FR-003: Choose a node's icon from the panel

#### Description:

`IconPicker`'s control moves into the node panel unchanged in behaviour: automatic, pinned-to-none
and pinned-to-an-icon are all reachable, the too-small note still appears, and its keyboard and
screen-reader behaviour is preserved.

#### Acceptance Criteria:

- [ ] All three icon states are reachable from the panel: "Automatic" clears `icon` to `''`,
      "No icon" sets `ICON_NONE`, and a grid cell pins that key.
- [ ] Pinning an icon is one undoable step.
- [ ] The launcher's accessible name still distinguishes "chosen automatically" from "chosen by hand"
      and names the current icon.
- [ ] The sheet closes on Escape, opening moves focus into the sheet, and a user-performed close
      returns focus to the launcher.
- [ ] Selecting a different node closes an open sheet.
- [ ] On a node too small to draw an icon beside its label, the explanatory note still appears.
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
- [ ] Every assertion in `e2e/actors.spec.ts` about attribution *behaviour* passes unchanged. Exactly
      three tests are rewritten, all of them measuring the old fixed position or a width the panel no
      longer has: `:353` *"the control does not cover the JSON launcher or any tldraw UI"* (replaced
      by FR-007's clearance test), `:404` *"the control fits a 375px viewport"* (its premise is the
      `left: 8px; right: 8px` full-width bar at `index.css:828`, which stops existing), and `:421`
      *"a MERGED line names its actors somewhere READABLE at 375px"* (its readability now depends on
      `placePanel`'s clamp rather than on CSS, and it must assert against the panel's measured rect).

### FR-005: The panel states what the selected node already is

#### Description:

Two read-only lines on the node panel, each present only when it has something true to say. The first
answers "identify it as an actor" from the node's side. The second answers "add it to the scene" as
far as the model allows.

The scene line is the subtle one, and its predicate is stated here rather than left to the
implementer. A scene records a collapsed value only for nodes that **had children when it was
captured** (`captureCollapsedMap`, `sceneView.ts:225`), so it has no opinion about anything else and
the panel must not invent one. Separately, the off-scene set is **add-only**
(`takeOffSceneAndToggle`, `sceneView.ts:164`: `if (nodeIds.includes(shape.id)) return`), so
membership of that set does *not* mean the node currently differs from the scene — toggle a container
twice and it matches the scene again while still being in the set. The predicate is therefore about
**values**, not about set membership.

#### Acceptance Criteria:

- [ ] A node that is the actor of no connection shows no actor line.
- [ ] A node that is the actor of one connection shows a line saying so in the singular; a node that
      is the actor of three shows the count.
- [ ] The count is of actor bindings pointing at the node — the document's answer. When one or more of
      those connections is not currently drawn as its own line because it is merged into a collapsed
      container, the line says so, in the same spirit as `ActorControl`'s stand-in note: the panel and
      the canvas may differ, and when they do it is said out loud rather than left to be discovered.
- [ ] Deleting the connection a node performs removes the line without reselecting.
- [ ] With no scene active, no scene line appears.
- [ ] With a scene active but no captured value for this node — `Object.hasOwn(scene.collapsed, id)`
      is false, which is every node that had no children when the scene was taken — **no scene line
      appears.** A "following the scene" line on a leaf node the scene never mentions is a false
      statement, and this criterion is the one that forbids it.
- [ ] With a scene active and a captured value for this node that equals its effective state
      (`effectiveCollapsed(id, own, scene, offScene)`), the panel says the node matches the scene.
- [ ] With a scene active and a captured value that differs from the node's effective state, the panel
      says the node has been changed away from the scene, and offers a restore control.
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
into the panel's field components; the standalone files and their positioned CSS go.

#### Acceptance Criteria:

- [ ] `src/client/panels/IconPicker.tsx` and `src/client/panels/ActorControl.tsx` no longer exist, and
      `Room.tsx` mounts neither.
- [ ] With one node selected, exactly one icon control is in the document; with one connection
      selected, exactly one "Performed by" control.
- [ ] `grep -nE '^\.(icon-picker|actor-control) \{' -A6 src/client/index.css` reports no `position`,
      `top`, `left`, `right` or `bottom` declaration for either selector. Both are `position:
      absolute` today (`index.css:828`, `:915`), and `.actor-control` additionally spans
      `left: 8px; right: 8px` — the full-viewport width the note-wrapping in FR-004 currently relies
      on, so the field's own width rules have to replace it rather than merely inherit.
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
      `chromeRects()` returns, for a selected node and for a selected connection, and it runs in both
      projects.
- [ ] `chromeRects()` uses `querySelectorAll`, not `querySelector`, and its selector list names
      tldraw's quick-actions container explicitly. A test asserts the list resolves to **more than
      one** element at 820×1180 — the assertion that would have caught the `querySelector` defect
      described in Out of Scope, and which fails if the quick-actions selector ever stops matching.

---

## Data Model

No new records and no changed shape props — therefore no migration. The panel is a view over records
that already exist.

```ts
// src/client/panels/selectionSubject.ts
export type SelectionSubject =
  | { kind: 'node'; id: TLShapeId }
  | { kind: 'connection'; id: TLShapeId }

/** The one shape the panel is about, or null for none / several / an unsupported type. */
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

export interface Placement {
  left: number
  top: number
  /** True when the panel went above the selection rather than below it. */
  flipped: boolean
  /** True when the safe rect moved the placement — FR-001's pan criterion excludes these. */
  clamped: boolean
}

/** The offset between the selection and the panel, in CSS px. */
export const GAP = 12

/** Pure: no Editor, no DOM. All rects are screen-space. */
export function placePanel(selection: Rect, panel: { w: number; h: number }, safe: Rect): Placement
```

---

## API / Interface Contract

```tsx
// src/client/panels/SelectionPanel.tsx
export function SelectionPanel({ editor }: { editor: Editor | null }): JSX.Element | null

// Mounted exactly like the panels it replaces — a sibling of <Tldraw>, not a
// `components` override, because it owns focusable form controls that must not
// fight the canvas's pointer and keyboard handling.
<SelectionPanel editor={editor} />
```

The safe rect is **derived at runtime**, not configured. This is deliberate: a constant would have to
be re-derived every time tldraw's chrome reflows, and the reflow between orientations is the whole
reason F5 went unseen for months.

```ts
// src/client/panels/chromeRects.ts

/**
 * Every control cluster the panel must not cover, as screen-space rects.
 *
 * `querySelectorAll`, never `querySelector`: tldraw reuses `.tlui-toolbar` for
 * the style panel's inner toolbar AND for the bottom bar that holds the quick
 * actions in portrait, and the first match at 820x1180 is the style panel's.
 * That is why the existing overlap tests never saw F5.
 */
export const CHROME_SELECTORS: readonly string[]

/** Zero-size and detached elements are skipped. */
export function chromeRects(root?: Document): Rect[]

/** The viewport, inset on each edge by the chrome touching that edge. */
export function safeRect(root?: Document): Rect
```

`CHROME_SELECTORS` covers tldraw's menu zone, style panel, toolbar(s), navigation panel and the
quick-actions container (`.tlui-main-toolbar__extras__controls`), plus this app's narration bar,
sketch toggle and JSON launcher. It is exported so the e2e clearance test asserts against the same
list the placement uses — one definition, checked from both sides.

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
├── SelectionPanel.tsx          # the panel: subject, placement, and which fields to render
├── SelectionPanel.test.tsx
├── selectionSubject.ts         # what the selection is, or null
├── placePanel.ts               # pure placement maths
├── placePanel.test.ts
├── chromeRects.ts              # the clusters the panel must clear, and the safe rect
└── fields/
    ├── NameField.tsx           # FR-002
    ├── IconField.tsx           # FR-003 — was panels/IconPicker.tsx
    ├── ActorField.tsx          # FR-004 — was panels/ActorControl.tsx
    └── NodeStatus.tsx          # FR-005
```

Deleted: `src/client/panels/IconPicker.tsx`, `src/client/panels/ActorControl.tsx`.

## Implementation Phases

### Phase 1: Subject, chrome and placement

- `selectionSubject` — the one shape the panel is about, or null.
- `chromeRects` / `safeRect` — the selector list and the runtime derivation.
- `placePanel` — pure, with the unit tests FR-001's last criterion names.
- The `SelectionPanel` shell: anchored, clamped, re-anchoring on camera and shape change, suppressed
  while the editor is not idle or is editing the shape's text, and not stealing canvas gestures.
- Mount it in `Room.tsx` beside the existing panels; nothing is absorbed yet.

### Phase 2: Node fields

- `NameField` (FR-002), with the focus-scoped history mark.
- `IconField` (FR-003): move `IconPicker.tsx` in, keeping its test ids, its focus management and its
  three states.
- `NodeStatus` (FR-005): the actor count with its merged-line note, and the scene line on the
  value-based predicate FR-005 states.

### Phase 3: Connection field

- `ActorField` (FR-004): move `ActorControl.tsx` in, keeping the merge-index read, the several-actors
  option and the stand-in note, and replacing the full-viewport width its notes relied on.

### Phase 4: Remove the old chrome

- Delete both standalone panels and their positioned CSS; drop their mounts from `Room.tsx`.
- Rewrite the four positional tests FR-003 and FR-004 name, by file and line.
- Update `docs/component-inventory.md`.

### Phase 5: Portrait in the matrix

- Add the `ipad-portrait` project at 820×1180.
- Move the node in `e2e/node-content.spec.ts:332` clear of the style panel.
- Add the clearance test and the `CHROME_SELECTORS` resolution test, both running in both projects.
- Get the whole suite green in both.
