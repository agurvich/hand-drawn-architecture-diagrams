# hand-drawn-architecture-diagrams — Architecture

The design reference: *what* we're building and *why*, including decisions made along the way. Read the
**section you need**, not the whole file. It is intentionally allowed to be ahead of the code —
sections describe the target design, not necessarily what's implemented yet.

> **Keep it sectioned and skimmable.** Each numbered section owns one concept so a session can pull just
> that one. Reasoning that justifies a one-line entry in `CLAUDE.md` → Key Decisions lives here.

---

## 1. Purpose & scope

A hand-drawn architecture-diagramming tool: sketch on an iPad with a pencil, and share the drawing
live with a colleague over a self-hosted room. It owns the canvas, the domain shapes layered on top
of it (containers that nest and collapse, connections between them, narration scenes), and the sync
server that makes a room collaborative.

It does **not** own: general-purpose drawing primitives, freehand stroke rendering, or the
collaboration protocol — those are the tldraw SDK's, which is the reason for choosing it.

It is a rebuild, not a refactor. `../architecture-diagrams` is a read-only source of prior art: what
the features were and how their derivation logic worked. Its rendering layer and its Zustand store do
not carry over.

## 2. The store-native constraint

The single load-bearing rule: **domain state lives in tldraw's own store**, as records, mutated
through the `Editor` API.

tldraw's sync operates on the reactive store itself. State held anywhere else — a Zustand store, a
React context, a module-level cache — is invisible to sync, and stays invisible no matter when
multiplayer is switched on. Retrofitting it later is not "adding a server", it is rewriting the
mutation layer.

The predecessor app is the counter-example this section exists to name: a custom store that treated
the canvas as a view. That design is what made its sharing a gzip'd URL snapshot instead of a
session.

Full reasoning and the explicit fence: `decisions.md` → *Store-native domain state*.

## 3. Sync topology

One **room** per diagram. A room is a Cloudflare Durable Object: a single authoritative instance
holding the document in memory, persisting every change to its own SQLite storage, and broadcasting
over WebSockets to connected clients. Clients reconnect and replay missed changes on drop. Assets
(pasted images) go to R2 and are served from the edge.

The consequence that shapes every later spec is the **dual declaration**: a custom shape must be
known to both halves. The worker needs its schema for validation, migration and version
compatibility; the client needs a `ShapeUtil` for geometry, rendering and its indicator path. If the
two disagree, records are rejected at the room boundary.

We therefore keep **one definition** in `src/shared/`, and derive both halves from it, rather than
maintaining two hand-written declarations that drift. See `decisions.md` → *Multiplayer lands before
the first custom shape* for why this is proven before the shape library exists rather than after.

## 4. The shape model

Three domain shapes sit on top of tldraw's built-ins:

- **Container** — a node that can hold other nodes to arbitrary depth, and collapse. On collapse its
  children's connections to the outside world merge into deduplicated lines drawn against the
  container itself. This is the mechanic the handoff calls the core feature, and the riskiest one.
- **Connection** — an edge bound to its endpoints via tldraw's binding system, so it re-routes when a
  node moves and can be dragged to a new endpoint. *Named ports are deferred:* SPEC-005 binds to the
  **node** and derives the anchor from geometry, with an optional `port` prop reserved as the seam. The pattern is taken from
  tldraw's workflow starter kit; its execution engine is not (see `CLAUDE.md` → Out of Scope).
- **Scene** — a named snapshot of view state (what is expanded, highlighted, visible), steppable
  forward and back to narrate one persistent graph. Not tldraw's own scene shape, which is only a
  clipping container.

## 5. What ports from the predecessor

The renderer does not port. Two things do:

- **The JSON schema and its AI-authoring guide** — `src/types/diagram.ts` and
  `docs/ai-authoring-guide.md` in the old repo. Rendering-agnostic, and the user names export/import a
  must-have. **The ideas ported; the schema did not.** SPEC-007 shipped a narrower document:
  `edges` became `connections`, `position` became `x/y/w/h`, validation went from deliberately loose
  to strict and total, and `metadata`, `edgeSets`, `scenes`, `icon`, `isActor`, `autoLayout` and
  `colorPalette` are all gone until something reads them. Current guide:
  `docs/ai-authoring-guide.md`; the format lives in `src/shared/document.ts`.
- **The derivation logic** — `src/engine/` in the old repo: `computeEffectiveGraph`, ancestry
  resolution, container layout. This is the real IP. It is reimplemented to operate over tldraw
  records rather than lifted verbatim, but the algorithms carry.

---

## Architecture Decision Record

An **index** of the decisions that changed the *shape* of the system — a piece added or removed, a
boundary moved, a mechanism swapped. Not every decision: a rule, a fence or a per-feature choice is a
`decisions.md` entry and nothing more, and a table that grows a row per spec has stopped being an
orientation aid. Rows are **append-only and never renumbered** — a superseded decision keeps its row
and gains a note naming the row that replaced it.

