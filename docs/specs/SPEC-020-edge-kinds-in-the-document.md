# Spec: Edge kinds in the JSON document

**ID:** SPEC-020
**Status:** In Progress
**Last Updated:** 2026-10-20
**Depends On:** SPEC-007, SPEC-009, SPEC-012, SPEC-018, SPEC-019

## Overview

SPEC-018 put kinds on a connection and SPEC-019 made the vocabulary the user's own, and neither
reaches the JSON document: a diagram whose meaning is which lines carry data and which carry
permission exports into a plain one, and the export panel warns you before it happens. This closes
that gap. The document carries both halves — the words each connection says, and the vocabulary that
gives those words a colour and a line style — so a diagram sent to a colleague arrives meaning and
looking as it did, and a model asked to author one can invent the vocabulary it needs instead of
being limited to three words it did not choose.

## Scope

### In Scope

- `DOCUMENT_VERSION = 4`: an optional `kinds` on a connection, and an optional top-level `kinds`
  vocabulary.
- Accepting **v1, v2 and v3** unchanged by upgrading them on the way in, each new key behind its
  own version guard.
- **A frozen v3 corpus**, authored and made green while 3 is still current.
- Exporting the room's **effective** vocabulary — the three built-ins included — so the document is
  self-contained and reads the same on a build whose built-ins differ.
- **Import replaces the room's authored vocabulary**, the way it already replaces scenes, and the
  confirm dialog says what this room loses before it happens.
- Deleting SPEC-018's export warning, and the guide gaining a kinds section.
- **One change inside SPEC-019, with its own FR: `KindEntry.dash` becomes a palette KEY rather than
  a resolved SVG value.** Today `colour` is a key that `resolveKind` resolves and `dash` is pre-resolved, which is
  an asymmetry with no reason behind it — and it means the only producer of the effective
  vocabulary, `overlayVocabulary`, cannot supply what the document must write. The alternative is a
  second place that merges seeds with records, which is exactly the duality drift `CLAUDE.md` warns
  about. One producer, so this is in scope rather than worked around. It gets FR-003 rather than a
  bullet because it silently disables a SPEC-019 safety rule if done naively — see there.

**This spec carries seven FRs, above the 3–6 aim, and the call is made out loud as `process.md` §4
requires.** The cut that tempts is FR-003, the dash-key refactor, into its own spec. It is kept here
because it is three functions and a type, it changes no behaviour, and it exists *only* to serve this
format change — a spec whose entire content is "make one field consistent with its neighbour" is
process for its own sake. The remaining six are a format shape, the validator's rule set, backward
compatibility, export, import, and a deletion sweep: the same six SPEC-012 used for the same seam.
The reviewer's call to accept or reject, not the author's to assert.

### Out of Scope

- **Merging two vocabularies.** The project owner chose replace over merge on 2026-10-20, with the
  cost stated: importing a diagram discards kinds this room had defined and the sender had not. The
  document is authoritative exactly as it already is about scenes, and the mitigation is the one
  scenes already use — the import is announced, and is a single undo step.
- **Removing a built-in.** The three in `SEED_KINDS` are code, never records, and the overlay
  re-adds them before applying any record: they cannot be deleted, so "replace" means **replace the
  authored vocabulary**, not "the room's words are exactly the document's". FR-004 states it that
  way and the dialog says it in those words. Suppressing a built-in needs a tombstone the record
  model does not have, and SPEC-019 declined deletion on its own merits; nothing here reopens it.
- **Downgrading.** There is no v4 → v3 export, and a v3 build handed a v4 document reports
  `document.version: expected 1 or 2 or 3, got 4`. Nothing here reaches a build that already
  shipped.
- **Changing what a kind MEANS.** SPEC-019 owns the record, the panel, the palette and the overlay's
  seed-override rule. The one change above is to the *shape* of what the overlay returns, not to
  which entry wins.
