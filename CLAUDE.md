# hand-drawn-architecture-diagrams — Project Memory

Loaded every session — keep it lean. Deep docs live in `docs/` and are pulled **on demand**, except
`process.md`, which is the contract this file summarises:
- `@docs/process.md` — how we work: spec lifecycle, session rhythm, completion ritual (**read every session**)
- `@docs/architecture.md` — system design decisions + Known Constraints (read the section you need)
- `@docs/decisions.md` — the Key Decisions register in full (the digest below is one line each)
- `@docs/specs/INDEX.md` — the spec index + status (one row per spec)
- `@docs/specs/SPEC-XXX-*.md` — the spec you're implementing
- `@docs/component-inventory.md` — reusable modules/services/components already built
- `@docs/spec-delivery/SPEC-XXX-*.md` — what a past spec delivered (pull only when a dependency points to one)
- `@docs/best-practices/INDEX.md` — domain coding rulebooks (React, accessibility, …); route here, then load only the section(s) you need

---

## Project Overview

A tool for sketching software architecture by hand on an iPad and sharing the drawing **live** with a
colleague. It replaces an earlier single-player app whose "sharing" was a gzip'd URL snapshot, not
collaboration. The idea worth carrying forward is **hierarchical nesting plus scene-based narration**:
one persistent graph, stepped through as named snapshots that toggle what is expanded, highlighted
and visible. Built on the tldraw SDK, with domain state in tldraw's own synced store so multiplayer
is a property of the system rather than a later retrofit.

Predecessor (read-only reference, not a dependency): `../architecture-diagrams`, and its
`docs/canvas-rebuild-handoff.md`.

## Layout

- `src/client/` — React app: tldraw canvas, custom `ShapeUtil`s, tools, panels
- `src/shared/` — shape definitions + domain logic imported by **both** client and worker; keep runtime-agnostic
- `src/worker/` — Cloudflare Worker + Durable Object hosting one sync room each
- `e2e/` — Playwright specs, including the multi-client sync tests
- `docs/` — the layered docs listed at the top of this file

## Tech Stack

