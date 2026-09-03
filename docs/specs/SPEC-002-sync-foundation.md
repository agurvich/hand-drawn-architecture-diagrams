# Spec: Sync foundation

**ID:** SPEC-002  
**Status:** Draft  
**Last Updated:** 2026-09-03  
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
- **Asset (image) upload to R2.** Pasting an image is not required to work in this spec. The seam is
  noted in `architecture.md` → Sync topology; wiring it is deliberately deferred so this spec's
  acceptance criteria stay about the sync protocol.
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
- [ ] Opening the app with no room id lands the user in a room without erroring — either a generated
      room or a documented default, and the spec's implementation plan states which
- [ ] While the connection is establishing, the UI shows a loading state rather than an empty canvas
      that would invite drawing into a document about to be replaced
- [ ] If the connection fails outright, the UI shows an error state naming the failure, and does not
      present an editable canvas whose changes would be silently discarded

### FR-003: Two clients converge

#### Description:

Changes made by one participant appear for the other, in both directions, with no manual save.

#### Acceptance Criteria:

- [ ] An end-to-end test opens two independent browser contexts on one room; a shape drawn in the first
      appears in the second without either page reloading
- [ ] The same test asserts the reverse direction from the second context to the first
- [ ] Deleting a shape in one context removes it in the other
- [ ] Each context renders the other's collaborator cursor
- [ ] After both contexts have made concurrent edits, their shape sets are identical — asserted by
      comparing the two documents, not by eyeballing a screenshot

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
type RoomId = string          // URL-safe; the unit of sharing

function roomIdFromUrl(url: URL): RoomId | null
function isValidRoomId(value: string): boolean
```

`src/shared/` is the correct home for these because both the client (to build its socket URL) and the
worker (to validate an incoming request) need the same notion of a valid room id, and two copies of
that rule drift.

---

## API / Interface Contract

```
GET  /connect/:roomId      // WebSocket upgrade; 4xx on an invalid room id
```

The client side is tldraw's sync hook, consumed by the existing `<App />`:

```
store = useSync({ uri: `${WORKER_URL}/connect/${roomId}` })
<Tldraw store={store} />
```

## Configuration / Environment

- `VITE_SYNC_URL` — the worker's origin as seen by the client. Defaults to the local worker in
  development. Must be present at build time; the app fails loudly at startup if it is missing rather
  than silently attempting a relative connection.
- `wrangler.toml` — worker name, the Durable Object binding, and the SQLite migration declaring it.

## File & Folder Structure

```
wrangler.toml
src/
├── client/
│   ├── App.tsx              # now room-aware
│   └── Room.tsx             # connection, loading and error states
├── shared/
│   └── room.ts              # room id parsing + validation, used by both sides
└── worker/
    ├── index.ts             # routes /connect/:roomId to the Durable Object
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
- Implement the loading and error states required by FR-002
- Wire `VITE_SYNC_URL`, failing loudly when absent

### Phase 3: Verification

- Write the two-context Playwright spec covering FR-003
- Write the disconnection and restart tests covering FR-004
- Confirm room isolation (FR-001) with a test using two distinct room ids
