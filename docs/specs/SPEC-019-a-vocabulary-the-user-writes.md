# Spec: A vocabulary the user writes

**ID:** SPEC-019
**Status:** In Progress
**Last Updated:** 2026-09-10
**Depends On:** SPEC-008, SPEC-010, SPEC-016, SPEC-017, SPEC-018

## Overview

SPEC-018 shipped three edge kinds — data, permission, sequence — hardcoded in
`EDGE_KINDS`. They were read off a single drawing, and the next diagram the project owner
brought to the tool did not fit them: a fraud-detection design over federal spending data
whose graph carries *defines*, *enriches*, *signals* and *derives*. One drawing is not a
vocabulary. This spec lets a diagram carry its own: the kinds a line can be are named by
the person drawing, synced like everything else, and the three that exist today become the
starting set rather than the whole set.

## Scope

### In Scope

- A `diagramKind` record — label, colour, dash — document-scoped and synced, on the
  SPEC-008 custom-record pattern.
- **The three SPEC-018 kinds stay in code**, as `SEED_KINDS`. The vocabulary a client reads
  is the seeds *overlaid by* the records, matched on id. Nothing is written to a room to
  make the three exist, so there is no seeding step, no emptiness test and no moment at
  which one runs — see *Why there is no seed write* below.
- Creating a kind, and renaming or recolouring one (a seed included), from the SPEC-016
  properties panel. A rename rewrites every connection carrying the old label.
- Drawing from the vocabulary instead of from a constant: colour and dash come from the
  entry, and a label the vocabulary does not list is drawn as **unresolved** rather than
  dropped.
- Stroke-colour inference resolves against a vocabulary passed in, so a kind the user added
  with a palette colour is reachable from the pen without any code change — and
  `convertPolicy.ts` stays replayable against the corpus with no live editor.

#### Why there is no seed write

The obvious design — write the three records into a room whose vocabulary is empty — is
unsound, and the first review of this spec is what established that. Three separate routes
reach an empty vocabulary: **undo** (FR-002 makes creation undoable, and tldraw filters
history on `source`, not scope, so a document record lands on the undo stack like a shape —
`scenes/scene.ts` records this); **import** (`documentIO.ts` clears and re-puts scene
records, and a reader following that precedent would clear kinds too); and **hydration**,
because in a synced room the store is empty before the first snapshot arrives, so "a room
with no kinds" is a claim about a moment and there is no moment to pick. Each one re-seeds
`data` behind a user who renamed it to `flows`, splitting their connections across two
labels. Overlaying code-defined seeds removes the write, and with it all three.

### Out of Scope

- **The JSON document.** A kind record neither exports nor imports here, exactly as
  SPEC-018 left the `kinds` prop out. This is the seam SPEC-011 → SPEC-012 was cut along,
  taken again deliberately: the vocabulary has to exist on the canvas before the format can
  be asked to carry it, and the format bump owes a frozen corpus of the version before it.
  **Import therefore leaves `diagramKind` records untouched** — it clears scenes because
  scenes are *in* the document and the imported one is authoritative about them; it is
  authoritative about nothing here. Stated because leaving it unstated is the Open Question
  §4 forbids. SPEC-018's export warning stays and gains a sentence about the vocabulary.
- **Deleting a kind.** Create, rename and recolour only. Deletion asks what happens to the
  connections carrying it, and answering it wrong loses meaning silently. Note this is
  *no longer* what makes the vocabulary sound — the seed argument above does — so it is a
  scope cut on its own merits: an unused kind is clutter, not damage.
- **A free colour picker.** Colour comes from a fixed palette whose entries are each
  contrast-checked. A picker lets a user defeat WCAG 1.4.11 on their own diagram, and the
  failure is invisible to the person who caused it.
- **Reconciling concurrent edits to one kind.** Two clients renaming the same kind
  differently produce two kinds. The commoner break is **rename versus toggle**: `KindField`
  writes back the whole `kinds` array it read, so a client toggling a kind on a connection
  while another renames `data`→`flows` writes the stale `data` back, leaving a connection
  carrying a label the vocabulary does not list — and `merge.ts`'s `distinctKinds` then
  draws `data` and `flows` as two strands on one folded edge. FR-004's unresolved rendering
  keeps it visible and FR-005 lets it be turned off; neither is a fix. Named, not solved.
- **Kind on anything but a connection**, **parallel edge sets**, and **filtering the canvas
  by kind** — all still out, for the reasons SPEC-018 gives.

