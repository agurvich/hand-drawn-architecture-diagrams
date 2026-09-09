# Spec: Edge kinds

**ID:** SPEC-018  
**Status:** In Progress  
**Last Updated:** 2026-09-08  
**Depends On:** SPEC-005, SPEC-006, SPEC-010, SPEC-011, SPEC-015, SPEC-016, SPEC-017

## Overview

Drawing on the iPad for the first time, the project owner typed his edges with colour without being
asked to: orange for data movement, light-green for permission, black for structure and sequence. The
app has no concept of an edge kind — he invented one because he needed one, and the colours are
inert marks on strokes the tool throws away. This spec gives a connection a **set of kinds**, so that
one line can say "this is a data transfer *and* a step in the sequence" rather than the diagram
growing a second layer of edges to say it. The kinds are settable from the properties panel, and are
inferred from the colour of the pencil stroke that drew the connection — the gesture he already
made, for the strokes the recogniser converts. Seven of his 276 strokes are coloured and three of
them become connections; the other four are not connections at all, so the inference reaches what it
can reach, and FR-004 freezes that boundary rather than widening it.

The choice of a set on one edge, rather than parallel edge sets, was put to him and answered
(`docs/handoff/2026-09-08-ipad-findings.md` §4, question 2). Its accepted cost is stated there and
restated here so this spec does not rediscover it: **one edge has one pair of endpoints, so a
step whose endpoints differ from the transfer's cannot be expressed.** That is the price of not
drawing a third layer, and he chose it.

## Scope

### In Scope

- A `kinds` prop on the connection shape, with a closed vocabulary of three — data, permission,
  sequence — a migration, and a normal form so two clients agree on what a line says.
- Drawing them: one coloured stroke per kind, and the kinds in the line's accessible name.
- Setting them: a field in the SPEC-016 properties panel.
- Inferring them: the colour of the stroke that became the connection picks its kind.
- Carrying them across a fold: a merged edge shows every kind its members name.
- **Answering** the deferred edge-sets question. `decisions.md` → *Secondary features deferred
  pending real use* defers five features in one entry, and its digest sits in `CLAUDE.md` → Key
  Decisions → *Scope* — not in `## Out of Scope`, which is where the handoff misplaces it. Only the
  **edge-sets** clause is answered here, and it is answered by being **declined**: one edge carrying
  several kinds instead of lens-scoped parallel edges. The other four stay deferred, so the entry is
  amended rather than retired. `architecture.md` → *Deferred / Non-goals* states the same claim with
  its own seam — "a `Connection` gains a set-membership prop" — and gets its own superseded marker.

### Out of Scope

- **The JSON document.** `kinds` neither export nor import here; a document imported at v3 produces
  connections with no kinds, and a kinded connection exports exactly as it does today. This is the
  same seam SPEC-011 → SPEC-012 was cut along (the feature on the canvas, then the feature in the
  document, with the version bump and a frozen corpus of the previous version), and it is taken
  again deliberately rather than by running out of room. Recorded as the next entry in the *iPad
  readiness* arc.
- **Parallel edge sets.** Settled above; a diagram gets one edge with several kinds, not several
  edges.
- **Filtering the canvas by kind** — "show only the data flow". A lens over kinds is a scene-shaped
  feature and wants scenes' machinery, not this spec's.
- **A user-defined vocabulary.** Three named kinds, in code. A user-authored kind is a document
  question before it is a canvas one.
- **Native tldraw arrows.** They are still not connections (handoff F3) and gain nothing here.
- **Kind on anything but a connection.** A node is not typed by colour; he used colour on edges only.

---

## Functional Requirements

### FR-001: A connection carries a set of kinds

#### Description:

The connection shape gains `kinds`, a set drawn from a closed, exported vocabulary of three:
`data`, `permission`, `sequence`. Every existing connection has none, and a connection with none
behaves exactly as one does today.

The set is stored in a **normal form** — deduplicated, and in an order that does not depend on the
order it was assembled in. Two clients must draw the same line without coordinating, and insertion
order is store order, which is exactly what differs between them (the rule `merge.ts`'s
`distinctActors` already follows).

The record **validator is structural** — an array of strings — and is deliberately not closed
against the vocabulary. A validator that rejected an unknown kind would turn a kind added by a newer
build into a record rejected at the room boundary, which is the failure mode `CLAUDE.md` names for
shape-prop changes. The `icon` prop is the precedent: `T.string`, with `resolveNodeIcon` handling a
key it does not know.

#### Acceptance Criteria:

- [ ] A connection created by the connection tool, or by importing a document, has `kinds: []`.
      (The sketch path is FR-004's, and a coloured stroke there does NOT produce an empty set —
      listing it here would make the two requirements contradict.)