| # | Decision | Context | Note |
|---|---|---|---|
| 1 | Rebuild on the tldraw SDK | The predecessor hand-rolled every canvas primitive and could not offer iPad-native drawing or real multiplayer | `decisions.md` → *Canvas SDK: tldraw* |
| 2 | Domain state moves into the canvas store | A parallel store cannot be synced; the boundary between "app state" and "canvas state" is removed | `decisions.md` → *Store-native domain state* |
| 3 | Sync server added before the shape library | Custom shapes must be declared on client and worker both; proving that first is cheaper than retrofitting it | `decisions.md` → *Multiplayer lands before the first custom shape* |

---

## Known Constraints

Hard constraints and non-obvious gotchas that shape every spec. New constraints get added here the
first time they bite.

- **tldraw production needs a licence key; development does not.** Localhost/dev is unlicensed, so
  nothing here blocks building. Production requires either a paid commercial licence or a free hobby
  licence that is **non-commercial only** and carries a watermark. The non-commercial restriction —
  not the watermark — is the binding one, and this is likely commercial use. **No production deploy
  spec until it is settled.** Full entry: `decisions.md` → *Hobby licence accepted for now*.
- **Every custom shape is declared twice** — client `ShapeUtil` and worker schema — and the two must
  agree or records are rejected at the room boundary. Derive both from one definition in
  `src/shared/`; never hand-write them separately.
- **Persisted rooms make shape props migration-bearing.** A prop added or renamed without a migration
  corrupts existing rooms rather than failing loudly. Every prop change ships a migration.
- **`useSync` separates document status from connectivity, and losing the server is not an error.**
  Its status union is exactly `loading | error | synced-remote`; `status: 'error'` arrives *only* from
  a server closing the socket with a sync error reason. An unreachable server retries in `loading`
  forever, and a mid-session drop stays `synced-remote` with `connectionStatus: 'offline'` — the
  canvas must stay mounted and editable there, or offline edits are destroyed instead of re-synced.
  **This is recorded because it was specified wrongly twice**, from reasoning rather than from the
  SDK's actual state machine; the values above were measured against a live `TLSocketRoom`. A UI that
  treats disconnection as failure is the failure.
- **OPEN DEFECT, HIGH PRIORITY (2026-09-04): the app renders a fully blank page on iPad.** Desktop
  Chromium is fine; the e2e suite passes at an emulated iPad viewport. A real iPad over the LAN dev
  URL shows white — not the loading spinner, not the error box, so this is a **crash before first
  paint**, not a failed connection. Nothing has been ruled out yet; no time was spent debugging.
  This blocks the product's entire premise, so no feature spec should be treated as validated on the
  target device until it is fixed.
  Where to start tomorrow, most-likely first:
  1. **Insecure context.** The dev URL is `http://<LAN-IP>`, so `window.isSecureContext` is false and
     `crypto.randomUUID()` throws. If tldraw or a dependency calls it at import time, the module
     never evaluates and the page is blank with no visible error. Cheapest check: serve over HTTPS
     (a tunnel, or Vite's `server.https`) and see if it survives.
  2. **Build/syntax target.** An older iPadOS Safari failing to parse shipped syntax fails silently
     and blank. Check the iPadOS version against Vite's default target.
  3. Only then, an in-page console — Safari on the iPad plus Mac Safari's Web Inspector attaches for
     free and needs no dependency. iOS Chrome cannot be inspected at all; every iOS browser is
     WKWebView and none expose devtools.
- **The target device is an iPad with a pencil.** Pointer-event handling, hit targets and panel layout
  are judged on touch first, not on a desktop mouse.

## Deferred / Non-goals

Deferred on purpose, with the seam noted. Each needs a spec to return — none is reintroduced
mid-build. Reasoning: `decisions.md` → *Secondary features deferred pending real use*.

- **Edge sets (lens-scoped edges)** — the user is undecided on whether the feature survives contact
  with the rebuilt tool. Seam: a `Connection` gains a set-membership prop; the toggle is a scene's
  view state, which is where the scene model already stores visibility.
- **Node-lens grouping** — regrouping nodes into regions by a shared metadata key, with barycenter
  crossing-reduction. Seam: a derived layout pass over records; it reads the graph and writes
  positions, so it needs no new shape.
- **Actor / action / trigger model** — the ACTOR half is no longer deferred: specified as SPEC-011
  (2026-09-05), and the suspicion below held — an attribution is a binding. TRIGGERS remain deferred:
  they need a connection to bind to a connection, which SPEC-005 deliberately fenced off, and moving
  that fence should be argued on its own evidence.
- **Per-scene sticky notes, share-link / read-only mode** — the read-only case may reduce to a tldraw
  primitive plus a room permission rather than the old app's store-level mutation choke point.
- **Sketch → clean-shape recognition** — one of the three motivations for the rebuild, and the one
  tldraw does not ship. Bounded and additive: a simplify-and-classify pass over freedraw strokes.
- **"Trace a request"** — walk the connection graph in topological order from a chosen source and
  generate a scene sequence automatically, so narration is derived rather than hand-authored. Reuses
  the workflow kit's dependency resolver without adopting its execution semantics. Speculative, and
  recorded here so the idea is not lost.