- **A kind on anything but a connection**, and **filtering by kind** — still out, per SPEC-018.
- **Pages.** `importDocument` is page-scoped while `diagramKind` records are document-scoped, so
  replacing the vocabulary can in principle orphan a word used on another page. The app is
  single-page today and `KindField` already records the same exposure for rename; latent, not live,
  and not fixed here.

---

## Functional Requirements

### FR-001: The format carries both halves

#### Description:

`DocumentConnection` gains an optional `kinds`, and `DiagramDocument` gains an optional top-level
`kinds` vocabulary of `{ id, label, colour, dash }`.

#### Acceptance Criteria:

- [ ] `DOCUMENT_VERSION === 4`, and `SUPPORTED_DOCUMENT_VERSIONS` is `[1, 2, 3, 4]`.
- [ ] **Both keys are OPTIONAL, and absent is not the same as empty.** An absent top-level `kinds`
      means the document says nothing about the vocabulary; `[]` means it declares an empty authored
      one. FR-006 acts on those differently, and an upgraded v3 document must land on *absent* —
      `parseDocument` returns `version: DOCUMENT_VERSION` unconditionally, so the key's presence is
      the only thing that distinguishes an upgraded v3 from a v4 that means it.
- [ ] A connection carrying no kinds omits **its** key, so a connection entry is byte-identical to
      its v3 form. The *document* is not: FR-005 gives every export a vocabulary, so an unkinded
      diagram does gain a top-level key.
- [ ] **`fromDocument`'s returned `kinds` is OPTIONAL too**, `undefined` when the document's key is
      absent. That is what keeps the frozen v1 and v2 `EXPECTED` blobs byte-identical under
      `toEqual`, which ignores an undefined key and does not ignore `[]` — those corpora assert on
      the **whole** returned object, so a new required key edits both blobs and FR-004 forbids that.
- [ ] A connection's `kinds` is validated in the **normal form** `normaliseKinds` produces —
      deduplicated and ordered — so two clients exporting one diagram produce one string.
- [ ] Strict on unknown keys and wrong types, on the same terms as every other field, and defensive
      about a non-array `kinds` at either site.
- [ ] **When `vocabulary` is omitted, a connection word the build's three do not define is
      dropped**, exactly as FR-005 drops a word with no free pair. Otherwise the one function whose
      contract forbids it would emit a document `parseDocument` rejects. Only tests omit the
      parameter today, and the Phase 4 tests are the first code to build kinded connections, so the
      rule is stated rather than discovered.
- [ ] **`toDocument`'s `vocabulary` parameter is a trailing OPTIONAL, and omitting it omits the
      key** — it does not default to `[]`. The three candidate arities each cost something:
      required edits 42 existing call sites, which `document.ts` argues against for `scenes` on the
      same grounds; defaulting to `[]` makes every one of those call sites emit a **destructive**
      instruction, because FR-006 makes `[]` clear the authored vocabulary; defaulting to the
      built-ins makes "absent" unreachable from `toDocument` at all. Omitting the key is the only
      one of the three that is both non-destructive and leaves "says nothing" expressible. It is
      **not** symmetrical with `scenes`, where `[]` is harmless, and that asymmetry is the reason.

### FR-002: The validator refuses what an import cannot survive

#### Description:

The document's vocabulary is checked against the rules whose violation would otherwise throw inside
`store.put` *during* the import transaction — a failure with no message, at a point with no way to
report one.

#### Acceptance Criteria:

- [ ] A document naming a word on a connection that neither its vocabulary nor the build's
      three defines is **rejected**, with a message naming the word.
- [ ] **One rejection per corruption-class rule, each with its own message and its own test**: a
      `label` empty after trimming; a `label` that is untrimmed; two entries with the same `id`; two
      entries whose labels collide by `labelCollision`'s rule; an `id` not matching
      `[A-Za-z0-9_-]+`.
- [ ] **A label collision against a built-in is judged against the document's OWN effective
      vocabulary** — the built-ins *after* the document's overrides are applied — not against the
      raw built-in list. Judged the naive way, this room cannot export: rename built-in `data` to
      `flows`, then rename built-in `permission` to `data`, which `KindField` allows because the
      effective vocabulary has no clash. Export then emits an entry labelled `data` that does not
      override built-in `data`, and the naive rule rejects it. Swapping two labels is an ordinary
      action.
