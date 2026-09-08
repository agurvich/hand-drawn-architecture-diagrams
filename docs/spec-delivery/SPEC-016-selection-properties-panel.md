# Completed Spec — SPEC-016: Selection properties panel

## What was completed?

Selecting a node or a connection now shows its properties. Before this, everything SPEC-011 through
SPEC-015 built was reachable only from floating panels pinned to fixed screen corners, each with its
own selection condition and none of them saying what it acted on — the owner of this project used the
tool on an iPad, selected shapes, saw nothing, and concluded the features had not been built
(`docs/handoff/2026-09-08-ipad-findings.md` → F2).

- `SelectionPanel` — a column docked to the right of the canvas, present while exactly one node or
  connection is selected, with a header naming its subject.
- `selectionSubject`, `dockTop` (`--dock-top`), and the fields in `src/client/panels/fields/`:
  `NameField`, `IconField`, `ActorField`, `NodeStatus`.
- `connectionsPerformedBy` in `src/client/actors.ts` — the reverse actor read.
- `e2e/chromeRects.ts` and `e2e/selection-panel.spec.ts`.
- **Net chrome is one cluster smaller:** `IconPicker` and `ActorControl` are gone as independent
  panels, absorbed as fields.

### Deliberate deviations

- **The panel is DOCKED, not anchored to the shape.** The spec was authored anchored and rewritten
  after three reviews found three different classes of defect in the placement machinery. Full
  reasoning in `docs/decisions.md` → *Controls dock; they do not follow the shape*; the short version
  is that a connection's bounds spans both endpoints' centres, so "beside the shape" is meaningless
  for half of what the panel describes.
- **Scene membership is not a property of a shape.** The user asked to "add it to the scene". Scenes
  have no membership — a scene records a collapsed value only for containers that had children when
  it was captured — so `NodeStatus` reports the state the model has and no more. Giving a shape a
  per-scene membership is a modelling change for the scenes area.
- **F5 is not fixed here.** The Scenes bar still covers tldraw's quick actions in portrait. It is
  pinned by a `KNOWN DEFECT F5` test in `e2e/scenes.spec.ts` that asserts the bug exists; moving the
  bar belongs with the F7 consolidation, and it will change the chrome map this dock's `bottom` is
  measured against.
- **No camera nudge** when the dock occludes a selection. Recorded as an accepted cost; it is the
  obvious next move if it bites in use.
- **Four positional tests the spec expected to rewrite needed no edit.** `icons.spec.ts:420` and
  `actors.spec.ts:353/404/421` all pass unchanged; each waits for its control before measuring, so
  together they are the evidence the absorbed behaviour survived the move rather than a gap.

## What changed from earlier specs?

- `IconPicker.tsx` → `fields/IconField.tsx`, `ActorControl.tsx` → `fields/ActorField.tsx`. Both now
  take the resolved shape id instead of reading the selection themselves. **Every test id is
  preserved**, which is why `icons.spec.ts` and `actors.spec.ts` still pass untouched.
- The icon sheet lost `role="dialog"` and its own `width`/`max-height`. Inside a scrolling column
  those were a popover's settings; 320px in a 312px column would give the dock a horizontal scrollbar.
- `DiagramIOPanel` gained an **optional** controlled `open`/`onOpenChange`, lifted into `Room.tsx`, so
  the dock can stand down while that panel is expanded. Optional, so its unit tests render it
  stand-alone unchanged.
- `.icon-picker` and `.actor-control` are no longer positioned; `.actor-control` stacks instead of
  sitting in a row, which a 312px column requires.
- `CLAUDE.md`'s Session Workflow review paragraph was cut by ~700 bytes — a restatement of
  `docs/process.md` §3 sitting behind a pointer to it — to pay for this spec's Key Decisions line
  rather than raising the byte budget. Reasoning recorded beside the number in `scripts/docs-lint.sh`.

## Verification

Full e2e green in **both** Playwright projects, landscape and the portrait iPad viewport added by
PR #31; unit tests, typecheck, oxlint, prettier, `spec-lint.sh`, `docs-lint.sh` and
`docs-lint-test.sh` (44 cases) all green locally before the push.

Note for the next session: the repo's typecheck is `npm run typecheck`
(`tsc --noEmit -p tsconfig.app.json`). A bare `tsc --noEmit` resolves the root solution file, which is
`{"files": []}` — it checks nothing and cannot fail.