- [ ] Re-aiming an endpoint leaves `kinds` unchanged. `onHandleDragEnd` updates a binding and creates
      no connection, so this is a preservation criterion, not a creation one.
- [ ] A **persisted** connection record from before this change loads through the migration and reads
      `kinds: []`. Asserted against a stored pre-migration record, not by creating a fresh shape,
      which exercises the default rather than the migration.
- [ ] The migration's `down` removes the prop, so the sequence is reversible.
- [ ] Normalising the same three kinds supplied in three different orders yields three identical
      arrays; normalising a list containing a duplicate yields one entry for it.
- [ ] A connection record whose `kinds` contains a string outside the vocabulary is **accepted** by
      the schema, and the renderer draws nothing for it — asserted in both halves, because the
      acceptance is the deliberate part.
- [ ] Two connections created in one batch do not share one `kinds` array: mutating one connection's
      kinds leaves the other's unchanged.

### FR-002: The canvas draws every kind on the line

#### Description:

A kinded line is drawn as one stroke per kind, in that kind's colour, parallel and centred on the
line's own geometry. A line with no kinds is drawn exactly as it is today — one stroke in
`currentColor` — so nothing about the existing appearance changes for a diagram that has not used
this feature.

Colour is the glance, not the only channel: the kinds are named in the line's accessible name, for
the same reason SPEC-015's actor icons carry `aria-label` rather than relying on the glyph.

Every kind's colour is a CSS custom property — the first this app defines for itself; `index.css`
today only consumes tldraw's `--tl-*` and the JS-set `--dock-top`. Handoff F6 says custom shapes
ignore the dark theme; this spec does not fix that, and it does not add a new site that will have to
be found when someone does.

**These criteria are settled in e2e, not in jsdom.** Nothing in this repo mounts a `ShapeUtil`'s
`component()` or a panel field under Testing Library; every connection-rendering assertion that
exists is Playwright. That is where a computed colour can be read at all.

#### Acceptance Criteria:

- [ ] `kinds: []` renders exactly one stroke, asserted by a **new** check. The existing SPEC-005 /
      SPEC-011 / SPEC-015 specs must also still pass, but that half is weak evidence and is not the
      criterion: none of them asserts on the line element, its stroke or its marker at all — they
      assert count badges, actor labels and the dim/highlight classes.
- [ ] `kinds: ['data']` renders one stroke, and its colour is the data colour rather than the
      default.
- [ ] `kinds: ['data', 'permission']` renders two strokes, one in each kind's colour, neither of them
      the default colour.
- [ ] Each drawn stroke ends in an arrowhead **of its own colour**. A `<marker>`'s `currentColor`
      resolves against the marker's own inherited colour, not the referencing line's, so one shared
      marker yields coloured lines with default-coloured arrowheads — the failure this criterion
      exists to catch, and it is reproducible: two lines and one shared marker give two arrowheads
      in the default colour. Asserted **in e2e on the arrowhead's computed fill**, which is the
      strictly stronger form. This repo has no jsdom test that mounts a connection's component, so
      there is no unit-test home to weaken this criterion into.
- [ ] The connection's accessible name names each of its kinds; a connection with no kinds gains no
      such text.
- [ ] No colour literal for a kind appears in the component — each is a CSS custom property with one
      definition site.
- [ ] Geometry and hit-testing are untouched: `getGeometry` returns the same single edge for a
      three-kind connection as for an unkinded one, and a click on the centre of a three-kind line
      selects it.

### FR-003: The properties panel sets a connection's kinds

#### Description:

The SPEC-016 panel gains a field for a selected connection, below the actor field: one control per
vocabulary entry, each showing whether the connection carries that kind, each toggling it
independently.

On a **merged** line the controls are read-only. A merged line stands for several connections, so a
toggle could only write to one arbitrary member — the same reason `getHandles` withdraws the drag
handles on a merged line rather than picking a member to re-aim.

#### Acceptance Criteria:

- [ ] Selecting a connection shows one control per kind, each reflecting whether the connection
      carries it.
- [ ] Toggling a kind on adds exactly that kind; toggling it off removes exactly that kind; in
      neither case do the other kinds change.
- [ ] Toggling a kind is a single undo step, and one undo restores the previous set exactly.
- [ ] On a line whose merge count is greater than one, every control is disabled and the panel says
      why in text a reader can act on.
- [ ] A kind toggled on one client is visible on a second client in the same room (e2e).
- [ ] The controls are reachable and operable by keyboard, and each has an accessible name naming
      its kind.