- TypeScript 6 (strict), React 19, Vite 8 — Node >= 22.12 (tldraw 5's `engines`; Node 20 is excluded)
- tldraw SDK **5.x** — canvas, custom shapes, bindings — plus its sync client. `@tldraw/store` is a
  direct dependency at a RANGE (`^5.4.0`), not an exact pin. Both the range and the major are
  load-bearing and neither is obvious: `decisions.md` → *Canvas SDK: tldraw*
- Cloudflare Workers + Durable Objects (SQLite storage); R2 for assets
- Vitest + Testing Library (unit, jsdom + a polyfill setup file tldraw needs to mount at all),
  Playwright (e2e — Chromium at an emulated iPad viewport, never `devices['iPad …']`:
  `architecture.md` → Known Constraints)
- `lucide-react` for the general icon set; the AWS architecture icons are vendored SVG under
  `src/client/icons/aws/` (see `decisions.md` -- their terms sit inside the same deployment fence as
  the tldraw licence)
- oxlint, prettier

**Don't add dependencies without noting them here first.**

## Code Conventions

- **Domain state lives in the tldraw store.** No parallel state manager — anything outside the store
  is invisible to sync. This is the one rule the whole architecture rests on.
- **A custom shape is declared once and consumed twice** — the definition lives in `src/shared/`, the
  client builds a `ShapeUtil` from it and the worker builds its schema from it. Never hand-write the
  two halves separately; they drift silently and break validation at the room boundary.
- **Every shape-prop change ships a migration.** Rooms hold persisted records; an unmigrated prop
  change corrupts existing rooms rather than failing loudly.
- TypeScript `strict`; no `any` in `src/shared/`.

- When writing/refactoring code in a domain that has a rulebook (see `@docs/best-practices/INDEX.md`), consult it first and load only the relevant section(s) — don't reinvent or guess the rules.

## Common Commands

```bash
npm run dev          # vite client + local worker (no tldraw licence needed on localhost)
npm run build        # tsc -b && vite build
npm test             # vitest run
npm run test:e2e     # playwright, includes two-client sync specs
npm run lint         # oxlint
npm run format:check # prettier --check
npm run typecheck    # tsc --noEmit
sh scripts/spec-lint.sh        # CI
sh scripts/docs-lint.sh        # LOCAL pre-push gate — not in CI
sh scripts/docs-lint-test.sh   # whenever docs-lint.sh itself changed
```

## Specs

Index + status: `@docs/specs/INDEX.md`. Each spec file's header carries its own `Status`.
**Current work:** SPEC-019 (a vocabulary the user writes).

---

## Key Decisions (settled — don't re-litigate)

One line each — a digest of the full entry in `@docs/decisions.md`; read the entry before working in
that area. A line here is **never the only home of a fact**, and never a paragraph.

**Grouped by AREA, not by spec.** `scripts/docs-lint.sh` holds this section to that shape: an
`### ` area heading, `- **Label** — …` bullets at column 0, indented continuations, blank lines,
and plain prose here in the intro. A table, blockquote, fenced block, ordered list or bare bullet
is refused — each one was a way past the checks.

### Canvas foundation

- **Canvas SDK: tldraw** — chosen over Excalidraw for first-class custom shapes and real self-hosted
  sync; the freehand/iPad feel and shape recognition are not hand-rolled.
- **Store-native domain state** — nesting, connections and scenes are tldraw records, not a parallel
  store. A shadow state manager is invisible to sync and must not be built.

### Collaboration

- **Multiplayer lands before the first custom shape** — sync in SPEC-002, custom shapes from SPEC-003
  on, so the client/worker schema duality is proven on the smallest shape instead of retrofitted.
- **Derived views are computed, never materialized** — a view that is a pure function of records is
  recomputed per client, not written back; two clients materializing one both write, and neither
  cleans up. Ties break on a total order over data both already have, never on creation order.
- **A folded view shows every answer, never none** — a merged edge shows every distinct actor of the
  connections it stands for, ordered by the same total order that picks the representative. Showing
  none was lossy, not conservative; the cap on how many fit is the renderer's call, not the
  derivation's.
- **Controls dock; they do not follow the shape** — the properties panel is a right-hand column, not
  anchored to the selection: a connection's bounds spans both endpoints' centres, so "beside the
  shape" is meaningless for half of what it describes. Anchoring failed three reviews before that was
  named.
- **A classifier is scored against a labelled population** — "276 strokes, 1 box" had the wrong
  denominator: twelve are rectangles. Out of 276 the defect reads as under-recognition and the
  repair looks like looser tolerances; out of 12 it is visible.
- **Scope says who sees a record; history is decided per write** — tldraw records session-scoped
  changes on the shared undo stack too, so two fields wanting opposite undo behaviour cannot share
  one record.

### Licensing

- **Hobby licence accepted for now; commercial use is unresolved** — localhost needs no key, so this
  fences **deployment**, not development. Settle it before any production deploy spec.
- **Icon artwork rides the same deployment fence** — the AWS icons are AWS's, not the npm wrapper's;
  the terms cover architecture diagrams and only bite at deploy. Re-ask with the tldraw one.

### Scope

- **Secondary features deferred pending real use** — node-lens grouping and the actor/action/trigger
  model wait until the tool is usable enough to judge them. Edge sets no longer: SPEC-018 declined them.
- **An edge carries a set of kinds** — data / permission / sequence on one connection, never parallel
  edge layers. The accepted cost: one edge has one pair of endpoints.

## Out of Scope (don't build)

- **The workflow starter kit's execution engine.** Its ports/bindings are the part we want; running
  user code in nodes is not a goal.
- **Porting the old app's rendering layer.** Only the derivation logic and the JSON schema carry over;
  React Flow and the Zustand store do not.
- **A production deploy** until the licence question above is answered.

---

## Session Workflow

**Start:** (1) this file, then **`@docs/process.md` — read it every session, not once**: it is the contract this file only summarises; (2) the spec you're implementing (`@docs/specs/SPEC-XXX`); (3) skim `@docs/component-inventory.md` for reuse and pull only the architecture.md section / dependency delivery-doc you need — don't read architecture.md or delivery docs in full. (4) Confirm CI is green on `main`; investigate failures before building. (5) Branch from fresh `main` — in a multi-agent run, in your **own worktree** off `origin/main`, never the shared checkout — and set the spec's `Status: In Progress` + its INDEX row in that first commit. (6) Generate an implementation plan from the spec's phases, validate it against the spec (FRs + acceptance criteria covered, reuse used, nothing out of scope), **send it to one fresh-context reviewer**, then build. (7) Send the **PR grouping** to a reviewer too, before the first push — as few PRs as the dependencies allow.

**During:** those two reviews are the only gates on *starting*, so **build straight through to completion**, summarizing a phase in passing but never ending the turn on it (a summary that ends the turn *is* a request for approval). Every file-changing task goes on its own branch and opens a PR — never commit to `main` directly. Specs carry no Open Questions — triage emergent issues by kind: **reversible/technical** ones you decide in-session (update the spec if scope changes); **product-changing or ambiguous** ones you stop and escalate to the human with options + a recommendation, never silently decide.

**Review — three artifacts, one blocking gate:** a **spec**, an implementation **plan** and a **diff**
each go to a reviewer in a **fresh context** (new session or subagent), never the context that
produced them. **Counts: one on the spec, one on the plan, two on the diff** — and the two on a diff
are two *scenes*, not two rounds: one reads it against the spec's criteria and `best-practices/`, the
other starts from the **system** and **builds** the thing rather than reading it. Counts are
**floors**. On a spec or plan a clean review closes the gate; on a diff a clean first one does not,
and a revised artifact re-enters as a new one. Nothing reaches the next stage until every finding is
**fixed or flagged out loud** — a rejection costs a sentence, and goes in writing only when it carries
a lesson. **The diff review gates the PUSH, not the merge**, because **green CI is not a review**: it
cannot see a test that passes against the bug it claims to catch, or a criterion ticked with no
evidence. Cap same-scene rounds at two, then rotate; exit on the *class* of finding shrinking, never
on a round count — and when findings start landing in the previous round's fixes rather than in the
subject, the review has become its own subject: stop. Brief every reviewer that "this is sound" is a
valid verdict, make it cite where it looked, tell round N+1 what round N fixed, and have it run the
repo's gates. When the risk is what a change *removed*, sweep the whole population instead of
reviewing a sample. **A gate is not tested by running it on the thing it guards** — it owes a fixture
corpus asserting failure text, including cases that assert silence. Full contract:
`@docs/process.md` §3 → *The reviewer contract*.

**PRs & main:** before pushing, get the diff through the review gate above, and get the formatter, linter, typecheck and unit tests green locally, plus `sh scripts/spec-lint.sh` and **`sh scripts/docs-lint.sh` — always, before every PR, since nothing in CI runs it** (and `sh scripts/docs-lint-test.sh` whenever you touch the linter). Watch every PR to completion and merge it as soon as CI is green — never open-and-abandon. **Key the watch on the current head sha** — a bare `gh pr checks --watch` can exit clean against the *previous* commit's checks. `main` is always watched: after any merge confirm it went green, and if `main` fails, diagnose immediately and fix it with a new PR before anything else. **When several agent sessions share this repo**, install `scripts/pr-queue/install.sh` once and the remote is serialised by a PR queue — one PR open at a time, taken in the order agents asked, `main` green before the next — and you get in line only once your gates and reviews are green, because the queue is not a review. Until it is installed the queue is inert. Protocol and the four commands: `scripts/pr-queue/PROTOCOL.md`; brief each session from `@docs/templates/multi-agent-briefing.md`.

**On spec completion — keep the always-loaded files lean:**
1. Set the spec file's `Status: Completed`.
2. Update the one-line row in `@docs/specs/INDEX.md` (status only — don't add prose).
3. Write a short delivery doc at `docs/spec-delivery/SPEC-XXX-<name>.md` from the template.
4. If it added reusable modules/services/components, add a one-line row to `@docs/component-inventory.md`.
5. A *new architectural decision* gets its full entry in `docs/decisions.md` **first, plus a row in that file's `## Contents`** (docs-lint fails an entry the Contents does not reach), then one line in Key Decisions above — the line is never the only home of a fact, and never a paragraph. If it supersedes an earlier decision, add an in-place superseded marker at every doc site still stating the old claim — and if the reversal changes the entry's **heading**, move its Contents row and its digest label with it, or the row points at a dead anchor and docs-lint fails.
6. If it changed the **shape** of the system — a piece added or removed, a boundary moved, a mechanism swapped — add an append-only row to `@docs/architecture.md` → *Architecture Decision Record* and fix the prose section it contradicts. Most decisions do not qualify.

**Doc-size guardrail:** this is the always-loaded file — if an edit pushes a section past a few lines,
the detail belongs in a `docs/` file behind a pointer. Same for `INDEX.md` (status rows only) and the
component inventory. **Key Decisions is grouped by AREA and carries fences, not history** — it is not
a per-spec changelog, and `## Specs` is not one either; both regrow by being appended to, one
completion at a time. **`scripts/docs-lint.sh` enforces this — run it locally before every push, it is not a CI job** — the byte budget,
the digest line cap, and the rule that every Key Decisions line has a full entry behind it in
`@docs/decisions.md`. A threshold can be invalidated by its own **success** — after a structural cut, re-derive it rather
than re-checking it, since a cap that can no longer fail is still advertised as a fence. The budget
is a **ratchet against accretion**: when it fires because the file grew a line at a time, cut and
re-ratchet, never raising it to fit the edit in hand. **After a structural cut the regime inverts** —
what remains is fences, so leave headroom and record why beside the number, or the next decision
that legitimately needs a line takes one from another area. Full rule set: `@docs/process.md` §5 →
*Anti-regrowth & doc hygiene*.
