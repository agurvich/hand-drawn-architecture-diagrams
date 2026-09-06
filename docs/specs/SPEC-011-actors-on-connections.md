# Spec: Actors on connections

**ID:** SPEC-011  
**Status:** Draft  
**Last Updated:** 2026-09-05 (rev 2 — post-review)  
**Depends On:** SPEC-004, SPEC-005, SPEC-006, SPEC-008

## Overview

A connection says *what talks to what*. It cannot say *who did it* — and the thing doing it is often
neither end. An IAM role copies an object between two buckets it is not itself drawn connected to; a
scheduler kicks off a job that writes to a database; a person approves a transfer between two
accounts. Draw only the endpoints and the actor disappears from the diagram, which is usually the
part someone is asking about.

This spec attributes a connection to a node: **this line is performed by that thing**, independent
of the line's two ends.

The predecessor did this with an `actorId` field on the edge and an `isActor` flag on the node.
`architecture.md` records the suspicion that the new foundation makes it fall out differently, and it
does: **an attribution is a binding**, the same mechanism a connection already uses to hold its
endpoints. That buys sync, validation, migration and lifecycle for free, and removes the
second-home-for-an-id problem the field version has.

## Scope

### In Scope

- A `connectionActor` binding: a connection attributed to a node, independent of its endpoints
- Attributing, re-attributing and clearing, from the connection
- How an attributed connection reads on the canvas
- What a merged connection (SPEC-006) shows when its members disagree about the actor
- The canvas half only. The **document** half is SPEC-012

### Out of Scope

- **Actors in the JSON document.** Split into SPEC-012 rather than carried here, following the
  precedent SPEC-008 set when its document half became SPEC-009: it needs a `version: 3`, its own
  frozen corpus and its own guide section, and it is unbuildable until SPEC-009 exists. Folding it in
  would pin four requirements that are buildable today behind two that are not. Consequence stated
  plainly: until SPEC-012, an attribution does not survive an export, and the guide must say so.

- **Triggers.** The predecessor's third layer: an edge pointing at *another edge* to say "this step
  caused that action". It needs a connection to bind to a connection, and SPEC-005 deliberately
  fenced that off — `canBind` returns `toShape.type !== CONNECTION_SHAPE_TYPE`. The reasoning lives
  in the code comment and in `docs/spec-delivery/SPEC-005-connections.md`, not in SPEC-005's spec
  text: it was a mid-build correction, which is exactly why it is easy to move by accident. Moving that fence is a spec of its own and should be argued on its own evidence,
  not smuggled in behind actors. Seam: the fence, and a `trigger` terminal on this spec's binding.
- **An `isActor` flag on the node.** The predecessor had one, marking which nodes were *eligible*.
  Not ported: a node is an actor because something attributes to it, which is derivable, and
  `decisions.md` → *Derived views are computed, never materialized* says a derivable fact does not
  get a stored field. It also means no shape prop and no migration. Cost stated plainly: nothing
  stops you attributing to any node, so the tool will not tell you that attributing a database to a
  connection is odd.
- **More than one actor per connection.** One line, one performer. Two is a modelling question with
  no obvious rendering, and the binding makes it trivial to add later if the single case proves too
  narrow.
- **The actor influencing routing or layout.** The predecessor drew a small anchor circle at the
  edge midpoint, largely so triggers had something to point at. With triggers out of scope that
  anchor has no job, and inventing one would be building the trigger feature's furniture without the
  feature.
- **Changing what a node IS.** No shape type, no shape prop, no shape migration.

---

## Functional Requirements

### FR-001: An attribution is a binding, with its own lifecycle

#### Description:

`connectionActor` is a second binding type from the connection shape, alongside
`connectionEndpoint`. It follows every rule SPEC-005 established for the first one — declared once
under `src/shared/`, consumed by a client `BindingUtil` and the worker schema, neither side writing
the type string, a migration for every prop change.

**Its lifecycle is the opposite of the endpoint binding's, and that is the whole reason it is a
separate type.** `ConnectionBindingUtil.onBeforeDeleteToShape` deletes the *connection shape* when a
bound node goes — correct for an endpoint, catastrophic for an actor. Deleting the IAM role must not
delete the fact that one bucket copies to another.

#### Acceptance Criteria:

- [ ] The type string, props, validator and migrations are declared once under `src/shared/`, and the
      type-literal guard covers the new string — the same rule, one more type
- [ ] Registered on both halves from one declaration: `useSync`/`<Tldraw>`'s `bindingUtils` and the
      worker's `createTLSchema`, exactly as `connectionEndpoint` is
- [ ] **Deleting the actor node clears the attribution and leaves the connection**, asserted on the
      connection still existing with both endpoints intact. This is the criterion that separates the
      two binding types, and the one that fails if the endpoint util is copied