---

## Functional Requirements

### FR-001: The vocabulary is seeds overlaid by records

#### Description:

A kind entry is an id, a label, a palette colour and a dash. `SEED_KINDS` defines three in
code. A `diagramKind` record at **document** scope overrides the seed of the same id, or
adds a new entry; it follows the SPEC-008 custom-record pattern and reaches all three
schema-construction sites. Nothing is ever written to make a seed exist.

#### Acceptance Criteria:

- [ ] `diagramKind` appears in `roomSchema.types`, in a store built from `syncSchemaOptions`,
      and in the permissive `?unvalidated` dev schema — asserted on the built schema, not on
      source text, as `scenes/boundary.test.ts` does and for the reason it records.
- [ ] `customRecordSchemas[KIND_RECORD_TYPE].scope === 'document'`, and the store agrees.
- [ ] A room with no `diagramKind` records reads a vocabulary of exactly the three seeds,
      with the colours and dashes SPEC-018 shipped, and **the store holds no record after
      reading** — the assertion that fails if a seed write is reintroduced.
- [ ] A client **joining a synced room** whose vocabulary already carries a renamed seed
      reads the renamed label. Asserted in the **two-client e2e** of FR-005, not in jsdom:
      `createTLStore` + `put` + read is exactly the pre-populated store this criterion
      disclaims, and it would pass. The venue is the criterion.
- [ ] A record whose id matches a seed replaces that seed's label, colour and dash, and does
      not add a fourth entry.
- [ ] A record with a label that is empty after trimming, or untrimmed, is rejected by the
      validator. Uniqueness is **not** a validator rule — it is a property of the overlay
      and is enforced at the write sites in FR-002/FR-003, because a validator sees one
      record and cannot see the set.

### FR-002: Adding a kind from the panel

#### Description:

`KindField` gains a control that creates a kind: a label, a colour from the palette and a
dash. Created ids are **generated**, never derived from the label. The new kind is available
on every connection, not only the selected one.

#### Acceptance Criteria:

- [ ] Typing a label and confirming creates a `diagramKind` record and the kind appears as a
      checkbox in the field, on the selected connection and on any other connection selected
      afterwards.
- [ ] The label is trimmed before storing; a label empty after trimming is refused with a
      message, creating nothing.
- [ ] A label matching an existing entry's, compared case-insensitively after trimming, is
      refused with a message naming it, and creates nothing.
- [ ] Creating a kind labelled `data` **after** the seed `data` has been renamed to `flows`
      succeeds and produces a **fourth** entry — it does not overwrite the renamed seed. The
      criterion that fails if created ids are derived from labels the way seed ids are.
- [ ] A kind whose colour **and** dash both duplicate an existing entry's is refused: two
      kinds indistinguishable on the canvas are a WCAG 1.4.1 failure the user cannot see,
      and colour alone is not the channel.
- [ ] Creating a kind does not check any box: a new kind is a word in the vocabulary, not a
      claim about the line that happened to be selected.
- [ ] Creation is one undo step. Undoing it removes the **entry**, not the labels: a
      connection that was checked in the meantime still carries the word, and FR-005 shows it
      as unresolved. This is the one route by which a kind leaves the vocabulary while
      deletion is out of scope, and the answer to "what happens to the connections carrying
      it" is *nothing* — stated here because two criteria that disagree would have an
      implementer filter unlisted labels out of the field and re-break FR-005.
- [ ] The panel offers **no control that removes a kind** — deletion is out of scope, and a
      criterion is what makes that load-bearing rather than aspirational.
- [ ] The control is unreachable while the selection is a merged line: `KindField` is
      disabled whole, as SPEC-018 left it.
- [ ] Every control added here meets the repo's 44×44 touch-target bar measured on its own
      rect, per SPEC-016.

### FR-003: Renaming and recolouring a kind

#### Description:

An entry's label, colour and dash can each be changed, seeds included — changing a seed
writes a record with the seed's id. Because a connection stores the label, a rename must
rewrite every connection carrying the old one, as a single undoable action.

#### Acceptance Criteria:

- [ ] Recolouring a kind changes the stroke colour of every connection carrying it, with no
      write to any connection record.
- [ ] Renaming a **seed** creates a record with the seed's id, and the vocabulary still has
      three entries, not four.
- [ ] Renaming rewrites `kinds` on every connection that carried the old label, in every
      container folded or expanded, leaving the other labels on those connections untouched
      and still in normal form.