### FR-004: A coloured stroke becomes a kinded connection

#### Description:

When a stroke becomes a connection, the colour it was drawn in picks its kind: **orange → data**,
**light-green → permission**. Every other colour — black included — gives a connection with no
kinds.

Black is excluded deliberately, and it is the one part of this that departs from his stated mapping
("black for structure and sequence"). Black is the default pen, so a black stroke records no
decision; if black meant `sequence`, every connection ever sketched would claim to be a step in a
sequence, and the sketch path would have no way to draw one that claims nothing. It stays reachable
by other routes — the connection tool, and toggling the kind off in the panel — so the cost of the
other choice is a wrong default, not an unreachable state.

**This one is the spec's call, not his**, unlike the three decisions recorded in handoff §4. It is
reversible in one line of `kindForStrokeColour`, and Phase 6 carries it into the `decisions.md`
entry so the next session can find it rather than rediscover it.

The map is a pure function beside `shouldConnect` in `convertPolicy.ts`, so it is replayable against
the recorded corpus with no editor — which is what lets the criterion below be measured rather than
asserted.

#### Acceptance Criteria:

- [ ] Replaying all 276 recorded strokes with the twelve labelled rectangles as nodes: the three that
      convert gain exactly the kind their colour names — stroke 80 → data, 188 → data, 259 →
      permission — and no other stroke gains any kind.
- [ ] Which strokes convert is **unchanged** by this FR: SPEC-017's assertion that the converting set
      is exactly `ARROWS` passes with no edit.
- [ ] A stroke that DOES convert but was drawn in a colour outside the map produces `kinds: []`.
      No such stroke exists in the corpus — every stroke that converts there is coloured — so this
      is asserted on a constructed case rather than on the replay, and the replay cannot tick it.
- [ ] Every key of the colour map is a real tldraw default colour name, checked against tldraw's own
      exported colour list. This is the criterion that catches `lightgreen` for `light-green` — a
      typo that no test of the map's own behaviour can see, because the map answers "no kind" for an
      unknown key by design.
- [ ] e2e: a stroke drawn in orange between two nodes, with sketch mode on, produces a connection
      carrying the data kind; the same stroke in black produces one carrying none.

### FR-005: A merged edge carries every kind its members name

#### Description:

Folding a container merges the connections crossing its boundary into one line. That line carries
**every distinct kind** among its members, by the decision already settled for actors: *a folded view
shows every answer, never none*. Showing the representative's kinds would silently mislabel the rest;
showing none would hide the thing folding exists to reveal.

An unmerged line's entry carries its own connection's kinds, so one field serves both cases and the
renderer has no branch — the shape `MergeEntry.actorIds` already takes.

#### Acceptance Criteria:

- [ ] `MergeEntry` carries `kinds`, and for an unmerged connection it equals that connection's own
      normalised kinds.
- [ ] A merged line whose members carry `data` and `permission` respectively carries both.
- [ ] A kind carried by two members appears once on the merged line.
- [ ] The merged order does not depend on member order: permuting the input connections yields an
      identical `kinds` array.
- [ ] Expanding the container restores each member line to its own kinds.
- [ ] A merged line renders its kinds by the same rule as an unmerged one — the renderer reads the
      merge index, not the shape's props, so the two cannot disagree.
- [ ] **A change to kinds alone yields an index the memo reports as CHANGED.** `mergeIndex.ts`'s
      `sameEntry` is the `isEqual` of the `computed`; a field the derivation produces and the
      comparator ignores is a field whose changes are invisible, and every `computeMergeIndex` unit
      test still passes while nothing on screen ever repaints. Asserted directly against `sameEntry`,
      by content and not by array identity.

---

## Data Model

```ts
// src/shared/shapes/connection.ts

export const EDGE_KINDS = ['data', 'permission', 'sequence'] as const
export type EdgeKind = (typeof EDGE_KINDS)[number]

export interface ConnectionShapeProps {
  start: { x: number; y: number }
  end: { x: number; y: number }
  /**
   * Added at v1 by the migration below. Normalised: deduplicated and ordered by
   * plain `<`, never by insertion. Typed `string[]` rather than `EdgeKind[]`
   * because the validator is structural -- see FR-001.
   */
  kinds: string[]
}

/** Deduplicated, ordered by plain `<`. Unknown strings survive; the renderer ignores them. */
export function normaliseKinds(kinds: readonly string[]): string[]
```