- [ ] **The invariant, with its population named**: `parseDocument(JSON.stringify(toDocument(…)))`
      is `ok` for the cross product of {0, 1, 2 records} × {renames a built-in, adds a new kind,
      duplicates a label, duplicates a colour-and-dash pair, swaps two built-in labels}. A
      universally-quantified criterion with no stated population is one a reviewer ticks with three
      hand-picked cases, which is the vacuous pass this criterion was added to prevent.
- [ ] **Two records may legitimately share a label, and export must survive it.** The record
      validator deliberately does not enforce label uniqueness — `boundary.test.ts` asserts that as
      a property — and `refuseKindWrite` reads a possibly-stale vocabulary, so two clients renaming
      concurrently can land two entries labelled `perms`. The id-keyed `overlayVocabulary` returns
      both, which would make the room unable to export itself.
- [ ] `colour` and `dash` are validated **closed** against `KIND_PALETTE` and `KIND_DASHES`, naming
      the unknown value. The document being stricter than the shape prop is established, not new:
      `icon` is closed in the document and `T.string` on the node shape, because an unknown key
      renders nothing and looks exactly like the matcher failing.
- [ ] **A document with two entries sharing a colour AND a dash is ACCEPTED**, with a test — the
      observable form of excluding `pairCollision` here. It is a legibility rule, enforced where a
      human chooses (`KindField`), and enforcing it here would make FR-005's synthesised entry
      unexpressible. Two costs, stated rather than labelled: such kinds are indistinguishable on
      canvas, which is what the dash channel exists for; and `refuseKindWrite` will then refuse a
      pure *rename* of either until a colour also changes, so the room is in a state the panel
      cannot edit out of in one step.

### FR-003: A kind's dash is a palette key

#### Description:

`KindEntry.dash` becomes a `KIND_DASHES` key, symmetric with `colour`, and `resolveKind` resolves
both. This is the prerequisite that lets one producer supply what the document writes.

#### Acceptance Criteria:

- [ ] `overlayVocabulary` returns the dash **key**; `resolveKind` resolves `colour` and `dash` the
      same way, and an unknown key of either falls back to the unresolved look as it does today.
- [ ] **An unknown dash key is detected with `Object.hasOwn`, not by a resolved `undefined`.**
      `KIND_DASHES.solid` is legitimately `undefined`, so `KIND_DASHES[entry.dash] === undefined`
      makes **every solid kind, built-in `data` included, render unresolved**. `keyOf` already does
      this correctly for the same reason. The trap is named because the requirement above reads as
      if it were free.
- [ ] **`pairCollision` and `labelCollision` move to `palette.ts` alongside `freePair`.** All three
      are pure functions over `VocabularyEntry` and none needs tldraw; `freePair` is a loop over
      `pairCollision`, so moving one without the other leaves three bad options — a module cycle
      (`kind.ts` already imports `palette.ts`), a second copy of the colour-and-dash rule, or
      `document.ts` reaching tldraw through the back door. Their call sites in `KindField.tsx` and
      `overlay.test.ts` move with them.
- [ ] **The fence becomes a test, and the test is the achievable fence.** The wording an earlier
      draft used — "neither `palette.ts` nor `document.ts` reaches any tldraw package,
      transitively" — is **false of `document.ts` today**: it imports `./shapes/node`, which imports
      `@tldraw/tlschema`. Written that way the test is red the day it lands and gets quietly
      narrowed, which is the comment it was meant to replace. Two real properties instead:
      - **`palette.ts`'s transitive closure is itself** — it resolves no import at all. That is what
        makes `document.ts` reaching into `./kinds/palette` safe, and it is the whole of what
        FR-005 needs.
      - **No `src/shared` source resolves a relative import outside `SHARED_DIR`.**
        `shared-imports.test.ts` already forbids `tldraw` in *every* shared source, so transitivity
        within `src/shared` comes free from that universal quantification; the genuine hole is that
        it `continue`s past every relative specifier, so `import '../client/foo'` walks straight
        through.