- [ ] A rename is **one** undo step: undoing restores the old label on the entry and on
      every connection rewritten.
- [ ] A rename colliding with **another** entry's label is refused and rewrites nothing —
      checked with a connection carrying both kinds, the case that would otherwise collapse
      two labels into one.
- [ ] Renaming `data` to `Data` **succeeds**: the self-exclusion is by entry **id**, not by
      whitespace. A case-insensitive comparison with no id exclusion refuses a label
      colliding with itself, and capitalising a label for display is exactly what
      `KindField`'s current `KIND_LABELS` map does and this spec deletes.
- [ ] Recolouring or redashing a kind onto another entry's exact colour-and-dash pair is
      refused, by the **same** write-side check FR-002 uses. Without it the FR-002 guard is
      bypassable in two steps: create distinct, then edit onto the collision.
- [ ] The rewrite is **page-scoped**, matching every other reader in the repo
      (`mergeIndex.ts`, `documentIO.ts` both use `getCurrentPageShapes`). Stated because the
      app is single-page today, so a page-crossing rename is latent, not live.

### FR-004: The canvas draws from the vocabulary

#### Description:

`strandsFor` resolves a label through the vocabulary rather than through `KIND_DASH` and a
`--edge-kind-*` custom property. A label the vocabulary does not list is drawn **unresolved**
— not dropped, which is what SPEC-018's renderer did.

#### Acceptance Criteria:

- [ ] A connection carrying a user-created kind draws a strand whose computed `stroke` is
      that kind's palette colour and whose `stroke-dasharray` is its dash.
- [ ] Recolouring a kind repaints its strands with no change to the connection record.
- [ ] A connection carrying an unlisted label draws a strand, so the strand count equals the
      label count — the assertion that fails if an unlisted label is filtered out again.
- [ ] An unresolved strand is painted in `KIND_UNRESOLVED`, a reserved near-black excluded
      from the palette, with a reserved dash; it carries `data-unresolved`, and the shape's
      accessible name says that label is not in the vocabulary. Near-black because SPEC-018
      already means "no kind" by black — the default pen records no decision.
- [ ] The unresolved strand does **not** use `currentColor`. `index.css` sets `color` to the
      accent on a highlighted connection and `ConnectionShapeUtil` draws the halo in
      `currentColor` behind the strands — so a `currentColor` strand is the accent painted
      over the accent, and vanishes into its own highlight. The criterion above excludes
      `#1a5fb4` from the palette for that reason; this is the same failure through the other
      door, and the halo exists *because* strands do not use `currentColor`.
- [ ] `KIND_UNRESOLVED` is in no palette entry and clears 3:1 against both the canvas token
      and the halo.
- [ ] `#1a5fb4` is in no palette entry: it is the scene-highlight accent at five sites in
      `index.css`, and a kind painted in it is indistinguishable from a highlighted line.
- [ ] Every palette colour clears 3:1 against **the light canvas background token**. Scoped
      to that token deliberately: a strand is also drawn over node fills and over the
      SPEC-018 halo, and a constant-vs-constant test cannot speak to those.
- [ ] No two palette colours clear less than 3:1 against **each other** — two strands sit
      `KIND_STRAND_GAP` apart, so adjacent-colour contrast is what WCAG 1.4.11 asks about.
      This is a palette-level property and is asserted from `KIND_PALETTE` alone; whether two
      *entries* are distinguishable is a runtime property of the vocabulary and belongs to
      the FR-002/FR-003 write-side check, not here. `dash` is not a palette field.
- [ ] The colours painted are asserted in **e2e**, not jsdom — only a real browser resolves
      what is on the canvas, as the SPEC-018 delivery doc records.
- [ ] The shape's accessible name lists every label the connection carries, unlisted ones
      included.
- [ ] Scene highlighting still reaches a kinded line — the SPEC-018 halo, re-asserted here
      because this spec rewrites the paint path it sits behind.

### FR-005: The panel offers the vocabulary, plus what the line already says

#### Description:

`KindField` lists a checkbox per vocabulary entry, and additionally one per label the
selected connection carries that the vocabulary does not list — so a label arriving from
another client, or from a concurrent rename, is visible and can be turned off.

#### Acceptance Criteria:

- [ ] The checkboxes are the vocabulary in a stable order — by label, by the same total order
      `normaliseKinds` uses — so two clients render one list.
