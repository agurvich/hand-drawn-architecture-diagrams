# Spec: Scaffold and canvas

**ID:** SPEC-001  
**Status:** Draft  
**Last Updated:** 2026-09-03 (rev 3 — post-implementer-review)  
**Depends On:** None

## Overview

Stand up the repository so there is something to build on: a running application that shows a tldraw
canvas you can draw on with a finger or an Apple Pencil, and a set of quality gates that actually run.
Nothing domain-specific is built here — no containers, no connections, no frames. The value of this
spec is that the next one starts from a green, checked, deployable-shaped project instead of an empty
directory, and that the single motivating feature of the whole rebuild — that drawing on an iPad feels
right — is judged by a human on real hardware before any effort is spent on top of it, with an
automated gate left behind to catch the CSS regressions that would silently break it.

## Scope

### In Scope

- A Vite + React + TypeScript application that builds and runs
- A full-viewport tldraw canvas with its default tools, drawable by touch and pen
- Unit and end-to-end test harnesses, each with at least one real test
- Lint, typecheck, format and test commands, and a CI workflow that runs them

### Out of Scope

- **Any custom shape, tool or panel.** The canvas is tldraw's defaults only. Custom shapes begin at
  SPEC-003, deliberately after sync exists (`decisions.md` → *Multiplayer lands before the first
  custom shape*).
- **Any sync, server, worker or persistence.** That is SPEC-002 in its entirety. This spec's canvas is
  single-player and forgets everything on reload — including no `localStorage` persistence, which is
  tempting and would create a second home for state that SPEC-002 then has to remove.
- **A tldraw licence key, and any production deploy.** Localhost needs no key; production is fenced
  until the licence question is settled (`architecture.md` → Known Constraints).
- **Porting anything from `../architecture-diagrams`.** No types, no engine code, no components. The
  port begins at SPEC-006.

---

## Functional Requirements

### FR-001: The application builds, runs and typechecks

#### Description:

A Vite + React + TypeScript project exists at the repository root, with TypeScript in `strict` mode.
It creates the `src/client/`, `src/shared/` and `e2e/` directories from `CLAUDE.md` → Layout.
**`src/worker/` is deliberately NOT created here** — it belongs to SPEC-002, and this spec excludes all
server code.

#### Acceptance Criteria:

- [ ] `npm ci && npm run build` exits 0 from a clean checkout, against a committed `package-lock.json`
      on the Node version CI pins (Node 20 unless the plan states otherwise, matching
      `.github/workflows/ci.yml.example`)
- [ ] `npm run dev` serves the app and it renders without console errors
- [ ] `npm run typecheck` exits 0 and TypeScript `strict` is enabled in the committed config
- [ ] `src/client/`, `src/shared/` and `e2e/` exist, and each is reachable from a committed config:
      `tsconfig` `include` covers `src/`, the `@shared/*` `paths` mapping and its Vite `resolve.alias`
      counterpart are both committed, and the Playwright config's `testDir` is `e2e/`. The alias is
      **not** required to resolve an import yet — `src/shared/` holds only `.gitkeep` until SPEC-002
      adds `room.ts`, and any `@shared/*` import against an empty directory is `TS2307`
- [ ] `npm run typecheck` exits **non-zero** when a deliberate type error is introduced into
      `src/client/`, proving the check is wired to the source rather than passing vacuously

### FR-002: A tldraw canvas fills the viewport and persists nothing

#### Description:

The application renders a tldraw canvas with the SDK's default tools and UI, occupying the full
viewport. No licence key is configured. State is in-memory only.

#### Acceptance Criteria:

- [ ] The canvas renders at full viewport height and width, with no page-level scrollbars
- [ ] The unit test that mounts the canvas runs under a committed Vitest setup file supplying the
      jsdom gaps tldraw needs — `HTMLImageElement.prototype.decode`, an iterable `document.fonts`, and
      a `ResizeObserver` stub. Without them the mount fails on `image.decode is not a function`; the
      test environment is named here because "it renders" is otherwise undecidable
- [ ] A shape drawn with the default draw tool appears on the canvas
- [ ] After drawing and reloading, the canvas contains **zero shapes**
- [ ] After drawing, `indexedDB.databases()` is empty and the only `localStorage` key is
      `TLDRAW_USER_DATA_v3`. That key is tldraw's own user preferences (theme, tool defaults) and is
      explicitly permitted — the SDK writes it regardless of `persistenceKey`, so forbidding it would
      make this criterion false for a correct implementation. Naming both sides is what makes the
      assertion writable
- [ ] No `persistenceKey` is passed to the canvas
- [ ] No licence key is present in source or environment config, and the app runs on localhost without
      one

### FR-003: Drawing works with touch and pen input

#### Description:

