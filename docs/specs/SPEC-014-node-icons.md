# Spec: An icon on every node

**ID:** SPEC-014  
**Status:** Completed  
**Last Updated:** 2026-09-07 (rev 2 — built)  
**Depends On:** SPEC-004, SPEC-007, SPEC-012

## Overview

Every node gets an icon, and you should almost never have to choose it. Type "Postgres" and the node
becomes a database; type "IAM role" and it becomes a key. Pick a different one when the guess is
wrong, or turn it off for that node.

This is a port, not an invention. The predecessor matched icons from a node's label with a
hand-authored keyword table — no model call, 81 ordered rules, most specific first — and that table
is the valuable part: it encodes what the words in an architecture diagram actually mean. What does
not port is its icon artwork, which came from a dependency this project does not have.

The immediate reason to build it now is SPEC-015: a merged edge should show **which resources** cross
a boundary, and an icon is what makes several of them legible on one line where several names are not.

## Scope

### In Scope

- An `icon` prop on the node, **three-state**: a pinned key, an explicit "none", or unset
- **Automatic matching** from the label, ported from the predecessor's rule table
- **Two icon sets**: a general one, and the real AWS architecture icons
- An icon **picker**, and a way to clear back to automatic
- The icon rendered on the node
- `icon` carried in the JSON document, at **version 3** — the same version SPEC-012 introduces

### Out of Scope

- **Icons on anything but a node.** Connections and scenes do not have them.
- **Custom or uploaded icons.** A fixed set, chosen here.
- **Matching on anything but the label.** The predecessor also searched a `metadata` map; this app
  has no such field, and inventing one to feed the matcher would be building a feature to justify a
  port.
- **SPEC-015's merged-edge rendering.** This spec makes a node have an icon; showing several actors'
  icons on one line is the next spec, and the arc records the order.

---

## Functional Requirements

### FR-001: The prop, its three states, and its migration

#### Description:

The three states are the whole design, and they are not the same as "a string or nothing":

| value | meaning |
| --- | --- |
| a key | **pinned.** This icon, whatever the label says. |
| `'none'` | **pinned to nothing.** No icon on this node, deliberately. |
| `''` (unset) | **automatic.** Guessed live from the label, so renaming updates it. |

Automatic is not a value that gets written once at creation — it is the *absence* of a decision, and
it re-resolves on every render. A node created as "DB" and renamed to "Queue" changes icon; one whose
icon was picked by hand does not.

**tldraw props cannot be `undefined`** the way the predecessor's field was — a shape prop is
validated and persisted, and `T.optional` on a required record is a different thing from absent. The
empty string is the sentinel for automatic, and `'none'` for explicitly-off, so the prop is always a
string and the validator stays total.

#### Acceptance Criteria:

- [ ] `icon: T.string` on the node, defaulting to `''`, **with a migration** — rooms persist, and a
      prop added without one corrupts documents that already exist, quietly. It defaults existing
      nodes to `''`, which means those nodes gain an automatic icon, which is the intended outcome
- [ ] `resolveNodeIcon(icon, label)` is a pure function in `src/shared/`, returning an icon key or
      null, with the three states above, tested with no Editor
- [ ] A node whose icon is unset and whose label changes resolves to a **different** icon, asserted
      end to end — that is the behaviour the three-state design exists for, and the one a
      write-once-at-creation implementation silently loses
- [ ] A node with a pinned icon does **not** change when renamed
- [ ] A node pinned to `'none'` renders no icon, and is distinguishable from unset in the record

### FR-002: Automatic matching, ported

#### Description:

The predecessor's algorithm, kept: an ordered table of rules, first match wins; a single-word
alternative matches as a **whole word** with simple plural handling either way, so "car" does not
match "carpet"; a multi-word alternative matches as a substring, because a real phrase is not at risk
of hiding inside another word.

**Amended in build (2026-09-07):** "first match wins" is now *first match in two passes* — an exact
whole-word pass over the whole table, then the plural-tolerant one. Plural handling runs in both
directions, so a single pass cannot tell `user` from `users` and whichever rule sits first takes
both; the port put `users` first, so a node called "User" got the plural icon forever. Order still
decides within a pass, which is what the load-bearing part of the table means.