- [ ] Deleting the connection removes the attribution binding, leaving the actor node untouched
- [ ] **No binding survives pointing at a shape that no longer exists**, asserted by a sweep over all
      bindings after each case above — SPEC-005's rule, extended to the new type
- [ ] Attributing again **replaces** rather than accumulates, asserted by enumerating the bindings —
      the single-client case
- [ ] **Two actor bindings is a reachable state, and the rendering picks deterministically.** Nothing
      at the record level enforces uniqueness: two clients attributing concurrently each delete the
      old binding and create a new one with a fresh id, and sync is last-write-wins per record, so
      both survive. This is the same trap SPEC-006 hit with endpoint terminals and closed by
      resolving per terminal rather than by counting. The rule here is the **smallest binding id**,
      matching `merge.ts`'s representative rule and for the same reason: two clients must draw the
      same label without coordinating
- [ ] The client and worker carry the same migration sequence version, by the check
      `boundary.test.ts` already performs for the existing binding

### FR-002: Attributing, re-attributing and clearing

#### Description:

The gesture is on the connection, because that is the thing being described. Selecting a connection
offers "performed by", and picking a node attributes it.

#### Acceptance Criteria:

- [ ] With a connection selected, a control attributes it to a node, and the attribution appears for
      every client in the room
- [ ] Attributing to a **different** node replaces the attribution; the connection's shape id and its
      two endpoint bindings are unchanged throughout
- [ ] Clearing removes the attribution and leaves the connection and both endpoints
- [ ] **A connection may be attributed to one of its own endpoints**, and this is accepted rather
      than refused. "A writes to B, performed by A" is ordinary; refusing it would be the tool
      arguing with a true statement
- [ ] A connection cannot be attributed to another connection, or to a tldraw shape — only to a
      `diagramNode`, the same restriction the endpoint bindings carry
- [ ] Attributing is one undoable step, and undo restores the previous attribution rather than
      clearing it

### FR-003: How an attributed connection reads

#### Description:

The attribution has to be visible on the line, or it is data nobody can see. It also has to be
legible on a diagram where most lines are not attributed.

#### Acceptance Criteria:

- [ ] An attributed connection shows the **actor's current label** at its midpoint, derived from the
      actor node rather than copied — renaming the actor updates every line attributed to it, with no
      write to the connection
- [ ] The label is readable against the canvas and whatever it crosses, using the same halo technique
      the merge count uses — **asserted on the running page's computed style** in Chromium: `stroke`
      resolves to a real colour and `paint-order` is `stroke`. Named precisely because the merge badge
      shipped with an inert halo, and because the two obvious tests both fail — jsdom cannot resolve
      `var()` from a stylesheet, and a screenshot test was already weighed and rejected for this glyph
- [ ] An unattributed connection shows nothing; the attribution is information, not decoration
- [ ] **The actor label and SPEC-006's `×N` count do not collide.** Both want the midpoint, and a
      merged line whose members agree shows both. They stack rather than overlap, and a test asserts
      their boxes do not intersect — the same overlap assertion SPEC-007's launcher uses
- [ ] Selecting an attributed connection makes the relationship visible in both directions — the
      actor node is indicated while the connection is selected, so "who does this" is answerable
      without opening a panel
- [ ] The label does not intercept pointer events: it sits over the canvas, and a tap near it must
      still reach the line or whatever is behind it
- [ ] An attribution to a node hidden by **collapse** shows the stand-in container's label, not a
      name for something not on screen — `visibleStandInFor`, as endpoints already resolve
- [ ] An attribution to a node hidden by a **frame** does the same, which requires
      `frameAwareGetShape` and not the raw accessor. A separate criterion because the natural
      implementation passes the collapse half and silently fails this one — SPEC-008's whole finding
      was that collapse is read in two places and one consumer got the raw accessor. This label is a
      **third** consumer, and `frameView.ts` must be named in the file list for that reason

### FR-004: Merging, and what a merged line can honestly say

#### Description:

SPEC-006 merges several connections into one line when they become the same relationship. If they
disagree about who performs them, the merged line cannot claim any one of them.

The predecessor was **stricter**: `computeEffectiveGraph` drops the actor whenever more than one raw
edge contributes, without checking whether they agree. This spec is more permissive on purpose — a
merged line whose members all name the same actor can honestly say so — and the difference is called
out here rather than presented as a port, because this Description is where a builder resolving an
edge case would look.

#### Acceptance Criteria:

- [ ] A merged line whose members **all** attribute to the same node shows that actor
- [ ] A merged line whose members disagree — including "some attributed, some not" — shows **no**
      actor rather than picking one. Asserted directly, because picking the representative's actor is
      the natural implementation and it silently misattributes
- [ ] Expanding restores each line's own attribution
- [ ] The merge derivation stays **pure and Editor-free**: whatever it needs to know about actors is
      passed in, like the endpoints already are. `merge.ts` has no store access and this spec does not
      give it any