- [ ] **The fence owes a fixture corpus, like the gate beside it.** `shared-imports.test.ts`
      extracts its walker as a pure function precisely so planted fixtures can prove it bites,
      including a case that asserts silence. The new rule gets the same: a planted graph escaping
      `src/shared` through a two-hop relative chain, and a clean one. A gate is not tested by
      running it on the thing it guards.
- [ ] **`pairCollision` still refuses two kinds identical in colour and dash.** It currently
      resolves its argument (`KIND_DASHES[dash]`) and compares against `entry.dash`; once entries
      hold keys, every comparison becomes key-versus-SVG-value and the function returns `null` for
      everything — silently retiring the WCAG 1.4.1 rule SPEC-019's plan review added, and making
      `freePair` hand every new kind `data`'s own pair. A test asserts the refusal after the change,
      and the mutation that reddens it is named.
- [ ] **`dashKeyOf` is deleted, not left working by accident.** It reverse-maps a resolved dash to a
      key; with keys in hand it finds nothing and falls through to `solid`, so opening any non-solid
      kind for edit would silently reset its dash.
- [ ] Every `KindEntry` literal and every `keyof KindEntry` mapping in the suite is updated, named
      file by file in the plan: `kindVocabulary.test.ts`, `connectionStrands.test.ts`,
      `overlay.test.ts`, `palette.test.ts`, and `KindField.tsx` with its test.

### FR-004: v1, v2 and v3 still mean what they meant

#### Description:

Older documents import unchanged; each key is refused at a version that predates it.

#### Acceptance Criteria:

- [ ] **The existing `actorId` guard is `raw.version !== 3`, and the bump breaks it**: at version 4
      that test is true, so **every v4 document carrying an actor is rejected** with
      `connections[i].actorId: requires version 3`. It becomes `raw.version < 3`, and a criterion
      pins a v4 document with an `actorId` as accepted. This is a pre-existing bug that only the
      bump triggers; FR-004 owns guards, so it owns this one.
- [ ] A top-level `kinds` on a document declaring version 1, 2 or 3 is rejected with
      `document.kinds: requires version 4` — pathed `document.<key>` like every other top-level
      failure, decided on purpose because it is pinned text — and a connection's likewise at
      `connections[i].kinds`.
      `TOP_LEVEL_KEYS` is the union of every version's keys, so strictness does not cover this.
- [ ] **The FOUR guards** — `scenes`→v2, `connections[i].actorId`→v3, `document.kinds`→v4,
      `connections[i].kinds`→v4 — run in a pinned order, asserted, so a document violating two
      reports the same one every time. Four, not three: satisfying this FR's own criteria adds two.
- [ ] **A frozen v3 corpus at `src/shared/__fixtures__/v3/`, literal `"version": 3`, authored and
      green in its OWN COMMIT before the commit that bumps the version.** After the bump the two are
      indistinguishable files; nothing automated can check it, so the diff reviewer is told to check
      the history. Said plainly because a criterion with no observable cannot fail.
- [ ] The v3 corpus covers a minimal document, one with actors, and one with scenes — each earning
      its place on **content**, as the v2 corpus's files do. There is deliberately **no
      "no-kinds-key" fixture**: a `kinds` key is illegal at v3, so every v3 document lacks one and
      such a fixture has no contrast class that can exist — it would be `minimal.json` twice.
- [ ] **The absent-versus-`[]` distinction is asserted in the format tests, not in any corpus.** A
      corpus asserts with `toEqual`, which ignores an `undefined`-valued key — the very mechanism
      FR-001 relies on — so it is structurally incapable of telling absent from empty. The
      assertion is `'kinds' in result.document`, where the two differ.
- [ ] **The v1 and v2 `EXPECTED` blobs do not change, and any edit to either is a defect** — which
      holds only because of FR-001's optional return key. SPEC-012 carried this claim with that
      precondition stated; borrowing the sentence without it is what made it false in the last draft.
