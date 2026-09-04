# Key Decisions — full register

The settled architectural decisions, in full. **Don't re-litigate these.** `CLAUDE.md` carries a
one-line digest of each; this file carries the reasoning, the constraints, what was rejected, and any
explicit "do NOT build" fences. Pull the entry you need — you rarely need them all.

Rules that keep this file useful (each earned by a real failure in a project run this way):

- **Entry first, line second.** Write the full entry here *before* adding the one-line digest to
  `CLAUDE.md`. The digest line must never be the only home of a fact — a digest that outgrows its
  register inverts the whole model.
- **One `###` heading per entry**, listed in the Contents below. The heading label matches the bold
  label of its `CLAUDE.md` digest line, so the line greps straight to its entry.
- **When a decision reverses an earlier one,** update the old entry in place — and add a superseded
  marker (a short blockquote: what changed, which spec changed it, where the full entry lives) at
  every *other* doc site that still states the old claim (arc narratives, architecture sections).
  The new entry alone is not enough; a reader who lands only on the old site must see the reversal.
- **Date-stamp user decisions** (YYYY-MM-DD) so "settled" has a when.

One constraint the shape imposes: `## Key Decisions` cannot carry a fenced block, so an example of
the digest format belongs in another section of `CLAUDE.md`, not inside the digest itself.

`scripts/docs-lint.sh` checks the first two mechanically — run it locally before every push: this file must exist, every
`CLAUDE.md` digest label must have a `###` entry here and every entry a digest label, and every entry
must appear in the Contents. The `(example)` entry below is exempt, so a fresh scaffold is green
until the first real decision lands.

## Contents

