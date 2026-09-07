# Spec: Actors on a merged edge

**ID:** SPEC-015  
**Status:** Draft  
**Last Updated:** 2026-09-07  
**Depends On:** SPEC-006, SPEC-011, SPEC-014

## Overview

Collapse a container and several connections become one line. SPEC-011 made that line show an actor
only when its members agree, and nothing when they disagree — a defensible way to avoid claiming one
of them, and the wrong outcome. **The whole point of folding a container is to see what crosses its
boundary**, and who does the crossing is most of that.

So: show them all. Icons, not names, because a merged edge can stand for five connections and five
names on one line is a wall of text where five icons is a glance.

This reverses SPEC-011 FR-004's second criterion, deliberately and on the user's decision
(2026-09-07). It does not touch what an attribution IS, or what the document records — SPEC-012
already carries each connection's own attribution, and this spec is the reason that is obviously
right rather than a quirk.

## Scope

### In Scope

- A merged line showing the **distinct** actors of its members, as icons
- **First two, then `+N more`** (settled 2026-09-07) — the cap that keeps a busy edge readable
- The superseded marker on SPEC-011's criterion, its delivery doc, and anywhere else that states the
  old rule

### Out of Scope

- **Names.** SPEC-011 rendered the actor's label and that stays for an unmerged line, where there is
  exactly one and the name is the more precise thing. This spec is about the many case.
- **Which actor a merged line "really" has.** There is no such thing; that was the mistake.
- **Expanding the list in place.** `+N more` is a count, not a control. Expand the container to see
  them all — the diagram already has that gesture and inventing a second one for a hover-out on an
  iPad is a worse answer.
- **Ordering by importance.** Actors sort by the same total order everything else does.

---

## Functional Requirements

### FR-001: The derivation carries a set, not an answer

#### Description:

`MergeEntry.actorId: string | null` says "the one actor, or none". That shape cannot express the
thing this spec exists to show, and leaving it while adding a second field beside it would leave two
sources for one fact.

It becomes `actorIds: string[]` — every distinct actor among the members, in a deterministic order.
An unmerged line has zero or one, so the same field serves both and there is no branch.

#### Acceptance Criteria:

- [ ] `MergeEntry.actorId` is **replaced** by `actorIds: string[]`, not joined by it
- [ ] Distinct: two members attributed to the same node contribute one entry
- [ ] **Ordered deterministically**, by the same plain `<` on id that `merge.ts` already breaks ties
      with — two clients must draw the same line without coordinating, and `Set` iteration order is
      insertion order, which is store order, which is exactly what differs between them
- [ ] An unmerged connection's entry is `[]` or `[its actor]`
- [ ] "Some attributed, some not" yields the actors that exist — **not** `[]`. That was the old rule
      and it is the one being reversed
- [ ] The derivation stays pure and Editor-free; `mergeIndex.ts` remains the only place the set is
      built from bindings
- [ ] **`sameEntry` compares the array by content**, or re-attributing produces an index the memo
      calls unchanged and nothing re-renders. SPEC-011 shipped this bug's twin and it took nine e2e
      tests to catch; the same trap, one field along

### FR-002: What the line shows

#### Description:

Icons at the midpoint, stacked clear of the `×N` count, capped.

#### Acceptance Criteria:

- [ ] A merged line whose members name **one** actor shows that one icon
- [ ] A merged line whose members name **three** shows three icons
- [ ] **Five shows two icons and `+3 more`** — the cap, asserted on the count in the text so an
      off-by-one is visible
- [ ] Each icon resolves through SPEC-014's `resolveNodeIcon`, so an actor with a pinned icon shows
      it and one without shows its guess — one rule, three consumers, no re-implementation
- [ ] An actor pinned to `'none'` contributes **no icon but still counts** toward `+N more`; it is a
      resource crossing the boundary whether or not it has a glyph
- [ ] The icons do not overlap the `×N` count, asserted on box intersection
- [ ] They do not intercept pointer events — a tap near them reaches the line
- [ ] Each icon carries the actor's **name** as its accessible name. The glyph is the visual channel;
      the name is the one a screen reader has, and "which resources cross this boundary" has to be
      answerable without seeing it
- [ ] An **unmerged** attributed connection is unchanged: it still shows the actor's name, as
      SPEC-011 delivered

### FR-003: The reversal is recorded where the old rule is stated

#### Description:

SPEC-011's criterion, its delivery doc and its commit message all state the old rule as a deliberate
choice with reasoning. A reader finding one of them later must not conclude this spec is a bug.

#### Acceptance Criteria:

- [ ] SPEC-011's FR-004 criterion carries an in-place **superseded** marker naming this spec and the
      date, per `CLAUDE.md`'s completion ritual
- [ ] `docs/spec-delivery/SPEC-011-actors-on-connections.md` carries the same marker
- [ ] The reversal gets an entry in `docs/decisions.md` with a row in its `## Contents`, and one line
      in `CLAUDE.md`'s Key Decisions — a merged line showing every actor rather than none is a
      standing rule about what a derived view may claim, not a rendering detail
- [ ] `merge.test.ts`'s disagreement tests are **rewritten, not deleted** — the cases stay, the
      expectation reverses. Deleting them would remove the only place the old behaviour is described

---

## Data Model

```ts
// src/shared/shapes/merge.ts
export interface MergeEntry {
  hidden: boolean
  startNodeId: string | null
  endNodeId: string | null
  count: number
  /** Every distinct actor among the members, ordered by id under plain `<`. */
  actorIds: string[]
}
```

**No new record, no new binding, no shape prop, no migration.** SPEC-011's binding and SPEC-014's
icon already exist; this changes a derived view and what it draws.

## API / Interface Contract

```ts
// The cap lives with the rendering, not the derivation: the derivation's job is
// to say WHAT the line stands for, and how many fit is a question about a
// canvas. A derivation that truncated would make the JSON export's own decision
// for it -- and SPEC-012 deliberately exports every connection's attribution.
export const MAX_ACTOR_ICONS = 2
```

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/shapes/
│   ├── merge.ts                     # actorIds replaces actorId
│   └── merge.test.ts                # the disagreement cases, expectations reversed
└── client/
    ├── mergeIndex.ts                # builds the set; sameEntry compares by content
    └── shapes/ConnectionShapeUtil.tsx
docs/
├── specs/SPEC-011-actors-on-connections.md      # superseded marker
├── spec-delivery/SPEC-011-actors-on-connections.md
├── decisions.md                                  # the entry + its Contents row
└── ../CLAUDE.md                                  # one line in Key Decisions
e2e/
└── actors.spec.ts                   # the merged-edge cases, rewritten
```

## Implementation Phases

### Phase 1: The set
- `actorIds` through the derivation, `sameEntry`, and `merge.test.ts` rewritten
- Pure and provable with no Editor before anything renders

### Phase 2: The rendering
- Icons at the midpoint, the cap, the accessible names, the overlap assertion

### Phase 3: The record
- The superseded markers, the decisions entry, the Key Decisions line