**Hazard, stated because it is invisible and shared.** `connectionShapeDefaultProps` is spread
(`{ ...connectionShapeDefaultProps }`) at exactly two creation sites — `ConnectionShapeUtil`'s
`getDefaultProps` and `document.ts`'s `fromDocument`. A spread is shallow, so every connection would
share one `kinds` array. `start` and `end` are already shared this way and it has never mattered,
because nothing mutates them in place; an array is different only because an implementer will
reasonably write `props.kinds.push(...)`. FR-001's last criterion is the test for it.
(`document.test.ts` also names the default, but as an argument to `toEqual` — nothing is created
there and there is nothing to fix.)

```ts
// src/shared/shapes/merge.ts
export interface MergeEntry {
  hidden: boolean
  actorIds: string[]
  /** Every distinct kind among the members, in normal form. One entry's worth for an unmerged line. */
  kinds: string[]
  startNodeId: string | null
  endNodeId: string | null
  count: number
}

export interface ConnectionEndpoints {
  connectionId: string
  startNodeId: string | null
  endNodeId: string | null
  actorId: string | null
  /** Passed in, like `actorId`: this module has no store access. */
  kinds: readonly string[]
}
```

```ts
// src/client/sketch/convertPolicy.ts

/** The kind a stroke's colour asks for, or null for "no kind" -- which includes black. */
export function kindForStrokeColour(colour: string): EdgeKind | null
```

---

## API / Interface Contract

```tsx
// src/client/panels/fields/KindField.tsx
;<KindField editor={editor} id={connectionId} />
```

Mounted by `SelectionPanel` under `ActorField`, on `subject.kind === 'connection'`, taking the same
`{ editor, id }` props every other field takes.

---

## Configuration / Environment

None.

---

## File & Folder Structure

```
src/
├── shared/
│   └── shapes/
│       ├── connection.ts        # EDGE_KINDS, EdgeKind, kinds prop, migration, normaliseKinds
│       └── merge.ts             # MergeEntry.kinds, ConnectionEndpoints.kinds
└── client/
    ├── index.css                # --edge-kind-* custom properties
    ├── mergeIndex.ts            # reads props.kinds into ConnectionEndpoints
    ├── panels/
    │   ├── SelectionPanel.tsx   # mounts KindField
    │   └── fields/
    │       └── KindField.tsx    # new
    ├── shapes/
    │   └── ConnectionShapeUtil.tsx   # one stroke per kind, arrowhead per kind, accessible name
    └── sketch/
        ├── convertPolicy.ts     # kindForStrokeColour
        └── recogniseOnDraw.ts   # passes the stroke's colour through
```

---

## Implementation Phases

### Phase 1: The prop and its normal form

- `EDGE_KINDS`, `EdgeKind`, `normaliseKinds` in `connection.ts`.
- The `kinds` prop, its structural validator, its default, and the `AddKinds` migration —
  `connectionVersions` and the migration sequence are both empty today, so this is the shape's first.
- Fix the shared-default hazard at all three spread sites.
- Unit tests for FR-001, including the persisted-record fixture and the unknown-kind acceptance.

### Phase 2: The merged view

- `ConnectionEndpoints.kinds` and `MergeEntry.kinds`; the union in `computeMergeIndex`, ordered by
  the rule `distinctActors` already uses.
- `mergeIndex.ts` reads `props.kinds` when it builds `ConnectionEndpoints`.
- FR-005's unit tests, including the permutation criterion.

### Phase 3: The canvas

- One stroke per kind, one arrowhead per kind, read from the merge index.
- `--edge-kind-*` custom properties in `index.css`.
- The accessible name.
- FR-002's tests, including that the existing connection-rendering suites are untouched.

### Phase 4: The panel field

- `KindField`, mounted under `ActorField`; disabled on a merged line with a reason.
- FR-003's unit tests and the two-client e2e.

### Phase 5: The stroke colour

- `kindForStrokeColour` beside `shouldConnect`; `convertStroke` passes the draw shape's colour and
  writes the resulting kinds.
- FR-004's corpus replay in `convertPolicy.test.ts`, and the e2e pen-colour case.

### Phase 6: Completion

- The `decisions.md` entry for edge kinds, including the black-stroke call FR-004 makes.
- **Amend** `decisions.md` → *Secondary features deferred pending real use*: the edge-sets clause is
  answered (declined in favour of kinds on one edge); the other four features stay deferred. A
  superseded marker goes at every site still stating the old claim — `CLAUDE.md` → Key Decisions →
  *Scope* and `architecture.md` → *Deferred / Non-goals* — and the digest line is rewritten to cover
  only what is still deferred. If the entry's heading changes, its `## Contents` row and the digest
  label move with it, or docs-lint fails on a dead anchor.
- Delivery doc, INDEX row, component-inventory rows, and the arc entry naming the document spec that
  follows.