- [ ] Importing a v3 document leaves every `diagramKind` record untouched and creates none — and
      this is where the spec **diverges from scenes**, which get `scenes: []` injected on upgrade and
      are then deleted on import. Stated, because FR-006 cites scenes as its model.
- [ ] The version error reads `expected 1 or 2 or 3 or 4, got 5` — the existing `join(' or ')`
      wording, pinned, because v2 and v3 each pinned their own.

### FR-005: Export says everything the diagram means

#### Description:

`toDocument` writes each connection's kinds and the room's effective vocabulary, built-ins included.

#### Acceptance Criteria:

- [ ] **Export reads the label-keyed `vocabularyEntries(editor)`, not `overlayVocabulary` directly.**
      Two reasons, both load-bearing: it deduplicates the colliding-label case FR-002 names, and it
      is the memoised `computed` — `exportDocument` runs inside two `useValue`s in the panel, and
      `documentIO.ts` carries a warning about a measured performance defect from scanning records
      there.
- [ ] A room that has never created a kind exports the three built-ins, so a build whose built-ins
      differ reads the same diagram, and so the round trip below is idempotent.
- [ ] A renamed built-in exports under its new label, once, and the old label appears nowhere.
- [ ] The vocabulary exports in `normaliseKinds`' total order over labels, so two clients exporting
      one room produce byte-identical JSON.
- [ ] **Export, import, export again yields an identical document**, and **two exports of an
      unchanged room are identical** — SPEC-012's pair.
- [ ] **A connection carrying a word the vocabulary does not define exports that word with a
      synthesised definition**, so the document never fails FR-002's self-containment rule. The
      mechanism is fully specified because the last draft's "the first free colour-and-dash pair" was
      none of it:
      - the **id** is `unresolved-` plus the label lowercased with each run of characters outside
        `[a-z0-9_-]` replaced by `-`, trimmed of leading and trailing `-`, cut to 64, with a numeric
        suffix on collision. The **prefix is load-bearing**: without it a stale word `data`
        synthesises id `data`, which per the Data Model *claims built-in `data`*, so a re-import
        would rename the user's `flows` back to `data` — the exact defect `newKindId` exists to
        prevent. Replace rather than delete, so `read replica` and `readreplica` stay distinct. The
        pattern in FR-002 and the Data Model is **anchored** (`^[A-Za-z0-9_-]+$`); unanchored it
        accepts `read replica` as an id;
      - the unresolved words are **sorted** before synthesis, and synthesis walks only the
        connections the document actually carries. `toDocument` pushes connections in page order, so
        unsorted, two clients assign the pairs in opposite orders and break this FR's own
        byte-identical criterion; and a half-bound connection is dropped from the document, which is
        a shape the panel has said something false about once before;
      - each synthesised entry is **folded into the set** before the next is chosen, or two
        unresolved words take the same pair;
      - the search is `freePair` in `palette.ts`, shared with `KindField` (FR-003 moves it with
        the two collision functions it needs). Its signature is `freePair(entries)` and returns
        `null` when all 40 pairs are taken — there is no second `taken` argument, because folding
        each synthesised entry into `entries` before the next choice is the whole mechanism;
      - **`KindField` keeps its current behaviour on `null`**: fall back to the first pair at the
        call site, so the form still refuses on save and says why. Today `freePair` cannot return
        `null`; after the signature change its two call sites in `KindField` are type errors, and
        silently changing what the panel does is not part of this spec;
      - past 40 entries no pair is free. The word is then **dropped from the connection** and that
        is the only drop case, alongside a word empty after trimming, which no valid label can
        represent.
      The cost, stated: a transient rename-versus-toggle artefact becomes an ordinary kind on the
      far side. Losing it silently was rejected.
- [ ] **Regression guard, labelled as one:** a merged connection exports its own kinds, not the
      union its representative draws, with the test building a real merged pair. Nothing in the
      export path can see the union, so this cannot fail against a plausible implementation — it is
      a pin against someone routing export through the merge index later.

