# Handoff — the first real iPad session, and what it found

**Date:** 2026-09-08 · **Written for:** a fresh agent picking this up · **Repo state:** `main` at
`9b90856` (SPEC-015 merged, CI green)

The tool was used on its target device for the first time: an iPad with an Apple Pencil, in portrait,
drawing a real diagram. Almost nothing about that session was predicted by the test suite. This
document is the findings and a proposed order of work. Read it with `CLAUDE.md` and `docs/process.md`;
it does not replace either.

---

## 1. What the user actually wants to do

His words, lightly compressed. Treat this as the acceptance test for the whole tool:

> Draw a box, call it AWS account one. Draw a second box, AWS account two. Draw a box in that one for
> S3, then boxes inside for individual buckets. Have a step function in account one. Have another box
> for IAM roles, and inside it a handful of roles, which are **actors** on the copies that happen
> within one account as part of the step function, from one bucket to another. Another step in the
> step function does a cross-account copy to S3 in the other account. All of that, I should be able to
> draw really quickly.

He drew it by hand instead. The result is in `docs/corpus/` — **use it, don't re-derive it.**

Three things he did without being asked, which are product signals:

- **He typed his edges with colour.** Orange for data movement, light-green for permission, black for
  structure and sequence. The app has no concept of edge kind; he invented one because he needed one.
- **He drew actor relationships as green lines** from an IAM role to the transfer it authorises —
  i.e. he drew SPEC-011's feature by hand, rather than using the "Performed by" dropdown, because he
  never found it.
- **He declined to draw a third layer of edges** ("I didn't want to add 3 edge layers"), connecting
  step-function steps to the transfers they perform. He named the wanted model himself: *data flow,
  process flow, chronology — all independent, and you might want to denote it. That's why we had edge
  sets in the previous iteration.*

---

## 2. Findings

### F1 — Sketch recognition does not work, and the cause is not tuning (severity: blocks the core loop)

Run against the corpus, the classifier at `9b90856` returns **`box: 1` out of 276 strokes**. That one
was the box he undid. His own summary — "you basically have to draw a perfect square" — is accurate.

It is not that he draws badly. His "AWS Account #1" container is a *single* stroke that runs down the
left side, along the bottom, up the right, back across the top, and closes within **2.4% of its own
diagonal**. It was rejected anyway.

**The mechanism.** Every tolerance in `src/shared/sketch/recognise.ts` is an absolute page-unit
constant. His strokes span **107 to 7,625 page units** — a 70× range, because he zoomed in and out
while drawing. `SIMPLIFY_EPSILON = 8` is a reasonable 7% of a small box and **0.1%** of his account
container, so on the large one every tremor in his hand survives simplification as a corner: 61 of
his 170 box-sized strokes reduce to nine or more corners, and "is this four-cornered?" answers no.

The classifier is therefore **scale-dependent**: it works at roughly the zoom its fixtures were
captured at and is a lottery everywhere else. Every fixture in `src/shared/sketch/__fixtures__/strokes/`
was drawn by the previous agent **with a mouse**, which is exactly how a recogniser ends up only
accepting perfect squares.

**What is NOT yet known.** Normalising each stroke to a common size before classifying — the obvious
fix — takes it from 1 box to **8**. Better, nowhere near enough. There is at least one more defect
behind the scale one. Do not assume scale-invariance alone closes this; find the rest against the
corpus first.

**Measurement warning, learned the hard way:** a "does this stroke outline its own bounding box"
metric computed over stroke *vertices* is meaningless here — tldraw decimates points, so a perfectly
good rectangle scores ~0.7 purely from point spacing. Sample along segments, not vertices.

### F2 — Selecting something tells you nothing, so the features are invisible (severity: high)

His words: *"When I select a node or an edge, it should have a properties menu that pops up so I can
rename it, select a new icon, identify it as an actor, add it to the scene, whatever. That's what I
expected and it didn't happen, so I don't know how to use the app if the features are there."*

They are there. They are three separate floating panels pinned to fixed screen positions, each
appearing on its own selection condition: `IconPicker` (top-left, one node selected), `ActorControl`
(top-centre, one connection selected), and the narration bar (always). Nothing connects a selected
shape to the controls that act on it. **Every feature built in SPEC-011 through SPEC-015 is reachable
only by someone who already knows it exists.**

### F3 — The connection tool is unusable and native arrows silently impersonate it (severity: high)

`src/client/tools/ConnectionTool.ts` requires a drag that *starts* on a node and *ends* on a different
node. Pointer-down anywhere else transitions straight back to idle — no shape, no hint, no feedback.
Tapping it does nothing, which is what he reported.

Meanwhile tldraw's **native arrow tool** sits four slots away in the same toolbar, draws anywhere,
binds to shapes, and feels good. It produces `arrow` shapes, which are not connections: they do not
merge on collapse, cannot carry an actor, and **do not appear in the exported document at all**
(`undocumentableShapeCount` in `DiagramIOPanel` already counts them). The tool that works produces the
wrong thing; the tool that produces the right thing looks broken.

Related, same cause: tldraw's geo shapes (star, cloud, …) are in the toolbar and are not nodes — he
asked what they are for. The hand/pan tool is redundant on a device where two fingers already pan.

### F4 — A node centres its label, so you cannot write in it (severity: medium, small fix)

His words: *"A centered icon and text is not at all the way we would want this to work when we have
stuff we want to write in. It's supposed to be, like, headers."* SPEC-013 lets you write inside a
node; a centred label sits in the middle of the space you would write in. The label and icon want to
be a header — top-left, out of the way — with the body free.