The motivating feature of the rebuild is that sketching on an iPad feels native. Two different things
are needed and they are not interchangeable: a **human judgement** on real hardware, because latency,
pressure and palm rejection cannot be observed through synthetic pointer events; and an **automated
regression gate** on the CSS that would silently break touch drawing later.

The automated criteria below are deliberately modest — most of what they assert, tldraw already
guarantees. The one that can genuinely fail is page scroll, which requires deliberate
`touch-action` / `overscroll-behavior` work.

#### Acceptance Criteria:

- [ ] **Manual, on a physical iPad with an Apple Pencil**, recorded in the PR body: strokes track the
      pencil without perceptible lag; palm contact resting on the screen does not draw; pressure
      varies stroke width. If any of these fail, that is a finding to escalate, not to fix in this
      spec — it calls the foundation into question
- [ ] An e2e test at an iPad-class viewport with touch enabled draws a stroke via pointer events and
      asserts exactly one shape was created
- [ ] The same test asserts `window.scrollY` and `window.scrollX` are unchanged by the drawing gesture
- [ ] A `pen` pointerType stroke produces a shape
- [ ] A two-finger gesture pans or zooms rather than creating a shape. Playwright has no first-class
      multi-touch API, so this is driven through raw CDP `Input.dispatchTouchEvent` — which requires
      **Chromium with an emulated iPad viewport**, not Playwright's `devices['iPad …']` descriptors,
      as those default to WebKit where CDP does not exist. If the plan finds it unworkable, it moves
      to the manual criterion above rather than being dropped

### FR-004: Quality gates exist and run in CI

#### Description:

The gates `process.md` requires before every push are runnable by one command each, and the ones that
belong in CI run there on every push and pull request.

#### Acceptance Criteria:

- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run test:e2e`
      each exist and exit 0
- [ ] At least one real unit test and one real end-to-end test exist and are executed by those commands
      — a suite that passes because it is empty does not satisfy this
- [ ] `sh scripts/spec-lint.sh` and `sh scripts/docs-lint.sh` exit 0 against the repository
- [ ] A CI workflow at `.github/workflows/ci.yml` runs install, format check, lint, typecheck, unit
      tests and e2e tests on push and pull request, and is green on `main`
- [ ] `ci.yml` does **not** run `spec-lint.sh` — `.github/workflows/spec-lint.yml` already owns it as
      its own job, and duplicating it means two red X's for one failure
- [ ] The e2e job installs browsers (`npx playwright install --with-deps`) and builds/serves the app
      before running the suite. `.github/workflows/ci.yml.example` has **no e2e step at all**, so
      copying it verbatim produces a CI that silently skips FR-003 — the criterion this spec exists to
      protect
- [ ] `.github/workflows/ci.yml.example` is **deleted** once the real `ci.yml` exists; two workflow
      files, one of them inert and carrying a Python job this project will never run, is exactly the
      stale state `process.md` §5 says to fix or delete
- [ ] CI does **not** run `docs-lint.sh` — it is deliberately a local pre-push gate (`process.md` §5)

---

## Data Model

None. This spec introduces no domain types; the canvas holds tldraw's own records only.

---

## API / Interface Contract

None beyond the application entry point. The single React component tree is:

```
main.tsx  ->  <App />  ->  <Tldraw />   // no props beyond layout/styling
```

## Configuration / Environment

No environment variables. No tldraw licence key — see Out of Scope.

## File & Folder Structure

```
index.html
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
playwright.config.ts
.github/workflows/ci.yml
src/
├── client/
│   ├── main.tsx
│   ├── App.tsx
│   └── App.test.tsx
└── shared/
    └── .gitkeep          # first real module arrives in SPEC-002 (room.ts)
e2e/
└── canvas.spec.ts
```

## Implementation Phases

### Phase 1: Project skeleton

- Initialise Vite + React + TypeScript at the repo root, `strict` on
- Create the `src/client/`, `src/shared/`, `e2e/` layout and wire it into the build and test configs
- Add `build`, `dev`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:e2e` scripts to
  `package.json`; commit the lockfile
- Record the dependencies added in `CLAUDE.md` → Tech Stack if they differ from what is listed there

### Phase 2: The canvas

- Add the tldraw SDK and render a full-viewport `<Tldraw />`
- Confirm no persistence is configured and no licence key is set
- Write the unit test covering that the canvas mounts

### Phase 3: Input verification and gates

- Write the Playwright specs for FR-003: iPad-class viewport, pen pointerType, the scroll assertion,
  and the CDP-driven two-finger gesture
- Do the manual iPad + Pencil pass and record the result in the PR body
- Add `.github/workflows/ci.yml`, including the e2e job, and delete `ci.yml.example`
- Confirm CI is green on `main`
- Run the full local gate set, `docs-lint.sh` included