### FR-006: Import replaces the authored vocabulary, and says what is lost

#### Description:

`importDocument` replaces the room's `diagramKind` records with the document's, in the same single
undoable step as the rest of the import. The confirm dialog names what goes.

#### Acceptance Criteria:

- [ ] After importing a document that declares a vocabulary, the room's `diagramKind` records are
      exactly the document's authored entries. The built-ins remain, because nothing can remove them.
- [ ] A record is written only where an entry **differs from the built-in of the same id**, so
      importing a document whose vocabulary is the three defaults leaves the store with **no**
      `diagramKind` records.
- [ ] A document with the key **absent** (including every upgraded v1/v2/v3) changes no record;
      `kinds: []` clears the authored vocabulary back to the three built-ins.
- [ ] The whole import is **one** undo step.
- [ ] **The confirm dialog's trigger gains a vocabulary term.** It fires today only on
      `undocumentable > 0 || replacedScenes > 0`, so a plain diagram with an authored vocabulary and
      no scenes — the ordinary case for this feature — would import with no dialog and replace the
      vocabulary silently. `replacedSceneCount` exists as its own term for exactly this reason.
- [ ] **Whether the vocabulary would change is a predicate, not a count** (`vocabularyWouldChange`):
      two vocabularies of equal size differ all the time, and a document that only *adds* kinds
      changes the vocabulary while losing nothing.
- [ ] **The lead clause gains a third branch.** It is a two-way ternary today — "the whole page" or
      "this room's scenes" — so in the ordinary case this FR creates (an authored vocabulary, no
      scenes, nothing undocumentable) the dialog fires *because of* the vocabulary, says nothing
      about it, and **claims it is replacing scenes that do not exist**.
- [ ] **A sentence for every trigger, including the add-only case.** When the room loses words, the
      sentence names them — **up to three, then a count**, a threshold this spec picks rather than
      leaving to the builder. When the document only *adds* kinds it still changes the vocabulary and
      loses nothing, and that case gets its own wording rather than falling through to silence. A
      count of incoming kinds describes the wrong thing: the stated cost of replace is what the
      recipient loses. Scenes set the precedent by distinguishing "replaced by N" from "deleted, and
      nothing takes their place".
- [ ] **`DiagramIOPanel.test.tsx`'s `vi.mock('../documentIO')` factory is exhaustive** — five keys
      wired in `beforeEach`. The two new imports go in it and
      `connectionsWithUndocumentedKinds` comes out of it, its `beforeEach` and three assertions, or
      every test in the file breaks. Named because it is the first thing Phase 4 hits.
- [ ] A document whose vocabulary already matches writes nothing and leaves record identities
      unchanged, so an import is not a spurious sync broadcast.

### FR-007: The warning goes, the stale claims go, and the guide gains a section

#### Description:

SPEC-018's export warning becomes false the moment this ships and is deleted; every claim that the
format cannot carry kinds is swept.

#### Acceptance Criteria:

- [ ] `connectionsWithUndocumentedKinds` and its panel warning are **deleted**, with their tests.
- [ ] **The sweep is driven by a command, not by a list**, because a list rots between drafts — the
      last one claimed completeness and missed four sites, one of which goes red. The command is
      `grep -rn` over `src/ e2e/ docs/` for the claim's wording (`undocumented-kinds`,
      "cannot carry", "never reads kinds", "still v3", "untouched"), and the plan records its output
      as the worklist. Known red: `e2e/edge-kinds.spec.ts`'s whole
      `SPEC-018 — the export panel says what the JSON drops` describe block, which asserts on the
      deleted element and is absent from the last draft's file list.
- [ ] The sweep covers at minimum: `documentIO.ts`, `DiagramIOPanel.tsx`, `kinds/kind.ts`,
      `document-v1.test.ts` and `document-v2.test.ts` docblocks, `e2e/edge-kinds.spec.ts`,
      `e2e/edge-kind-vocabulary.spec.ts`, `spec-delivery/SPEC-018-edge-kinds.md`,
      `spec-delivery/SPEC-019-*.md`, and three `decisions.md` entries.