- [ ] A connection carrying an unlisted label shows it checked and marked as not in the
      vocabulary.
- [ ] Unchecking such a label removes it from the connection and the checkbox disappears;
      nothing offers to re-check it, because it was never a kind.
- [ ] The merged-line note and read-only behaviour from SPEC-018 are unchanged.
- [ ] **Two clients:** one creates a kind and checks it on a connection; the other's panel
      offers that kind and its canvas paints that connection's strand in that kind's colour,
      with no reload. The premise of the whole architecture, and nothing else in this spec
      asserts it.

### FR-006: The pen reaches the vocabulary

#### Description:

`kindForStrokeColour` takes the vocabulary as an argument and resolves a drawn stroke's
tldraw colour against it — an entry whose palette colour is that tldraw colour claims the
stroke. Passed in rather than read from a store, so `convertPolicy.ts` keeps the property
its own header states: replayable against the corpus with no live editor.

#### Acceptance Criteria:

- [ ] `kindForStrokeColour(colour, vocabulary)` and `kindsForStrokeColour(colour, vocabulary)`
      reach no store and no editor; the corpus replay passes the seed vocabulary explicitly.
      The SPEC-018 evidence is unchanged in **substance** — strokes 80, 188 → data; 259 →
      permission — and its call sites gain the argument.
- [ ] `MAPPED_STROKE_COLOURS` and `COLOUR_REACHABLE_KINDS`, module constants derived from the
      old map, become **functions of a vocabulary**; their existing tests are rewritten
      against the seed vocabulary rather than deleted.
- [ ] Creating a kind whose colour is a palette entry mapped to a tldraw pen colour makes
      that pen colour produce that kind, with no code change.
- [ ] A black stroke produces a connection with no kinds.
- [ ] When two entries share one palette colour, the stroke claims the one the total order
      over labels picks first, and the choice is the same on every client.
- [ ] A tldraw colour no entry's palette colour maps to produces no kind.
- [ ] A kind labelled `__proto__` round-trips through create, render and rename. Restated
      from SPEC-018's prototype-pollution guard, which was live because `KIND_BY_COLOUR` is a
      plain object; a `Map` makes the old form unfalsifiable, and the record path is where
      the hazard actually moved.

---

## Data Model

```ts
// src/shared/kinds/kindType.ts — the literal and its prefix, alone, for the
// reason scenes/sceneType.ts records.
export const KIND_RECORD_TYPE = 'diagramKind'
export const KIND_ID_PREFIX = `${KIND_RECORD_TYPE}:` as const

// src/shared/kinds/kind.ts
export interface DiagramKind extends BaseRecord<typeof KIND_RECORD_TYPE, DiagramKindId> {
  /** The word on the edge. Trimmed and non-empty; uniqueness is the overlay's. */
  label: string
  /** A key of KIND_PALETTE, never a raw colour. */
  colour: string
  /** A key of KIND_DASHES. */
  dash: string
}

// The read model — what a renderer, the panel and the pen all consume.
export interface KindEntry {
  id: string
  label: string
  colour: string
  dash: string | undefined
}

// src/shared/kinds/palette.ts
// Eight entries. Two exclusions, both load-bearing: #1a5fb4 is the scene-highlight
// accent, and NO entry maps to the black pen -- black is the default pen and records no
// decision, so FR-006's "a black stroke produces no kinds" stays true no matter what the
// user creates. `pen: null` is for a palette colour no pen can reach.
export const KIND_PALETTE: Readonly<Record<string, { hex: string; pen: string | null }>>
export const KIND_DASHES: Readonly<Record<string, string | undefined>>
/** The reserved unresolved look. In no palette entry; see FR-004. */
export const KIND_UNRESOLVED: { hex: string; dash: string }
// The three SPEC-018 kinds, ids fixed, colours and dashes as shipped.
export const SEED_KINDS: readonly { id: string; label: string; colour: string; dash: string }[]
```

A connection's `kinds` prop is **unchanged**: `string[]`, holding labels. The label is the
identity, which costs a rewrite on rename (FR-003) and buys two things outright — **no shape
migration**, and the survival of an unknown label that `connection.ts` already promises in
prose. It also keeps the document readable when the follow-on spec carries it
(`kinds: ["enriches"]`, not `kinds: ["diagramKind:k7"]`), but that spec is an `INDEX.md`
placeholder, so it is the third reason and not the argument.

