# Completed Spec — SPEC-001: Scaffold and canvas

## What was completed?

- A Vite 8 / React 19 / TypeScript 6 (strict) application at the repo root, with the
  `src/client` / `src/shared` / `e2e` layout and a `@shared/*` alias (`tsconfig.app.json` `paths` plus
  its Vite `resolve.alias` twin — both must move together).
- A full-viewport tldraw 5 canvas (`src/client/App.tsx`), holding no state of its own: no
  `persistenceKey`, no `licenseKey`.
  > **Partly superseded by SPEC-002.** The canvas moved to `Room.tsx` and the document now persists
  > server-side in a Durable Object, so a reload restores it. The client still stores no document
  > records — that fence held; its home moved.
- `src/client/index.css` — the `touch-action: none` / `overscroll-behavior: none` host that stops an
  iPad drawing drag from scrolling the page. This is the substance of FR-003, not styling.
- `src/client/test/setup.ts` — the jsdom polyfills tldraw needs to mount at all.
- `e2e/canvas.spec.ts` — CDP-driven touch, pen and two-finger specs on Chromium at an iPad viewport.
- `.github/workflows/ci.yml`; `ci.yml.example` deleted.

### Deliberate deviations

- **tldraw pinned to 5.x, not the 4.x the spec's Tech Stack originally named.** On 4.x `indicator()`
  is abstract and `getIndicatorPath` never runs unless `useLegacyIndicator()` returns false, so a
  shape written the modern way silently draws no selection indicator. Recorded in `CLAUDE.md`.
- **Node 24 in CI, not the spec's default of 20.** Forced, not chosen: tldraw 5 declares
  `engines.node >= 22.12.0`.
- **Four jsdom polyfills, not the three the spec listed.** `window.matchMedia` is read at
  module-import time, so without it the failure arrives from importing `tldraw` before any test body
  runs. The spec's list was a floor, as the plan review predicted.
- **The window `__editor` handle** is exposed on mount so e2e asserts against real editor state rather
  than tldraw's internal DOM, which is not a contract and changes between releases.
- **FR-003's manual iPad + Pencil criterion is NOT yet ticked.** It needs physical hardware. Latency,
  pressure and palm rejection are unobservable through synthetic pointer events, so the automated
  specs are a regression gate on the CSS, not evidence the device feel is right.

## What changed from earlier specs?

Nothing — this is the first spec to ship code.

## Verification

Locally green: typecheck (and **proven to bite** — a planted type error exits non-zero), unit 2/2,
e2e 5/5, oxlint, prettier, `spec-lint.sh`, `docs-lint.sh`. Deferred: the manual iPad pass above, and
CI's first `npm ci` on linux-x64 against a lockfile generated on darwin-arm64.