- [Canvas SDK: tldraw](#canvas-sdk-tldraw)
- [Store-native domain state](#store-native-domain-state)
- [Multiplayer lands before the first custom shape](#multiplayer-lands-before-the-first-custom-shape)
- [Hobby licence accepted for now; commercial use is unresolved](#hobby-licence-accepted-for-now-commercial-use-is-unresolved)
- [Secondary features deferred pending real use](#secondary-features-deferred-pending-real-use)
- [Derived views are computed, never materialized](#derived-views-are-computed-never-materialized)

---

### Canvas SDK: tldraw

**Settled 2026-09-03.** The rebuild is built on the tldraw SDK rather than Excalidraw or another
hand-rolled React Flow layer.

The predecessor app proved which interaction mechanics matter but hand-rolled every primitive, and
three things it lacked were the reason to rebuild: iPad-native freehand drawing, real self-hosted
multiplayer, and sketch-to-clean-shape recognition. None is worth building from scratch.

**Rejected: Excalidraw.** MIT-licensed with no watermark and it ships shape recognition, which tldraw
does not. It was rejected on extensibility: it has no first-class custom-element API and its toolbar
and properties panel are not overridable, so the realistic pattern is a companion overlay synced
through `updateScene`/`customData` rather than a native extension. Our core feature — hierarchical
containers with frame-based narration — *is* a custom element, so the thing we most need is the thing
Excalidraw makes hardest. Its self-hosted multiplayer is also DIY (a community relay), against
tldraw's documented, officially-maintained path.

**Rejected: staying on React Flow.** It is the status quo the handoff exists to leave.

**Accepted cost:** shape recognition does not exist in tldraw and would be built later as a
simplify-and-classify pass over freedraw strokes. Treated as bounded and additive — see
[*Secondary features deferred pending real use*](#secondary-features-deferred-pending-real-use) for how unproven features are staged. The licence
cost is a separate entry: [*Hobby licence accepted for now*](#hobby-licence-accepted-for-now-commercial-use-is-unresolved).

### Store-native domain state

**Settled 2026-09-03.** Hierarchy, connections, frames and every other piece of domain state are
tldraw records, mutated through tldraw's own `Editor`/store APIs. A parallel state manager — a Zustand
store that renders *into* tldraw as a view — is explicitly not built.

tldraw's sync works by synchronising the underlying reactive store itself. Anything held outside that
store is invisible to sync no matter when multiplayer is added, so a shadow store does not merely
delay collaboration, it makes it a rearchitecture of the mutation layer rather than the addition of a
server. The predecessor's Zustand store is the shape this fence exists to prevent being recreated.

**Do NOT build:** a domain store beside the tldraw store, or a mutation path that writes domain state
anywhere records do not reach. If a piece of state seems not to fit in a record, that is a modelling
question to escalate, not a reason to open a second store.

Enforced in practice by [*Multiplayer lands before the first custom shape*](#multiplayer-lands-before-the-first-custom-shape), which puts sync in the
repo before there is any custom shape to model wrongly.

### Multiplayer lands before the first custom shape

**Settled 2026-09-03.** Sync is SPEC-002 — after the bare scaffold, before any custom shape. This
inverts the handoff's own migration plan, which listed multiplayer last, as step 5.

The handoff already carried the constraint ("build store-native from the first spike") but left the
proof of it to the end. Two facts make that ordering expensive. First, tldraw's multiplayer starter
kit requires every custom shape to be declared on **both** sides — a server-side schema in the
Durable Object for validation, migration and version compatibility, and a client-side `ShapeUtil` for
rendering — and the two must agree. Second, that duality is cheapest to establish on the smallest
possible shape and most expensive to retrofit across a finished shape library.

So the order is: prove the room syncs with tldraw's built-in shapes (SPEC-002), then prove one
trivial custom shape survives the client/worker boundary including a migration (SPEC-003), and only
then build the shape that carries real complexity — nesting and collapse (SPEC-004).

**Rejected: spike the hierarchy mechanic first, add sync later.** It is the handoff's plan and the
faster route to a demo, but it puts the riskiest mechanic on an unproven persistence layer and
discovers schema problems after there is a shape library to rewrite. The user raised this directly —
the concern was storing state in the correct synchronised form — and it is the better call.

### Hobby licence accepted for now; commercial use is unresolved

**Settled 2026-09-03, with a live fence.** Development proceeds on tldraw's free tier. Production
deployment is blocked until the commercial question is answered.

tldraw SDK 4.0 (September 2025) made this stricter than the handoff records. Current terms: localhost
and development need **no licence key at all**; production — HTTPS, non-localhost — requires a key,
which is either a paid commercial licence or a **free hobby licence that is non-commercial only** and
forces a "made with tldraw" watermark.

The user accepted the watermark. **The watermark is not the binding constraint — the non-commercial
restriction is.** The handoff's own read is that this is likely commercial use: built for work,
shared with a colleague. If that holds, the hobby tier does not cover the intended use whatever one
thinks of the watermark, and the commercial licence is the only compliant production path.

Because development is unlicensed, this fences **deploy-time only** and does not block SPEC-001
through SPEC-004. Recorded as a Known Constraint in `architecture.md` rather than a blocker.

**Do NOT** write a production deploy spec, or deploy a room to a public host, until this entry is
updated with the answer.

### Secondary features deferred pending real use

**Settled 2026-09-03.** Edge sets (lens-scoped edges), node-lens grouping, the actor/action/trigger
model, per-frame sticky notes and the share-link/read-only mode are **not** ported on a schedule.
They are recorded in `architecture.md` → *Deferred / Non-goals* with their seams, and revisited once
the tool is usable.

The handoff ranks them "valuable but secondary" against the core of hierarchical nesting plus
frame-based narration. The user is explicit that this is a chance to reorganise rather than
transcribe — including that they are less attached to edge sets than they were, and will not know
whether the feature is necessary until they have actually used the rebuilt tool. Porting a feature
before that judgement is possible risks carrying over a shape the new foundation makes obsolete;
tldraw's bindings, for one, may make the actor/trigger anchoring fall out of the connection model for
free.

**Not deferred:** JSON export/import and the AI-authoring schema. The user names these a must, and
they are the most renderer-agnostic thing the old app has — they survive the change of foundation
nearly as-is, which is why they sit in the arc rather than in this list (see
`docs/specs/INDEX.md` for the current build order; the number has moved once already).

**The deferral is a decision, not an omission.** A feature dropped here is dropped on purpose and
needs a spec to return, not a silent reintroduction mid-build.

### Derived views are computed, never materialized

**Settled 2026-09-04 (SPEC-006).** A view that is a pure function of existing records is computed on
each client, every time. It is not written back into the store as new records.

The case that forced it: collapsing a container merges the connections crossing its boundary into
deduplicated lines. The obvious implementation creates a merged connection record on collapse and
deletes it on expand. Under sync that is a defect rather than an inefficiency — two clients
collapsing the same container both write, and the room keeps duplicate merged records that no expand
deletes. There is no coordination point to add one, because the whole design has no server-side
domain logic; the Durable Object validates records, it does not arbitrate them.

Computing instead makes the question disappear. Every client derives the same answer from the same
records, so agreement is a property of the function rather than of the protocol. Where the derivation
must pick one of several equivalent records — which connection represents a merged group — the rule
is a **total order on data both clients already have** (the smallest shape id), never creation order,
insertion order or a timestamp.

**Two fences fall out of this, and both are load-bearing:**

- **A derived index holds ids and flags, never coordinates.** SPEC-005's result is that a connection's
  anchors are read from the bound shapes' page transforms at geometry time, which is what makes moving
  a *container* re-route lines bound to its descendants. An index caching anchor points puts a staler
  second answer beside the live one. In practice the structure prevents it: the derivation lives in
  `src/shared/`, which has no access to page transforms.
- **The derivation is not a licence to compute domain state outside the store.** What is derived here
  is a *view* of records; the records themselves stay in the tldraw store, per
  [*Store-native domain state*](#store-native-domain-state). A value that cannot be recomputed from
  records is not a derived view, it is state, and it belongs in a record.

**Rejected: materialize on collapse, delete on expand.** Faster to render and trivially wrong under
two clients. **Rejected: elect a representative by creation order.** Two clients can create
concurrently, so "first" is not a value both agree on.
