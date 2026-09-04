# Spec: Sync foundation

**ID:** SPEC-002  
**Status:** Completed  
**Last Updated:** 2026-09-03 (rev 4 — post-fix-verification)  
**Depends On:** SPEC-001

## Overview

Make the canvas collaborative. Two people opening the same room link see each other's drawing as it
happens, and the drawing survives everyone leaving. This is the feature the predecessor app never had
— its "sharing" was a compressed snapshot in a URL — and it is built now, before any domain shape
exists, because tldraw synchronises its own store: what a later shape can do is constrained by the
room boundary, so the boundary is established first and every shape after it is designed against a
constraint that is already real rather than one that is imagined.

## Scope

### In Scope

- A Cloudflare Worker with a Durable Object holding one room's document and broadcasting changes
- A client that joins a room named by the URL and syncs tldraw's built-in shapes through it
- Persistence of room state across server restarts, and client recovery across dropped connections
- A local development story that runs client and worker together with one command
- End-to-end tests that drive **two** independent clients against one room

### Out of Scope

- **Custom shapes.** The room syncs tldraw's built-ins only. The first custom shape is SPEC-003, and
  the client/worker schema duality it introduces is that spec's entire subject.
- **Asset (image) upload to R2.** No R2 bucket, no upload route. But `useSync` requires an `assets`
  store — the option is **not optional** — so this spec cannot stay silent on it and does not. The
  decision is made in FR-002: a stub store that **fails loudly** on upload. The rejected alternative
  is tldraw's inline base64 fallback, which would embed image bytes in the synced document and
  therefore in the Durable Object's SQLite storage that FR-004 persists forever — a storage problem
  disguised as a default.
- **Authentication, authorisation, room permissions and read-only mode.** Anyone with a room URL can
  edit. Read-only is listed under Deferred / Non-goals.
- **A deployed environment.** Everything here is verified against a local worker. Deploying is fenced
  by the licence question (`architecture.md` → Known Constraints).
- **Presence styling beyond the SDK default** — tldraw draws collaborator cursors itself; theming them
  is not in scope.

---

## Functional Requirements

### FR-001: A room server runs locally

#### Description:

A Cloudflare Worker exposes a WebSocket endpoint per room, backed by a Durable Object that holds one
room's document and persists it to its own storage. It runs locally under Wrangler alongside the Vite
dev server.

#### Acceptance Criteria:

- [ ] One command starts both the client and the worker, and the client reaches the worker without
      further configuration
- [ ] A WebSocket connection to a room endpoint is accepted and stays open
- [ ] Two connections naming the **same** room id reach the same Durable Object instance
- [ ] Two connections naming **different** room ids reach different instances, and a change in one room
      does not appear in the other
- [ ] A request to a malformed or missing room id is rejected with an error response rather than
      opening a connection or creating a room

### FR-002: The client joins a room named by the URL

#### Description:

The canvas from SPEC-001 becomes a room client. The room id is taken from the URL, so a link is the
unit of sharing.

#### Acceptance Criteria:

- [ ] Opening a URL carrying a room id connects to that room and renders its current contents
- [ ] Opening the app with no room id **generates a fresh room id and redirects** to that room's URL.
      The generated id is **not** written to `localStorage` or any other client storage: SPEC-001
      forbids a second home for state, and the starter kit's habit of remembering the last room is
      exactly that. A room is remembered by its URL — that is what makes a link the unit of sharing

The states below are the ones `useSync` actually exposes — its status union is exactly
`loading | error | synced-remote`, and connectivity after a successful connect is a *separate*
`connectionStatus`. That separation is the point: "the server went away" is **not** an error
condition. `useSync` keeps `status: 'synced-remote'` with `connectionStatus: 'offline'` and retries,
so unmounting the canvas there would destroy the local edits FR-004 requires to survive and re-sync —
the two FRs would demand opposite behaviour on the same event.

- [ ] **Connecting** (`status === 'loading'`): **no editable canvas is mounted** — asserted in an e2e
      test against a delayed connection, by `data-testid="room-loading"` being present and the tldraw
      canvas absent. Drawing into a document about to be replaced must be impossible, not discouraged
There are **two distinct failure surfaces**, and collapsing them is what makes one of them dead code.
A malformed room id is caught by the client before a socket opens; a sync error can only arrive from a
server that the client did connect to. Both must exist.

- [ ] **Malformed room id** (`RoomRoute.kind === 'invalid'`, client-side): `data-testid="room-error-id"`
      is present and **no socket is opened** — which is what makes FR-001's "rejected rather than
      opening a connection" true from the user's side