Colours move from `--edge-kind-*` custom properties into the palette constant. That trades a
theming seam for testability — a unit test can now see the colour a kind resolves to — and
the loss is real: dark mode would have adapted through the custom property and now will not.
Taken deliberately; the app ships no dark canvas today.

---

## API / Interface Contract

```ts
// src/shared/kinds/index.ts
overlayVocabulary(records: readonly DiagramKind[]): KindEntry[]   // seeds ⊕ records, by id
labelCollision(label: string, entries: readonly KindEntry[], exceptId?: string): KindEntry | null

// src/client/kindVocabulary.ts — the read side, memoised like mergeIndex
getVocabulary(editor): ReadonlyMap<string, KindEntry>             // keyed by label
resolveKind(vocabulary, label): KindEntry | null                  // null = unresolved

// src/client/sketch/convertPolicy.ts — vocabulary PASSED IN, no store reached
kindForStrokeColour(colour: string | undefined, vocabulary: readonly KindEntry[]): string | null
kindsForStrokeColour(colour: string | undefined, vocabulary: readonly KindEntry[]): string[]
mappedStrokeColours(vocabulary: readonly KindEntry[]): string[]
colourReachableKinds(vocabulary: readonly KindEntry[]): string[]

// src/client/shapes/ConnectionShapeUtil.tsx
strandsFor(labels, vocabulary, a, b): { kinds: string[]; strands: Strand[] }
```

## Configuration / Environment

None.

## File & Folder Structure

```
src/shared/kinds/
├── kindType.ts        # the literal + prefix
├── kind.ts            # record, validator, migrations
├── palette.ts         # KIND_PALETTE, KIND_DASHES, SEED_KINDS
├── index.ts           # re-exports + overlayVocabulary, labelCollision
├── kind.test.ts
├── overlay.test.ts    # seeds ⊕ records, and that reading writes nothing
├── palette.test.ts    # contrast, the accent exclusion, colour+dash distinctness
└── boundary.test.ts   # the three schemas carry it
src/client/
├── kindVocabulary.ts
├── kindVocabulary.test.ts          # the memo comparator, as mergeIndex.test.ts does
├── shapes/ConnectionShapeUtil.tsx  # strandsFor resolves through the vocabulary
├── shapes/connectionStrands.test.ts
├── sketch/convertPolicy.ts         # signatures gain the vocabulary
├── sketch/convertPolicy.test.ts    # call sites gain the argument; the evidence is unchanged
├── index.css                       # --edge-kind-* removed; unresolved strand style
└── panels/fields/KindField.tsx     # rewritten
├── panels/fields/KindField.test.tsx
src/shared/shapes/
├── connection.ts                   # EDGE_KINDS/EdgeKind removed, docblock rewritten
└── connection.test.ts              # the closed-vocabulary assertions retire with it
e2e/
├── edge-kinds.spec.ts              # SPEC-018's, amended where FR-004/FR-005 change it
└── edge-kind-vocabulary.spec.ts    # incl. the two-client case (FR-005, FR-001)
```

## Implementation Phases

### Phase 1: The record and the overlay

- `kindType.ts`, `kind.ts`, `palette.ts`, `index.ts`; register in the three schemas.
- `overlayVocabulary`, `labelCollision`; boundary, validator, overlay and palette tests.

### Phase 2: The read side and the canvas

- `kindVocabulary.ts` with its memo comparator, tested directly the way `sameEntry` is.
- `strandsFor` resolves through the vocabulary; unresolved rendering; the halo re-assertion.

### Phase 3: The panel

- `KindField` rewritten: vocabulary checkboxes, unresolved labels, add, rename, recolour.
- Collision and trimming in one shared function; touch targets; no delete affordance.

### Phase 4: The pen

- `convertPolicy.ts` signatures take the vocabulary; corpus replay passes the seeds.

### Phase 5: Docs and the retired constant

- **`EDGE_KINDS` and `EdgeKind` are removed**, not re-derived: their whole content is
  `SEED_KINDS`' labels, and a surviving alias would keep a "closed vocabulary" export in the
  file that no longer has one. `connection.ts`'s twelve-line docblock calling the vocabulary
  closed is rewritten in place and carries the superseded marker, as do
  `docs/component-inventory.md` and `docs/architecture.md`'s statement of the same claim.
- Delivery doc, `decisions.md` entry for label-as-identity and for seeds-over-records,
  superseded marker on SPEC-018's closed vocabulary, INDEX rows, the export warning.