---

## Data Model

```ts
// src/shared/bindings/actor.ts -- one declaration, both runtimes.

export const ACTOR_BINDING_TYPE = 'connectionActor'

/**
 * Deliberately empty. The binding IS the fact: this connection is performed by
 * that node. `fromId` and `toId` carry everything, so there is nothing to store
 * and nothing to migrate later for the wrong reason.
 *
 * The endpoint binding needs `terminal` because a connection has two of them; an
 * attribution has one, which FR-001 asserts rather than assumes.
 */
export interface ActorBindingProps {}

declare module '@tldraw/tlschema' {
  interface TLGlobalBindingPropsMap {
    [ACTOR_BINDING_TYPE]: ActorBindingProps
  }
}
```

**No prop on the connection and no prop on the node.** An `actorId` on the connection would be a
second home for a fact the binding already holds — the failure `decisions.md` → *Store-native domain
state* exists to prevent, and the same reasoning SPEC-005 used to keep endpoint ids out of the
connection's props. An `isActor` on the node would be a stored form of a derivable one.

## API / Interface Contract

```ts
// src/client/bindings/ActorBindingUtil.ts
//
// NOT a copy of ConnectionBindingUtil. The endpoint util deletes the CONNECTION
// SHAPE when its bound node goes -- correct for an endpoint, catastrophic here:
// deleting the IAM role would delete the fact that one bucket copies to another.
// This util lets tldraw's own cleanup remove the binding and does nothing else,
// which is why FR-001's third criterion exists.
class ActorBindingUtil extends BindingUtil<ActorBinding> {
  static type = ACTOR_BINDING_TYPE
  // No onBeforeDeleteToShape. The absence is the behaviour.
}

// src/shared/shapes/merge.ts -- extended, and still Editor-free.
//
// `mergeIndex.ts` is the only place ConnectionEndpoints is built, and its
// `sameEntry` is the isEqual of a computed: adding actorId to MergeEntry without
// adding it there makes re-attribution invisible.
//
// `ConnectionEndpoints` gains `actorId: string | null`, so the derivation can
// answer FR-004 without reaching for a store it deliberately cannot see. The
// merged entry gains `actorId: string | null`, null when the members disagree.
export interface ConnectionEndpoints {
  connectionId: string
  startNodeId: string | null
  endNodeId: string | null
  actorId: string | null
}
```

**The actor label resolves through the same stand-in walk endpoints use.** An actor inside a
collapsed container is not on screen, and naming it would be naming something invisible;
`visibleStandInFor` already answers "what is on screen in its place" and FR-003's last criterion is
that this reuses it rather than growing a second answer.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/
│   ├── bindings/
│   │   ├── actor.ts               # NEW -- type, props, validator, migrations
│   │   └── actor.test.ts          # NEW
│   ├── shapes/
│   │   ├── merge.ts               # + actorId in and out of the derivation
│   │   ├── merge.test.ts          # + the disagreement cases
│   │   ├── index.ts               # + the registry entry
│   │   └── shared-imports.test.ts # the guard covers one more type string
├── client/
│   ├── mergeIndex.ts                  # the ONLY constructor of ConnectionEndpoints; and its
│   │                                  #   `sameEntry` must gain actorId, or re-attributing
│   │                                  #   produces an index the memo calls unchanged and the
│   │                                  #   label never updates, with no error
│   ├── frameView.ts                   # the frame-aware accessor the label must resolve through
│   ├── bindings/ActorBindingUtil.ts   # NEW -- and NOT a copy of the endpoint util
│   ├── shapes/
│   │   ├── ConnectionShapeUtil.tsx    # the actor label, stacked clear of the x-N count
│   │   └── registry.ts                # + the binding util
│   └── panels/ActorControl.tsx        # NEW -- attribute, re-attribute, clear
└── worker/schema.ts                   # + the binding schema
e2e/
└── actors.spec.ts                     # NEW
```

## Implementation Phases

### Phase 1: The binding
- `src/shared/bindings/actor.ts`, the registry, both registration halves, the guard extension
- `ActorBindingUtil` — written from the spec, not copied from the endpoint util
- FR-001's lifecycle criteria, including the sweep for dangling bindings

### Phase 2: Attribution and rendering
- The control: attribute, re-attribute, clear, one undoable step each
- The midpoint label, derived from the actor's current label, resolved through the stand-in walk
- The halo, with a test that it is actually painted

### Phase 3: Merging
- `ConnectionEndpoints.actorId` through the derivation; the disagreement rule
- Unit tests for all-agree, disagree, and some-attributed-some-not, with no Editor

### Phase 4: Proof
- `e2e/actors.spec.ts` across FR-001 through FR-004, including two clients, the concurrent
  double-attribution state, and the label's computed halo