- [ ] **A superseded marker goes on the claim this spec REVERSES** — `decisions.md` → *Seeds in
      code, overrides in records*, whose closing paragraph says an imported document leaves the
      room's kinds untouched and is "authoritative about nothing here". The others are status notes,
      not decisions, and are simply corrected; using a superseded marker on a status note is the
      wrong instrument.
- [ ] The e2e case asserting import leaves the room's kinds alone **changes its INPUT, not its
      expectation**. It exports the room's own JSON and pastes it back; after this spec that document
      *defines* `enriches`, so the existing assertion stays true and `vocabularyWouldChange` is
      correctly false. Flipping the expectation would make it fail for the wrong reason. Testing
      replacement needs a document that does not define `enriches`. Said explicitly because
      "inverted" pointed at the wrong work.
- [ ] `e2e/edge-kind-vocabulary.spec.ts` also asserts on the deleted warning element, not only
      `e2e/edge-kinds.spec.ts`. Both go.
- [ ] The guide shows a document defining a vocabulary and using it, **parsed by a test**.
- [ ] **Every fenced block in the guide declaring a version declares 4**, and the prose claim is
      updated separately — a guide carrying two versions side by side is what a model is handed as
      ground truth.

---

## Data Model

```ts
// src/shared/document.ts
export const DOCUMENT_VERSION = 4
export const SUPPORTED_DOCUMENT_VERSIONS = [1, 2, 3, 4] as const

export interface DocumentKind {
  /**
   * Stable across a rename, and the ONLY thing that matches an entry to a
   * built-in. A built-in's id is its original word, so an entry with id `data`
   * means "this is what `data` is here"; any other id is a new kind. A
   * hand-authored entry may use any id matching [A-Za-z0-9_-]+.
   */
  id: string
  label: string
  /** A key of KIND_PALETTE. Closed — see FR-001. */
  colour: string
  /** A key of KIND_DASHES. */
  dash: string
}

export interface DocumentConnection {
  id: string
  sourceId: string
  targetId: string
  actorId?: string
  /** Normal form. Omitted when empty, so an unkinded line exports as it did. */
  kinds?: string[]
}

export interface DiagramDocument {
  version: number
  nodes: DocumentNode[]
  connections: DocumentConnection[]
  scenes: DocumentScene[]
  /** ABSENT means "says nothing"; `[]` means "no authored kinds". See FR-001. */
  kinds?: DocumentKind[]
}
```

**A connection names a word and the vocabulary keys on an id, and that is deliberate.** The word is
the identity (`kinds/kind.ts`) and is what makes a document readable and model-authorable; the id
exists only so an entry can claim a built-in. They are different jobs.

`document.ts` imports no tldraw package **directly** and that must not change — it does reach one
*transitively*, through `./shapes/node`, which is why FR-003's fence is phrased as the two
properties that are actually true rather than as a transitive ban. Everything it needs here —
`KIND_PALETTE`, `KIND_DASHES`, `SEED_KINDS`, `VocabularyEntry` and `freePair` — comes from
`src/shared/kinds/palette.ts`, which imports nothing. It is imported from `./kinds/palette` and
**never** the `./kinds` barrel, which reaches `@tldraw/tlschema`.

## API / Interface Contract

