# Spec: Selection properties panel

**ID:** SPEC-016
**Status:** Draft
**Last Updated:** 2026-09-08
**Depends On:** SPEC-008, SPEC-011, SPEC-013, SPEC-014, SPEC-015

## Overview

Selecting a node or a connection tells you nothing about it. Everything SPEC-011 through SPEC-015
built — attributing a connection to the node that performs it, pinning an icon, naming a node,
reading a merged edge's actors — is reachable only from floating panels pinned to fixed screen
corners, each with its own selection condition and none of them near the thing they act on. The
owner of this project used the tool on an iPad for the first time, selected shapes, saw nothing, and
concluded the features had not been built. They had. His words: *"When I select a node or an edge, it
should have a properties menu that pops up so I can rename it, select a new icon, identify it as an
actor, add it to the scene, whatever. That's what I expected and it didn't happen, so I don't know
how to use the app if the features are there."*

This spec builds that menu: one panel, anchored to the selected shape, carrying the properties of
whatever is selected. It **absorbs** the two panels that already do this work from a corner —
`IconPicker` and `ActorControl` — rather than adding a ninth independent cluster to chrome that is
already eight (`docs/handoff/2026-09-08-ipad-findings.md` → F7). Net chrome after this spec is one
cluster smaller, and the features stop being invisible.

## Scope

### In Scope

- One panel that appears when exactly one node or one connection is selected, anchored to that
  shape's on-screen bounds and clamped so it never covers the editor's own controls.
- Renaming a node from the panel.
- Choosing a node's icon from the panel — `IconPicker`'s behaviour, moved inside.
- Attributing a connection from the panel — `ActorControl`'s behaviour, moved inside.
- Two read-only statements about a selected node: how many connections it performs, and whether it
  still follows the active scene.
- Deleting `IconPicker` and `ActorControl` as independently-mounted chrome.
- A **portrait iPad viewport (820×1180)** added to the Playwright matrix, and the panel proved to
  clear the editor's chrome in both orientations.

### Out of Scope

- **Scene membership as a property of a shape.** The user asked to "add it to the scene". Scenes
  (SPEC-008/009) have no membership: a scene captures the collapsed state of every container, and a
  shape is either following that capture or has been changed away from it. This spec surfaces the
  state the model actually has (FR-005); giving a shape a per-scene membership is a modelling change
  to the scenes area and belongs to its own spec.
- **A node-side "this is an actor" flag.** Attribution is a binding from a connection to a node
  (SPEC-011). The panel reports the bindings that exist; it does not introduce a flag on the node.
- **Properties for tldraw's own shapes** — geo, draw, native arrow. The panel renders nothing for
  them. That a native arrow looks like a connection and is not one is finding F3, and its own spec.
- **Multi-select properties.** More than one shape selected shows no panel, exactly as the two
  absorbed panels behave today.
- **Repositioning the Scenes bar, the JSON launcher or the sketch toggle** (findings F5/F7). This spec
  adds the portrait viewport the next spec needs and keeps its own panel clear of the chrome; it does
  not move the other clusters. F5 is still present and now measured at 820×1180 on `00c1e47`: the
  narration bar occupies x 8–324, y 1074–1124, and tldraw's quick actions sit at x 201–385, y ~1084,
  so undo, redo, delete and duplicate stay covered. **No test asserts on tldraw's quick actions, so
  the portrait project added here does not red on F5** — it is left visible and unfixed on purpose,
  for the iPad-chrome spec, and the numbers are recorded so it is not re-measured.
- **Any change to shape props.** No prop is added, removed or retyped, so this spec ships no
  migration. A future revision that adds one must.

---

## Functional Requirements

### FR-001: The panel appears with the selection, anchored to it

#### Description:

A single panel mounts beside `<Tldraw>` and renders only when the current selection is exactly one
`diagramNode` or one `diagramConnection`. It is positioned from the selected shape's screen-space
bounds — below them by a fixed gap, flipped above when there is no room below — and clamped into a
chrome-safe rect so it never covers the editor's toolbar, quick actions, style panel or the app's own
bars. It re-anchors when the shape moves or the camera changes, and is suppressed while the editor is
doing something else.

#### Acceptance Criteria:

- [ ] With nothing selected, no element with `data-testid="selection-panel"` is in the document.
- [ ] Selecting one node renders the panel; selecting one connection renders the panel.
- [ ] Selecting two or more shapes renders no panel; selecting one tldraw `geo`, `draw` or `arrow`
      shape renders no panel.