### F5 — In portrait, the Scenes bar covers undo, redo, delete and duplicate (severity: high, defect)

Measured at 820×1180: our Scenes bar occupies x 8–324 at y 1080; tldraw's quick-actions row is at
x 201–385, y 1084. Four buttons, fully covered — **you cannot undo**.

tldraw's UI reflows: in landscape those actions live in the *top* bar, in portrait they move to the
*bottom*. Our panels are pinned with fixed offsets derived from the landscape arrangement. Every
overlap test in the suite passes because they all run at 1024×768 and 375px. **Portrait iPad — the way
the device is actually held to sketch — is not tested anywhere.**

### F6 — Custom shapes ignore the dark theme (severity: medium, unverified)

He was in dark mode; the canvas was black. `.diagram-node` hardcodes `background: #fff` and
`color: #111`, so a recognised node should render as a white card on a black canvas. Not directly
observed — nothing in his drawing became a node — so **verify before fixing**.

### F7 — The chrome is eight independent clusters (severity: medium, design)

tldraw's menu, style panel, toolbar, quick actions and zoom; our JSON launcher, Scenes bar and sketch
toggle; plus the licence watermark. Each was added by a different spec, none knows the others exist,
and on an iPad they occupy the corners a hand rests in. His reaction to the top-left cluster: *"I
don't know what the fuck is going on there."* The hamburger's contents — languages, preferences,
export, keyboard shortcuts — are tldraw defaults nobody chose for this tool.

### F8 — Safari 16.2 could not load the app at all (resolved for him; open as policy)

A class static initialization block in a vendored tldraw dependency (`OrderedDict`) parses only in
Safari 16.4+. On his 16.2 iPad the module threw `SyntaxError: Unexpected token '{'` before evaluating,
nothing mounted, and the page was blank — the long-standing "blank page on iPad" defect, in full.

He has since updated the device, so it is not blocking him. The fix is two lines
(`build.target` + the dep-optimizer target, pinned to `safari16`); it was written, verified to
re-optimize, and **backed out** pending the decision below.

---

## 3. Proposed work, in order

Each becomes a spec through the normal process. The ordering is a recommendation, not a decision.

| # | Spec | Why here |
| --- | --- | --- |
| 1 | **Selection properties panel** (F2) — `SPEC-016` | Makes every feature built in SPEC-011–015 reachable. Nothing else is worth building while the existing work is invisible. Absorbs `IconPicker` and `ActorControl` rather than adding a ninth floating box (F7). |
| 2 | **Recognition that works at any scale** (F1) | Unblocks the core loop. Must be written against `docs/corpus/`, and must add a real-pencil fixture path — the capture harness currently produces mouse strokes. |
| 3 | **Edge kinds / edge sets** (§1) | He named the model and reached for colour on his own. Note `CLAUDE.md` → *Out of Scope* currently defers edge sets "pending real use" — **real use has now happened**, so that fence should be lifted in `decisions.md` as part of this spec, not silently ignored. |
| 4 | **Node as header + body** (F4) | Small, and it is what makes nesting legible. |
| 5 | **One drawing path** (F3) | Connections from the marker; prune the toolbar to what the loop needs; stop native arrows masquerading as connections. Partly falls out of 2. |
| 6 | **iPad chrome** (F5, F6, F7) | Portrait overlap is a defect and could be pulled forward on its own; the wider consolidation is design work that should follow 1. |

**Testing gap, now assigned:** the portrait iPad viewport is `SPEC-016` FR-007, and the size of that
job is measured there rather than guessed. F5 existed for months behind a suite that only ever
measured landscape.

---

## 4. Questions for the user — answered 2026-09-08

All three were put to the project owner and answered. Recorded here rather than in
`docs/decisions.md` because none of them has a spec yet; the spec that acts on each promotes it to a
register entry when it is written.

1. **Do we support Safari 16.x iPads?** (F8) — **A version guard, not the `safari16` build target.**
   The two-line `build.target` pin stays backed out; what gets built instead is a readable "this
   browser is too old" message in place of the blank page. An iPad on 16.2 still cannot run the app,
   but it is told why rather than showing nothing. Belongs to its own small spec.
2. **Is a step-function step and the transfer it performs one edge or two?** — **One edge carrying
   several kinds.** A connection gains a set of kinds (data / permission / sequence) rather than the
   diagram gaining parallel edge sets, which matches him declining to draw a third layer. The
   accepted cost, stated so the edge-kinds spec does not rediscover it: one edge has one pair of
   endpoints, so a step whose endpoints differ from the transfer's cannot be expressed.
3. **Priority between F2 and F1** — **F2 first.** Recorded with its reasoning in the *iPad readiness*
   arc in `docs/specs/INDEX.md`, which is where build order lives.

---

## 5. Things a fresh agent should not redo

- The corpus exists (`docs/corpus/`); do not ask him to redraw.
- The recogniser's failure is measured, not suspected: 276 strokes, 1 box, and the mechanism in F1.
- Scale-normalisation alone was tried: 1 → 8 boxes. Not sufficient.
- The Safari 16 fix is understood and deliberately not applied.
- `feat/spec-008-narration-panel` was reset to `origin/main` at one point and then restored to
  `2a90eb0`; it is a merged, dead branch either way.
- The primary checkout cannot `git checkout main` while an old session worktree holds it — see
  `git worktree list`. Several stale worktrees from previous sessions can be pruned.