```ts
// src/shared/kinds/palette.ts — imports NOTHING, so document.ts may reach it
export interface VocabularyEntry {
  id: string
  label: string
  colour: string   // a KIND_PALETTE key
  dash: string     // a KIND_DASHES key — see FR-003
}
/** Moved here from KindField, so there is ONE of it. FR-005. */
export function freePair(entries): { colour: string; dash: string } | null
// ONE argument. Folding each synthesised entry into `entries` before the next
// choice is the mechanism; a `taken` set would be a second one. (An earlier
// draft wrote both here and in FR-005, and FR-005 is the one with reasoning.)

// src/shared/kinds/kind.ts — FR-003
export interface KindEntry extends VocabularyEntry {}
// resolveKind resolves BOTH colour and dash, symmetrically.

// src/shared/document.ts — structural types only
toDocument(..., vocabulary?: readonly VocabularyEntry[]): DiagramDocument
// OPTIONAL, and `undefined` OMITS the top-level key rather than writing `[]`.
fromDocument(document, pageId): { …, kinds?: DocumentKind[] }
// `kinds` OPTIONAL (FR-001) and NOT DiagramKind: that extends BaseRecord from
// @tldraw/store, which is what ExportableScene exists to avoid. `VocabularyEntry`
// rather than `KindEntry` for the parameter, because `kind.ts` imports three
// tldraw packages at runtime — harder than the barrel the fence below names, and
// a type-only import being erased is not a reason to assert a fence and then
// cross it. documentIO mints record ids via `kindRecordId`.

// src/client/documentIO.ts
vocabularyWouldChange(editor, document): boolean     // the dialog's TRIGGER term
vocabularyLostOnImport(editor, document): string[]   // what THIS ROOM loses; the sentence
// connectionsWithUndocumentedKinds — DELETED
```

## Configuration / Environment

None.

## File & Folder Structure

```
src/shared/
├── kinds/palette.ts                # VocabularyEntry, freePair (moved here)
├── kinds/{kind.ts,overlay.test.ts,palette.test.ts}   # dash becomes a key
├── document.ts                     # v4, DocumentKind, validation, guards
├── document.test.ts
├── document-v3.test.ts             # NEW, its own commit, before the bump
├── __fixtures__/v3/                # NEW, frozen
├── guideExamples.ts
└── guide-examples.test.ts
src/client/
├── kindVocabulary.ts               # resolveKind resolves the dash key
├── documentIO.ts                   # export the vocabulary; replace on import
└── panels/DiagramIOPanel{.tsx,.test.tsx}
├── panels/fields/KindField{.tsx,.test.tsx}   # freePair moves out; dashKeyOf deleted
├── shapes/connectionStrands.test.ts
└── kindVocabulary.test.ts
docs/ai-authoring-guide.md          # kinds section; every version block to 4
e2e/
├── document-io.spec.ts
├── edge-kind-vocabulary.spec.ts    # the import-leaves-kinds-alone case INVERTS
└── edge-kinds.spec.ts              # the SPEC-018 export-warning describe block GOES
```

## Implementation Phases

### Phase 1: Freeze v3 — its own commit

- `__fixtures__/v3/` and `document-v3.test.ts`, green while `DOCUMENT_VERSION` is still 3.
- Nothing else in this commit: the corpus is evidence only if it predates the bump.

### Phase 2: The dash key (FR-003)

- `VocabularyEntry` and `freePair` into `palette.ts`; `KindEntry.dash` becomes a key; `resolveKind`
  resolves both; `pairCollision` fixed and its refusal re-asserted; `dashKeyOf` deleted.
- Every literal and `keyof` mapping in the four named test files.

### Phase 3: The format (FR-001, FR-002, FR-004)

- Both optional keys, v4, the validator rule set, the **four** version guards including the
  `actorId` guard the bump breaks, `upgradeV3` so the composition chain reaches 4, the pinned error
  text.
- `toDocument`/`fromDocument` with the optional return key and the optional vocabulary parameter.

### Phase 4: Export and import (FR-002's invariant, FR-005, FR-006)

- The effective vocabulary; the synthesised entry with its id scheme and accumulation; the
  round-trip pair.
- **The export-accepts-its-own-output invariant lands here, not in Phase 3**: it is an assertion
  about the vocabulary, and `toDocument` does not emit one until this phase.
- `documentIO` replaces the authored vocabulary, built-in-aware, one undo step;
  `vocabularyWouldChange` as the dialog's trigger term and `vocabularyLostOnImport` as its sentence.

### Phase 5: Deletions, sweep and docs (FR-007)

- Delete the export warning and its tests; invert one e2e case and delete another's describe block.
- The sweep driven by the grep command, its output recorded as the worklist; guide section and
  version sweep; superseded marker on *Seeds in code, overrides in records*; delivery doc.