- [ ] The panel's bounding box is within a gap of 8–24px below the selected shape's bounding box when
      the shape sits in the upper half of the viewport, and above it when the shape sits low enough
      that the panel would otherwise extend past the chrome-safe rect's bottom edge.
- [ ] The panel's bounding box lies entirely inside the chrome-safe rect at 1024×768 and at 820×1180
      — no edge outside it, and `document.documentElement.scrollWidth` is unchanged by its presence.
- [ ] Panning the camera by 200px moves the panel by the same 200px in the same direction (±2px).
- [ ] Collapsing an ancestor container so the selected shape becomes hidden removes the panel, because
      the selection is stripped (`stripHiddenFromSelection`).
- [ ] While a shape is being dragged, resized or rotated the panel is not rendered; it returns when
      the editor is idle again.
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
- [ ] `e2e/icons.spec.ts` passes with no change to any assertion about icon *state*; the only edits
      permitted are the steps that reach the control.

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
- [ ] `e2e/actors.spec.ts` passes with no change to any assertion about attribution *behaviour*; the
      only edits permitted are the steps that reach the control and the two assertions that measure
      its old fixed position.

### FR-005: The panel states what the selected node already is

#### Description:

Two read-only lines on the node panel, each present only when true. The first answers "identify it as
an actor" from the node's side: how many connections this node performs, derived from the actor
bindings pointing at it. The second answers "add it to the scene" as far as the model allows: whether
this node still follows the active scene, with the same restore action the narration bar offers.

#### Acceptance Criteria:

- [ ] A node that is the actor of no connection shows no actor line.
- [ ] A node that is the actor of one connection shows a line saying so in the singular; a node that
      is the actor of three shows the count.
- [ ] Deleting the connection a node performs removes the line without reselecting.
- [ ] With no scene active, no scene line appears.
- [ ] With a scene active and this node not in the off-scene set, the panel says the node is following
      the scene.
- [ ] With a scene active and this node in the off-scene set, the panel says the node has been changed
      away from the scene and offers a control that restores the scene — the same whole-set restore
      `NarrationPanel`'s "Back to the scene" performs, calling `viewScene` and no new mutation.
- [ ] The scene line reads the *effective* state through `sceneState`, so it agrees with the canvas
      rather than with the node's raw `collapsed` prop.

### FR-006: The absorbed panels stop existing as separate chrome

#### Description:

`IconPicker` and `ActorControl` are no longer mounted as independent floating boxes. Their code moves
into the panel's field components; the standalone files and their fixed-position CSS go.

#### Acceptance Criteria:

- [ ] `src/client/panels/IconPicker.tsx` and `src/client/panels/ActorControl.tsx` no longer exist, and
      `Room.tsx` mounts neither.
- [ ] With one node selected, exactly one icon control is in the document; with one connection
      selected, exactly one "Performed by" control.
- [ ] No rule in `src/client/index.css` positions `.icon-picker` or `.actor-control` as a
      viewport-fixed box; a grep for those position rules returns nothing.
- [ ] `docs/component-inventory.md` names the panel and no longer names the two absorbed controls as
      standalone components.

### FR-007: Portrait iPad is in the e2e matrix

#### Description:

Playwright gains a second project at 820×1180 — the way the device is actually held to sketch. Every
overlap and fit assertion in the suite runs in both orientations, and the new panel is proved to clear
the chrome in each.

The size of this job is **measured, not estimated**. The whole suite was run at 820×1180 against
`00c1e47`: **284 passed, 1 failed**. The one failure is
`e2e/node-content.spec.ts:332` — *"a box with content can still be SELECTED and RENAMED"* — which
places a node at page x 550–850, y 150–350 and clicks its centre at screen (700, 250). At 820px wide
tldraw's style panel occupies x 664–812, y 6–290, so the click lands on the style panel's toggle-group
button instead of the canvas and nothing is selected. It is a test coordinate that only worked at
1024px, not an app defect, and moving the node clear of the chrome is the fix.

#### Acceptance Criteria:

- [ ] `playwright.config.ts` defines a second project named `ipad-portrait` at 820×1180 with the same
      touch and CDP settings as `ipad-chromium`, and both projects run by default.
- [ ] The whole e2e suite passes in both projects.
- [ ] `e2e/node-content.spec.ts:332` passes in portrait because the node it places is clear of the
      style panel's rect, not because the assertion was weakened or the test skipped in one project.