- [ ] **Sync error** (`status === 'error'`, server-side): `data-testid="room-error-sync"` is present,
      no editable canvas is mounted, and the message comes from `store.error`. Reached when the server
      closes the socket with a sync error reason — a **well-formed** room id the server rejects
      produces `NOT_FOUND` here. This is the surface SPEC-003 FR-003 routes its `INVALID_RECORD`
      assertion through, so it must be built from `store.error` and not faked from the route
- [ ] A merely unreachable server reaches **neither**; `useSync` retries in `loading` indefinitely, so
      it is covered by the loading criterion above plus the timeout below
- [ ] **Offline after connecting** (`connectionStatus === 'offline'`): the canvas **stays mounted and
      editable**, and a `data-testid="room-offline"` indicator appears. Asserted to still be editable
      — this is the criterion that keeps FR-002 and FR-004 consistent
- [ ] A connection stuck in `loading` past 10 seconds surfaces `data-testid="room-slow"` telling the
      user it is still trying. Without it, an unreachable server is indistinguishable from a slow one
      and the app appears hung forever
- [ ] Every state above is the **app's own** UI, not the SDK's default screens — passing the store straight to
      `<Tldraw>` would tick with no work done

### FR-003: Two clients converge

#### Description:

Changes made by one participant appear for the other, in both directions, with no manual save.

#### Acceptance Criteria:

- [ ] An end-to-end test opens two independent browser contexts on one room; a shape drawn in the first
      appears in the second without either page reloading
- [ ] The same test asserts the reverse direction from the second context to the first
- [ ] Deleting a shape in one context removes it in the other
- [ ] Each context renders the other's collaborator cursor
- [ ] Concurrent edits converge: both contexts are taken offline, each draws a different shape, both
      reconnect, and their shape sets are then identical — asserted by comparing the two documents,
      not by eyeballing a screenshot. Staging it through the offline path rather than racing two live
      sockets is what makes this test deterministic rather than flaky

### FR-004: State survives disconnection and restart

#### Description:

The two failure modes that make a collaborative tool untrustworthy are a dropped connection losing
work and a server restart losing the document. Both are asserted here rather than assumed from the
starter kit.

#### Acceptance Criteria:

- [ ] With the network interrupted, a client re-establishes its connection without a page reload
- [ ] Changes made by the *other* client during the interruption are present after reconnection
- [ ] Changes made *locally* while disconnected are present in the other client after reconnection
- [ ] Restarting the worker and reloading a client yields the room's prior contents, not an empty
      canvas

---

## Data Model

No domain types yet. The synced document is tldraw's own default schema; this spec adds only the
room's addressing.

```ts
// src/shared/room.ts

// A room id is 8-32 chars of [A-Za-z0-9_-]. Nothing else. The bound is stated
// here because FR-001's "malformed id is rejected" criterion is not binary
// without it — an implementer would otherwise invent the rule its own test
// asserts against.
type RoomId = string

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/

function isValidRoomId(value: string): boolean
function generateRoomId(): RoomId          // 16 chars from the same alphabet

// Returning `RoomId | null` cannot express the difference between "/" and
// "/short", and FR-002 sends those two to OPPOSITE outcomes -- redirect vs
// error. A discriminated result is required, not a stylistic preference.
type RoomRoute =
  | { kind: 'none' }                    // "/"        -> generate + redirect
  | { kind: 'invalid'; raw: string }    // "/short"   -> error state
  | { kind: 'valid'; id: RoomId }       // "/abc123.." -> connect

function roomRouteFromPath(pathname: string): RoomRoute
```

**An invalid room id never opens a socket.** The client rejects it from `roomRouteFromPath` before
connecting, which is what makes FR-001's "rejected rather than opening a connection" true from the
user's side. The worker validates independently for its own sake — a client is not a trust boundary.

**The client URL is `/<roomId>`** — the room id is the entire path. That is the link a user sends, so
it is stated here rather than left to two implementers to invent differently. The worker's sync route
is namespaced under `/api/` to avoid colliding with it.

`src/shared/` is the correct home for these because both the client (to build its socket URL) and the
worker (to validate an incoming request) need the same notion of a valid room id, and two copies of
that rule drift.

---

## API / Interface Contract

```
GET  /api/connect/:roomId    // WebSocket upgrade; 4xx on an invalid room id
GET  /<roomId>               // the SPA; the room id is the whole path
```

