# Spec: Scaffold and canvas

**ID:** SPEC-001  
**Status:** Draft  
**Last Updated:** 2026-09-03  
**Depends On:** None

## Overview

Stand up the repository so there is something to build on: a running application that shows a tldraw
canvas you can draw on with a finger or an Apple Pencil, and a set of quality gates that actually run.
Nothing domain-specific is built here — no containers, no connections, no frames. The value of this
spec is that the next one starts from a green, checked, deployable-shaped project instead of an empty
directory, and that the single motivating feature of the whole rebuild — that drawing on an iPad feels
right — is confirmed before any effort is spent on top of it.

## Scope

### In Scope

- A Vite + React + TypeScript application that builds and runs
- A full-viewport tldraw canvas with its default tools, drawable by touch and pen
- Unit and end-to-end test harnesses, each with at least one real test
- Lint, typecheck and format commands, and a CI workflow that runs them

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

A Vite + React + TypeScript project exists at the repository root, with TypeScript in `strict` mode
and the directory layout `CLAUDE.md` → Layout names, so later specs have somewhere obvious to put
client, shared and worker code.

#### Acceptance Criteria:

- [ ] `npm install && npm run build` exits 0 from a clean checkout
- [ ] `npm run dev` serves the app and it renders without console errors
- [ ] `npm run typecheck` exits 0 and TypeScript `strict` is enabled in the committed config
- [ ] The directories `src/client/`, `src/shared/` and `e2e/` exist and are referenced by the build or
      test config, not merely created empty
- [ ] `npm run typecheck` exits **non-zero** when a deliberate type error is introduced into
      `src/client/`, proving the check is wired to the source rather than passing vacuously

### FR-002: A tldraw canvas fills the viewport and persists nothing

#### Description:

The application renders a tldraw canvas with the SDK's default tools and UI, occupying the full
viewport. No licence key is configured. State is in-memory only.

#### Acceptance Criteria:

- [ ] The canvas renders at full viewport height and width, with no page-level scrollbars
- [ ] A shape drawn with the default draw tool appears on the canvas
- [ ] Reloading the page yields an empty canvas — no `localStorage`, `sessionStorage` or IndexedDB key
      belonging to this app is present after drawing
- [ ] No licence key is present in source or environment config, and the app runs on localhost without
      one

### FR-003: Drawing works with touch and pen input

#### Description:

The motivating feature of the rebuild is that sketching on an iPad feels native. That is confirmed here
rather than assumed, because if it does not hold, the foundation is wrong and everything after this
spec is wasted.

#### Acceptance Criteria:

- [ ] An end-to-end test emulating an iPad-class viewport with touch enabled draws a freehand stroke
      via pointer events and asserts a shape was created on the canvas
- [ ] The same test asserts the page did not pan or scroll as a result of the drawing gesture
- [ ] A two-finger gesture pans or zooms the canvas rather than creating a shape
- [ ] Pointer events carrying a `pen` pointer type produce a stroke

### FR-004: Quality gates exist and run in CI

#### Description:

The gates `process.md` requires before every push are runnable by one command each, and the ones that
belong in CI run there on every push and pull request.

#### Acceptance Criteria:

- [ ] `npm test`, `npm run lint`, `npm run typecheck` and `npm run test:e2e` each exist and exit 0
- [ ] At least one real unit test and one real end-to-end test exist and are executed by those commands
      — a suite that passes because it is empty does not satisfy this
- [ ] `sh scripts/spec-lint.sh` and `sh scripts/docs-lint.sh` exit 0 against the repository
- [ ] A CI workflow runs install, lint, typecheck, unit tests, e2e tests and `spec-lint.sh` on push and
      pull request, and is green on `main`
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
    └── .gitkeep          # populated from SPEC-003 on
e2e/
└── canvas.spec.ts
```

## Implementation Phases

### Phase 1: Project skeleton

- Initialise Vite + React + TypeScript at the repo root, `strict` on
- Create the `src/client/`, `src/shared/`, `e2e/` layout and wire it into the build and test configs
- Add `build`, `dev`, `typecheck`, `lint`, `test`, `test:e2e` scripts to `package.json`
- Record the dependencies added in `CLAUDE.md` → Tech Stack if they differ from what is listed there

### Phase 2: The canvas

- Add the tldraw SDK and render a full-viewport `<Tldraw />`
- Confirm no persistence is configured and no licence key is set
- Write the unit test covering that the canvas mounts

### Phase 3: Input verification and gates

- Write the Playwright specs for FR-003, including the iPad-class viewport and pen pointer type
- Add the CI workflow and confirm it is green on `main`
- Run the full local gate set, `docs-lint.sh` included