- [ ] A test asserts that the selection panel's bounding box intersects none of the editor's control
      clusters — tldraw's toolbar, quick actions, style panel and main menu, plus this app's narration
      bar, sketch toggle and JSON launcher — and it runs in both projects.
- [ ] The suite is runnable with `E2E_PORT` set, so a second worktree's run cannot silently reuse the
      first's dev server.

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
  /** True when the panel had to go above the selection rather than below it. */
  flipped: boolean
}

/**
 * Pure: no Editor, no DOM. `selection` and `safe` are screen-space rects, `panel`
 * is the measured size of the panel, `gap` the offset from the selection.
 */
export function placePanel(selection: Rect, panel: { w: number; h: number }, safe: Rect, gap: number): Placement
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

The chrome-safe rect is a CSS-driven inset, read once per placement:

```ts
// Insets in CSS custom properties so the value lives beside the chrome it
// describes and can differ per orientation, rather than being a constant
// compiled into the placement maths.
--selection-safe-top / --selection-safe-right / --selection-safe-bottom / --selection-safe-left
```

The four values are **chosen so FR-007's clearance test passes**, which is what makes them a decision
rather than a guess: get them wrong and the test reds. Measured inputs at 820×1180 on `00c1e47` —
tldraw's menu zone x 0–117, y 0–42; its style panel (toolbar included) x 664–812, y 6–290; the JSON
launcher x 379–441, y 8–52; the narration bar x 8–324, y 1074–1124; the sketch toggle x 721–812,
y 1074–1124. tldraw's own chrome reflows between orientations and this app's does not, which is why
the insets are per-orientation and why the test runs in both projects rather than one.

Test ids are **preserved from the absorbed panels** so the suites that prove their behaviour keep
proving it: `icon-picker`, `icon-picker-open`, `icon-picker-sheet`, `icon-picker-auto`,
`icon-picker-none`, `icon-picker-cell`, `icon-picker-too-small`, `actor-control`, `actor-select`,
`actor-select-several`, `actor-control-standin`, `actor-control-merged`. New: `selection-panel`,
`selection-name`, `selection-actor-of`, `selection-scene-state`, `selection-scene-restore`.

## Configuration / Environment

No new config. `E2E_PORT` already exists and gains a second Playwright project that honours it.

## File & Folder Structure

```
src/client/panels/
├── SelectionPanel.tsx          # the panel: subject, placement, and which fields to render
├── SelectionPanel.test.tsx
├── selectionSubject.ts         # what the selection is, or null
├── placePanel.ts               # pure placement maths
├── placePanel.test.ts
└── fields/
    ├── NameField.tsx           # FR-002
    ├── IconField.tsx           # FR-003 — was panels/IconPicker.tsx
    ├── ActorField.tsx          # FR-004 — was panels/ActorControl.tsx
    └── NodeStatus.tsx          # FR-005
```

Deleted: `src/client/panels/IconPicker.tsx`, `src/client/panels/ActorControl.tsx`.

## Implementation Phases

### Phase 1: Subject and placement

- `selectionSubject` — the one shape the panel is about, or null.
- `placePanel` — pure, with the unit tests FR-001's last criterion names.
- The `SelectionPanel` shell: anchored, clamped, re-anchoring on camera and shape change, suppressed
  while the editor is not idle. Rendering nothing but its own frame.
- Mount it in `Room.tsx` beside the existing panels; nothing is absorbed yet.

### Phase 2: Node fields

- `NameField` (FR-002), with the focus-scoped history mark.
- `IconField` (FR-003): move `IconPicker.tsx` in, keeping its test ids, its focus management and its
  three states.
- `NodeStatus` (FR-005): the actor-of count from the bindings pointing at the node, and the scene
  line from `sceneState`.

### Phase 3: Connection field

- `ActorField` (FR-004): move `ActorControl.tsx` in, keeping the merge-index read, the several-actors
  option and the stand-in note.

### Phase 4: Remove the old chrome

- Delete both standalone panels and their fixed-position CSS; drop their mounts from `Room.tsx`.
- Update the two `actors.spec.ts` assertions that measure the old fixed position, and any
  `icons.spec.ts` step that reached the launcher without selecting first.
- Update `docs/component-inventory.md`.

### Phase 5: Portrait in the matrix

- Add the `ipad-portrait` project at 820×1180.
- Add the chrome-clearance test, running in both projects.
- Get the whole suite green in both.