The rule table itself is the asset. It is ported as data, and its ordering is load-bearing — specific
terms before catch-alls.

#### Acceptance Criteria:

- [ ] The matcher and its rules live in `src/shared/`, import nothing, and are unit-tested
- [ ] **Whole-word matching, both plural directions**, with a test that "carpet" does not match a
      "car" rule and that "buckets" matches a "bucket" rule
- [ ] **Rule ORDER decides ties**, asserted by a label matching two rules and resolving to the
      earlier one — the property that breaks silently when a rule is appended in the wrong place
- [ ] A **label corpus** drives the tests: at least forty real node labels with their expected icon,
      covering compute, data, networking, messaging, security, clients and CI/CD, **and the AWS
      services that have their own icon**. Not a handful of obvious cases — the ported table has 81
      rules and a test touching six of them is not evidence
- [ ] Every `iconKey` any rule can produce **exists in the icon set**, asserted by iterating the
      rules rather than by inspection. A rule pointing at a missing icon renders nothing and looks
      like the matcher failing
- [ ] An unmatched label resolves to a stated fallback, and the fallback is a real icon

### FR-003: Two icon sets

#### Description:

**Lucide for the general set** (`lucide-react`, ISC) — a clean, consistent line set, tree-shakeable,
no runtime dependencies.

**The real AWS architecture icons for AWS services**, because a diagram of an AWS system drawn with
generic glyphs is a diagram of a different system. An S3 bucket should look like an S3 bucket.

**The keys are NAMESPACED** — `aws:s3` against `database` — so the two sets cannot collide, a rule
can name either, and the document records which set it meant. An un-namespaced key would make the
sets one flat space that silently fights over `lambda`.

**On terms:** the npm packages that ship AWS icons are MIT wrappers around AWS's own artwork, which
is governed by AWS's asset terms — those permit architecture diagrams, which is what this is. It goes
in `decisions.md` beside the tldraw licence, which is already fenced to **deployment rather than
development**. That fence is the mechanism; it re-asks the question at the only moment it matters,
and until then this is not a decision anybody has to make.

#### Acceptance Criteria:

- [ ] Both dependencies are recorded in `CLAUDE.md` → *Tech Stack* in the same commit that adds them
- [ ] The icon artwork's terms get **one line** in `decisions.md`, beside the tldraw licence and
      fenced the same way — buildable now, re-asked before any deploy
- [ ] Icon keys are **namespaced**, and a test asserts no key appears in both sets
- [ ] A registry maps every key to its artwork, in `src/client/` — icons are rendering, and
      `src/shared/` stays runtime-agnostic. Only the **keys** are shared, because the matcher and the
      document both name them. **Built as two maps behind accessors** (`generalIcon`, `awsIconSvg`,
      `hasIcon`) rather than the single `ICONS: Record<string, ComponentType>` sketched below: the
      two sets are not the same kind of thing — Lucide gives components, the AWS set is vendored SVG
      — and one map would have to hold a union every caller then re-narrows
- [ ] The registry and the rule table cannot drift: a test asserts every rule's key is in the
      registry **and** that every registry key is reachable — an icon nothing can select is dead
      weight, and a rule nothing can render is a bug
- [ ] **A label naming an AWS service resolves to the AWS icon, not the generic one.** "S3" is a
      bucket, not a generic storage glyph; "Lambda" is Lambda, not a generic function glyph. That is
      the whole reason for the second set, and it falls out of rule ORDER — the AWS rules sit above
      the generic ones, and a test asserts exactly that for a handful of services

### FR-004: Choosing one by hand

#### Description:

The guess is right often, not always. Picking is a small surface and it has to work on an iPad.

#### Acceptance Criteria:

- [ ] With one node selected, a control shows the current icon and opens a picker
- [ ] The picker lists every icon in the set, each with an accessible name — a grid of unlabelled
      glyphs is unusable by anyone not using their eyes
- [ ] Choosing one pins it; a "back to automatic" choice clears to `''`; a "no icon" choice pins
      `'none'`. The three states are all reachable from the surface, or two of them are unreachable
      states the record can hold and nobody can produce
