# Completed Spec — SPEC-002: Sync foundation

## What was completed?

- **A room is a Cloudflare Durable Object** (`src/worker/RoomDurableObject.ts`) holding a
  `TLSocketRoom`, persisting a debounced snapshot to its own SQLite storage. `idFromName(roomId)` is
  what makes same-id/different-id isolation structural rather than arranged.
- **The Worker owns `/api/*` only** (`src/worker/index.ts`); everything else is the SPA.
- **The room id is the whole URL path**, so a link is the unit of sharing. `src/shared/room.ts` holds
  validation, generation and the `RoomRoute` route, imported by client and worker both.
- **Four connection states** (`src/client/Room.tsx`): connecting, sync error, offline-but-editable,
  live. Plus a client-side malformed-id error that never opens a socket.
- **`e2e/sync.spec.ts`** — 11 specs driving two independent browser contexts against one room.

### Deliberate deviations

- **`run_worker_first = ["/api/*"]` was required and the spec originally missed why.**
  `not_found_handling` applies only when the asset router handles a request; with a `main` worker
  present, a non-matching path falls through to the Worker, so `GET /<roomId>` 404s. Since a room URL
  is the primary user-facing route, that was every real navigation.
- **The e2e `webServer` runs the dev server, not `vite preview`.** Preview serves the built client but
  not the worker, so sync would have had no server to talk to.
- **No R2 / asset upload.** `useSync`'s `assets` option is required, so a fail-loudly stub is passed
  rather than tldraw's base64 fallback, which would embed image bytes in the synced document and
  therefore in the room's SQLite permanently.
- **Collaborators render with no name.** Presence *styling* was Out of Scope; identity beyond
  tldraw's default is not built. Everyone is an anonymous cursor.
- **Two tabs in one browser profile count as ONE participant.** tldraw derives identity from browser
  storage. Not a defect, but it is why multiplayer looks broken when tested on a single device — the
  e2e helper `newParticipant` opens a separate context for exactly this reason.

## What changed from earlier specs?

- `src/client/App.tsx` (SPEC-001) became route-aware and no longer renders the canvas directly; the
  canvas moved to `Room.tsx`. SPEC-001's `App.test.tsx` was rewritten around routing accordingly —
  the canvas now needs a live synced store, so it is covered end to end rather than mocked.
- `vite.config.ts` gained the Cloudflare plugin (one origin for client + worker) and
  `build.outDir: dist/client`.
- `tsconfig.app.json` includes the generated `worker-configuration.d.ts`; without it every worker file
  fails on `Cannot find name 'Env'`.

## Verification

All gates green: typecheck, oxlint, prettier, unit 13/13, e2e 16/16, spec-lint, docs-lint.

Two things were verified by **planting the failure**, not just by passing: the offline test was
confirmed to bite by making a disconnect unmount the canvas (the exact FR-002/FR-004 contradiction an
earlier draft of the spec would have shipped), and it failed as intended. FR-004's worker-restart
criterion was verified by hand — two shapes drawn, the dev process killed and confirmed down,
restarted, and both shapes came back. That one is not automated; a process restart under Playwright's
own `webServer` is not reliably drivable, so it is a manual check recorded here.