The client side is tldraw's sync hook, consumed by the existing `<App />`:

```
// `assets` is REQUIRED by UseSyncOptionsBase — omitting it is a type error
// under SPEC-001's strict gate, not a stylistic choice.
store = useSync({
  uri: `${window.location.origin}/api/connect/${roomId}`,
  assets: failLoudlyAssetStore,   // see Out of Scope: no R2, no base64 inlining
})
// The route is resolved BEFORE connecting: a malformed id never opens a socket.
const route = roomRouteFromPath(location.pathname)
if (route.kind === 'none')    return redirectTo(generateRoomId())
if (route.kind === 'invalid') return <RoomIdError raw={route.raw} />   // room-error-id

// Only a well-formed id reaches useSync. FR-002 requires branching on status;
// passing the store straight through is the shape that criterion calls vacuous.
const store = useSync({ uri, assets: failLoudlyAssetStore })
if (store.status === 'loading') return <RoomLoading />                 // room-loading
if (store.status === 'error')   return <RoomSyncError error={store.error} />  // room-error-sync

// synced-remote: canvas ALWAYS mounted and editable, offline or not.
<>
  <Tldraw store={store.store} />
  {store.connectionStatus === 'offline' && <OfflineIndicator />}       // room-offline
</>
```

## Configuration / Environment

**No sync-URL environment variable.** The Cloudflare Vite plugin serves the client and the worker on
a **single origin** in development, so the client builds its socket URI from
`window.location.origin` and needs no configuration. This is what makes FR-001's "one command, no
further configuration" true; an env var would contradict it.

- `wrangler.toml` — worker name, the Durable Object binding, the `[[migrations]]`
  `new_sqlite_classes` entry declaring it, and the `[assets]` block below.

  **`not_found_handling` alone is not enough, and this is the trap:** it applies only when the asset
  router handles the request. With a `main` worker present, a path that matches no asset falls
  through to the Worker instead — so `/` serves only because `index.html` is a literal asset match,
  while `GET /<roomId>` 404s. Since a room URL is the primary user-facing route, that is every real
  navigation. `run_worker_first` is what scopes the Worker to the API and leaves everything else to
  the asset router:

```toml
[assets]
directory = "./dist/client"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]
```

  The equivalent alternative, if the plan prefers it, is for the Worker to return
  `env.ASSETS.fetch(request)` for any non-`/api/` path. Either is acceptable; silence is not.

- `worker-configuration.d.ts` — generated by `wrangler types` at the repo root. It must be added to
  the `tsconfig` `include`, or every worker file fails to typecheck on `Cannot find name 'Env'` and
  `Cannot find module 'cloudflare:workers'`. One tsconfig covers both runtimes; DOM and
  `@cloudflare/workers-types` coexist.

## File & Folder Structure

```
wrangler.toml
src/
├── client/
│   ├── App.tsx              # now room-aware
│   ├── Room.tsx             # connection, and the app's own loading + error states
│   └── assetStore.ts        # the fail-loudly stub satisfying useSync's `assets`
├── shared/
│   └── room.ts              # room id parsing + validation, used by both sides
└── worker/
    ├── index.ts             # routes /api/connect/:roomId to the Durable Object
    └── RoomDurableObject.ts # document, persistence, broadcast
e2e/
└── sync.spec.ts             # two browser contexts, one room
```

## Implementation Phases

### Phase 1: The worker

- Add Wrangler and the Durable Object binding; write `wrangler.toml`
- Implement room routing and id validation from `src/shared/room.ts`
- Implement the Durable Object: accept sockets, hold the document, persist on change

### Phase 2: The client

- Replace SPEC-001's bare `<Tldraw />` with a room-aware component using tldraw's sync client
- Implement the app's own loading, error, offline and slow states required by FR-002, with the
  testids named there, branching on `useSync`'s status rather than delegating to the SDK screens
- Implement generate-and-redirect for a URL carrying no room id
- Write the fail-loudly asset store and pass it to `useSync`

### Phase 3: Verification

- Write the two-context Playwright spec covering FR-003
- Write the FR-002 loading and error specs, driving a delayed and a failing connection
- Write the disconnection and restart tests covering FR-004. The restart is driven by stopping and
  restarting **the single Vite+worker dev process** under Playwright's `webServer` control — not
  `wrangler dev` alone, which serves no client on that origin and so breaks the single-origin story
  that makes FR-001 true. Room state survives in miniflare's `.wrangler/state`
- Confirm room isolation (FR-001) with a test using two distinct room ids