- [ ] Every target is at least 44×44, the control is keyboard reachable, and it does not overlap
      tldraw's own UI or this app's other panels — asserted on **overlap**, as every panel since
      SPEC-007 is
- [ ] Pinning is one undoable step

### FR-005: The icon on the node, and in the document

#### Description:

Rendering, and the format. `icon` joins the node at **version 3** — the version SPEC-012 introduces,
which has not shipped, so this is one bump carrying two fields rather than two bumps.

#### Acceptance Criteria:

- [ ] The icon renders on the node beside its label, and does not intercept pointer events
- [ ] It is `aria-hidden`: the node's accessible name is its label, and an icon that announces
      "database" beside a node called "Postgres" is noise
- [ ] A collapsed node still shows its icon — collapse hides children, not identity
- [ ] `icon` is exported when **pinned**, and omitted when automatic. An exported document carries
      decisions, not derivations — writing the guessed key would freeze it, so a renamed node would
      keep the old icon after a round trip
- [ ] `'none'` **is** exported, because it is a decision
- [ ] An unknown icon key in an imported document is rejected with its path, naming the key
- [ ] A round trip is exact for all three states, asserted on the record

---

## Data Model

```ts
// src/shared/shapes/node.ts
export interface NodeShapeProps {
  // ...
  /** '' = automatic, 'none' = deliberately no icon, otherwise a key in ICON_KEYS. */
  icon: string
}

// src/shared/icons/match.ts -- pure, imports nothing.
export const FALLBACK_ICON_KEY: string
export interface IconMatchRule { pattern: string; iconKey: string }
export const ICON_MATCH_RULES: readonly IconMatchRule[]
export function guessIconKey(label: string): string
export function resolveNodeIcon(icon: string, label: string): string | null
```

```ts
// src/client/icons/registry.tsx -- the artwork. Keys shared, components not.
// Two maps, because the two sets are not the same kind of thing.
export const GENERAL_ICON_KEYS: readonly string[]
export const AWS_ICON_KEYS: readonly string[]
export const DRAWABLE_ICON_KEYS: readonly string[]
export function generalIcon(key: string): ComponentType<{ size?: number }> | undefined
export function awsIconSvg(key: string): string | undefined
export function hasIcon(key: string): boolean
```

## API / Interface Contract

```
resolveNodeIcon is the ONE rule, and every renderer goes through it -- the node,
the picker's "current" swatch, and SPEC-015's merged edge. Three consumers is
exactly the shape that grows three slightly different answers if the rule is
re-implemented at each site, which is what SPEC-008 found with collapse.
```

## Configuration / Environment

Two new dependencies: `lucide-react` and an AWS architecture icon source, both recorded in
`CLAUDE.md` → *Tech Stack* when added.

## File & Folder Structure

```
src/
├── shared/
│   ├── icons/
│   │   ├── match.ts            # NEW -- the matcher and the ported rule table
│   │   ├── match.test.ts       # NEW -- the label corpus
│   │   └── keys.ts             # NEW -- namespaced ICON_KEYS, shared by matcher and document
│   └── shapes/node.ts          # + icon, + its migration
└── client/
    ├── icons/registry.tsx      # NEW
    ├── shapes/NodeShapeUtil.tsx
    └── panels/IconPicker.tsx   # NEW
```

## Implementation Phases

### Phase 1: The matcher, with no dependency and no UI
- `match.ts`, `keys.ts`, the ported rule table, and the label corpus
- Pure and testable before anything renders

### Phase 2: The prop and its migration
- `icon` on the node, the migration, `resolveNodeIcon` wired into rendering
- The rename-changes-icon criterion, which is the one that proves the three states are real

### Phase 3: The sets and the picker
- Both dependencies, recorded in `CLAUDE.md`; the icon terms one line in `decisions.md`
- The registry; the drift test; the no-key-in-both-sets test
- `IconPicker`, routed through `best-practices/` first

### Phase 4: The document
- `icon` at version 3, exported when pinned and omitted when automatic
- The v1 and v2 corpora go red here and only here
