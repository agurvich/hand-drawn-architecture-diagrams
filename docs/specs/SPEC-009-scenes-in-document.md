# Spec: Scenes in the JSON document

**ID:** SPEC-009  
**Status:** Completed  
**Last Updated:** 2026-09-06 (rev 4 — built)  
**Depends On:** SPEC-007, SPEC-008

## Overview

SPEC-007 made a diagram pasteable. SPEC-008 made it narratable. This spec joins them: a document
carries its **scenes** as well as its nodes and connections, so what you hand to a colleague — or ask
a model to write — is a walkthrough rather than a picture.

That is the point of the whole arc. "Write me a four-scene tour of this auth system, starting from
the outside" is a request a model can answer only if scenes are part of the format.

The cost is a **version 2**, because SPEC-007's document is `version: 1` and rejects unknown keys —
deliberately, so an author who writes `scenes` today is told it does nothing rather than being
ignored. Making that key real means every existing document must still import, which is what most of
this spec is about.

## Scope

### In Scope

- `DOCUMENT_VERSION = 2` and a `scenes` key
- Accepting a **v1** document unchanged, by upgrading it on the way in
- **A frozen v1 corpus**, built by this spec, since none exists — see FR-001
- Exporting scenes deterministically, and **never emitting a document the validator would reject**
- Importing scenes: they **replace** the room's scenes, as the diagram does (settled 2026-09-05)
- Strict validation of the new key, on the same terms as everything else
- The authoring guide gaining a scenes section, with its examples proved by the existing tests

### Out of Scope

- **Any change to what a scene IS.** SPEC-008 owns the record, the lens and the surface. This spec
  carries the same fields through a different medium; if it wants a new field, that is SPEC-008's
  spec to change, not this one's.
- **Downgrading.** There is no v2 → v1 export. And the honest limit: a **v1 build handed a v2
  document** cannot be improved by this spec — it will report `document.scenes: unknown key`, because
  its own key check runs before its version check. Nothing here reaches a build that already shipped;
  said out loud rather than implied away.
- **Fixing scene ordering across clients.** Scenes carry a fractional `index` on the record
  (SPEC-008); two clients creating scenes concurrently can produce a tie. This spec makes *export*
  deterministic in the presence of one (FR-003) and does not otherwise touch how indices are minted.
- **Which scene you are viewing.** Session state SPEC-008 keeps out of document scope, and not part
  of a shared artifact. A scene you were viewing that an import removes is SPEC-008 FR-004's
  deleted-scene case, which already drops the viewer out.

---

## Functional Requirements

### FR-001: Version 2, and every v1 document still imports

#### Description:

The version bump is the whole risk. Documents exist in chats, in repos and in files; a format that
breaks them is worse than a format that never grew.

A v1 document is **upgraded on the way in**: it means exactly what it meant before, plus no scenes.

**The corpus this is asserted against does not exist yet, and building it is the first task.**
`document.test.ts` builds every fixture from the live `DOCUMENT_VERSION` constant, so flipping that
constant converts the entire v1 suite into a v2 suite rather than leaving a regression test behind —
the tests would keep passing while testing nothing about v1. The guide's two examples are the only
literal v1 documents in the repo, and FR-004 updates those.

#### Acceptance Criteria:

- [ ] `DOCUMENT_VERSION` is 2, and an exported document says `"version": 2`
- [ ] **A frozen v1 corpus exists** at `src/shared/__fixtures__/v1/`, as `.json` files with the
      literal `"version": 1` **hard-coded and never referencing `DOCUMENT_VERSION`** — that literal
      is the entire point, and a fixture built from the constant is not a fixture. It covers
      nesting, collapse, connections, omitted-at-default fields and the id-pattern edges
- [ ] Every corpus file imports, and the **`fromDocument` record set** is asserted — not the parsed
      document, whose `version` legitimately becomes 2. A parse that succeeds and produces different
      shapes is the failure this guards. The test lives at `src/shared/document-v1.test.ts`
- [ ] The corpus survives Phase 2 untouched and is **expected to go red in Phase 3**, when
      `fromDocument`'s return grows a `scenes` key. That is the corpus doing its job: the phase that
      changes the shape updates the expectation, and no other phase may
- [ ] A **v1** document carrying a `scenes` key is rejected, naming the **version**, not the key —
      by an **explicit check**, because the reorder alone silently ACCEPTS it and discards the
      author's scenes. After the reorder `version: 1` is supported, so the version gate passes; then
      `scenes` is a legal v2 key, so the key gate passes too. Measured on a build of this spec. The
      check is its own step, before the upgrade: `version === 1 && 'scenes' in raw`
- [ ] **The version check moves ahead of the unknown-key check**, which is a reorder of two existing
      checks, not a description of today. Today unknown keys are rejected first, so a v1 document
      with `scenes` would report `document.scenes: unknown key` once `scenes` joins the allowed set.
      The criterion above cannot be met without the reorder, and **three** pinned assertions change
      with it, not two: `document.test.ts`'s version and unknown-key messages, and
      `DiagramIOPanel.test.tsx`, which pins `document.scenes: unknown key` as its example of a
      path-naming error and appears in no phase's file list otherwise
- [ ] A version this build does not know — 3, 0, `"2"` — is rejected with
      `document.version: expected 1 or 2, got 3`. The wording is pinned here rather than left open,
      because SPEC-007 pinned every other message character-for-character and a gap reads as
      oversight rather than latitude
- [ ] The v1-with-scenes rejection reads `document.version: scenes requires version 2`
- [ ] The upgrade is a pure function over the parsed document, unit-tested with no Editor

### FR-002: Scenes in the schema, validated as strictly as everything else

#### Description:

A scene in a document carries what SPEC-008's record carries, minus the machinery: a name, a note,
which nodes read as folded, and what is highlighted.

**Scene ids are their own namespace**, deliberately not shared with nodes and connections. The
node/connection namespace is shared because both mint `shape:<id>`, so a collision means one record
overwriting another (`document.ts` says exactly this). A scene mints `diagramScene:<id>` — a
different record type in a different id space — so a scene named `auth` beside a node named `auth`
overwrites nothing. Sharing the namespace anyway would buy tidiness and cost correctness: a room can
legitimately hold both today, and an export that then refused its own room would break FR-003.

#### Acceptance Criteria:

- [ ] `scenes` is optional and defaults to `[]`, as `nodes` and `connections` already do
- [ ] A scene id must match `DOCUMENT_ID_PATTERN` and be unique **among scenes**; a scene id equal
      to a node or connection id is **accepted**, with a test saying so, because the reverse would
      make a legal room unexportable
- [ ] Each of these is rejected with a message naming its path, each with its own test: a missing or
      non-string `name`; a non-string `note`; a non-object `collapsed`; a non-boolean value in it; a
      non-array `highlighted`; a non-string entry in it; an unknown key on a scene
- [ ] **Two distinct errors for a bad `collapsed` key**, because they are two different authoring
      mistakes: `scenes[0].collapsed["x"]: no node with id "x"` when nothing has that id, and
      `scenes[0].collapsed["x"]: names a connection, which cannot be collapsed` when it names one.
      Both are one lookup against structures `parseDocument` already builds
- [ ] Every entry in `highlighted` must name a node **or** a connection in this document; a dangling
      entry is rejected with its path
- [ ] Scene order is the array's order. The record's fractional `index` is generated on import, and
      is not a document field — a list is already ordered, and carrying both gives the format two
      places to disagree

### FR-003: Export and import, with scenes replaced

#### Description:

Export carries the room's scenes. Import replaces them, exactly as it replaces the diagram — settled
2026-09-05. A document is the whole artifact, so pasting a revised one revises the whole thing.

**Export must never emit a document its own validator rejects**, which is the property SPEC-007
exists to hold and the one scenes most easily break. A scene can legitimately name things the
document cannot carry: SPEC-008 deliberately keeps *stale* scenes rather than deleting them, and
SPEC-007's `documentable` rule drops nodes parented into tldraw shapes and connections bound at one
end. The rule that closes it is the one already in the codebase:

> **A scene's references are filtered against what the document ACTUALLY CARRIES** — its exported
> nodes for `collapsed` keys, and its exported nodes *and connections* for `highlighted`. A reference
> the document does not carry is dropped from the scene; the scene itself survives, possibly naming
> nothing. A scene naming nothing is legal — SPEC-008 calls it empty, not stale.

**Not "the `documentable` set", which is nodes only.** `documentableNodeIds` returns node ids;
connections are filtered separately, inside `toDocument`'s own loop. Filtering `highlighted` through
the node set drops **every** connection highlight, including valid ones — a silent data loss that
every one of the four criteria below still passes, because all four are *drop* cases. The criterion
that catches it is the fifth.

#### Acceptance Criteria:

- [ ] Export emits every scene in the room, with node and connection ids stripped of the `shape:`
      prefix as SPEC-007 already does
- [ ] **Undocumentable references are dropped, and the result still validates.** Four cases, each
      with its own test, each fed straight back through `parseDocument`: a scene naming a node that
      no longer exists; a scene naming a node parented into a tldraw shape; a scene highlighting a
      half-bound connection; and a room of scenes with no diagram at all
- [ ] **A surviving CONNECTION highlight is kept.** The case the four above cannot see, and the one
      a builder following "the documentable set" would silently break
- [ ] **Export is deterministic in the presence of an index tie.** Scenes sort by `(index, id)` under
      plain `<` — the same comparator nodes and connections use, and for the reason
      `decisions.md` → *Derived views are computed, never materialized* gives: ties break on a total
      order over data both clients already have. Asserted by exporting two scenes that share an index
- [ ] **`note`, `collapsed` and `highlighted` are omitted at their defaults** (`''`, `{}`, `[]`), one
      rule for all three, matching the node's. Stated because it sets the baseline for every
      byte-identity expectation below
- [ ] Two exports of an unchanged room are byte-identical, scenes included
- [ ] Import **replaces** every scene in the room, asserted by enumerating the scene records before
      and after, not by counting
- [ ] **One undo restores the scenes too.** The import's scene writes — both the removal of the old
      and the creation of the new — go inside `importDocument`'s existing `editor.run()`, after its
      existing history mark, as **direct store writes** rather than through SPEC-008's
      `sceneView.ts` mutations. Those are deliberately history-ignored so narration never interleaves
      with diagram edits; an import is a diagram edit, and this is the one place that exception is
      made. Stated because a builder reaching for the existing mutation would silently lose the undo
- [ ] **Indices are minted by the CLIENT adapter, not by `fromDocument`.** `fromDocument` returns
      scenes in array order with no index at all; `documentIO.ts` assigns them with tldraw's own
      index helpers as it creates the records. Stated this way because the obvious alternative --
      generating them in `src/shared/document.ts`, which has no `tldraw` import -- produces a
      DIFFERENT ordering alphabet from the one the client mints with, so a scene created after an
      import interleaves wrongly. Measured: a naive `a${i+1}` also breaks outright at ten scenes,
      since `'a10' < 'a2'`
- [ ] Array order in is array order out, asserted on **twelve** scenes — the count at which a
      plausible index scheme first scrambles and a three-scene test still passes
- [ ] A round trip is exact: export, import, export again yields an identical document
- [ ] The imported scenes reach a second client, and both clients' scene records match
- [ ] **The import confirmation counts scenes.** Added during the build (2026-09-06), because the
      existing gate is `onPage - (nodes + connections)` and scenes are not page shapes — so a room
      with six hand-authored scenes and nothing undocumentable was replaced with no confirmation at
      all, and the dialog copy spoke only of shapes. This applies the settled "everything, but ask
      first" decision rather than making a new one; it is recorded here because it is behaviour no
      other criterion covers.

### FR-004: The guide teaches scenes

#### Description:

The authoring guide is what a model is handed. A scenes key it does not describe is a key no model
will write.

#### Acceptance Criteria:

- [ ] The guide documents every scene field and no field the schema lacks, and states that scenes are
      **replaced** on import
- [ ] It explains what a scene is **for** — a diagram plus a sequence of scenes is a walkthrough, and
      the scenes worth writing are the ones that change what is folded
- [ ] It says a scene is a **lens**: stepping never changes the diagram, so an author should not
      expect a scene to "set" anything
- [ ] It carries a worked example with scenes, imported by the existing extraction test
- [ ] **The deferred-key guard is narrowed, not deleted.** `guide-examples.test.ts` currently asserts
      that no ` ```json ` block contains `"scenes"` — it is SPEC-007's "does not present a deferred
      feature as available" check. `scenes` leaves that list; the other five keys stay, and the guard
      keeps earning its place
- [ ] **Every fenced block declares the current version** — ` ```json ` *and* ` ```ts `, the latter
      being the one the extraction test deliberately skips and therefore the only place an old number
      can hide. Scoped to fenced blocks on purpose: a guide satisfying FR-001 must tell authors their
      v1 documents still work, so a sweep over PROSE would fire on correct writing. Asserting merely
      that the guide "names the current version" would pass on any coordinate in any example

---

## Data Model

```ts
// src/shared/document.ts

export const DOCUMENT_VERSION = 2
/** Versions this build can read. The rejection message names the range. */
export const SUPPORTED_DOCUMENT_VERSIONS = [1, 2]

export interface DiagramDocument {
  version: number
  nodes: DocumentNode[]
  connections: DocumentConnection[]
  scenes: DocumentScene[]
}

/**
 * What `toDocument` consumes, as a FOURTH and OPTIONAL trailing parameter --
 * optional because ~20 existing three-argument call sites would otherwise break,
 * and a required parameter added for one caller is a change to every test that
 * has nothing to do with scenes.
 *
 * Not SPEC-008's `SceneRecord`: that extends `BaseRecord` from `@tldraw/store`,
 * and `document.ts` deliberately imports no tldraw package at all.
 */
export interface ExportableScene {
  /** The raw `diagramScene:...` id; the prefix is stripped into the document. */
  id: string
  name: string
  note: string
  collapsed: Record<string, boolean>
  highlighted: string[]
  index: string
}

export interface DocumentScene {
  /** Unique among SCENES. May equal a node or connection id -- see FR-002. */
  id: string
  name: string
  /** Optional; defaults to ''. */
  note?: string
  /** Node ids that read as folded (or explicitly open) while this scene is active. */
  collapsed?: Record<string, boolean>
  /** Node or connection ids to accent. */
  highlighted?: string[]
}
```

**No `index`.** SPEC-008's record carries a fractional sort key; a document carries an array, and an
array is already ordered. Import generates the indices from array position; export sorts by
`(index, id)` and reads them back into order.

## API / Interface Contract

```ts
// src/shared/document.ts -- the upgrade is pure and testable without an Editor.

/**
 * A v1 document, as v2: the same document plus an empty scenes array.
 *
 * Trivial on purpose. The criterion that matters is not that this is clever, it
 * is that the FROZEN v1 CORPUS imports to an identical record set -- and that
 * corpus is the thing this spec has to build, because none exists.
 */
function upgradeV1(document: Record<string, unknown>): Record<string, unknown>

// parseDocument's signature is unchanged: raw text in, the whole document or a
// message out. Inside, the order of the first two checks CHANGES:
//
//   before: unknown top-level key  ->  version
//   after:  version  ->  upgrade if v1  ->  unknown top-level key
//
// That reorder is what lets a v1 document carrying `scenes` be rejected by
// VERSION rather than by key, once `scenes` is a legal v2 key. Two currently
// pinned messages change with it.
export function parseDocument(input: string): ParseResult

/** Exported, because FR-001 requires it unit-tested directly. */
export function upgradeV1(document: Record<string, unknown>): Record<string, unknown>

// Scenes arrive as a TRAILING OPTIONAL fourth parameter.
export function toDocument(
  nodes: readonly ExportableNode[],
  connections: readonly ExportableConnection[],
  bindings: readonly BindingDescriptor[],
  scenes?: readonly ExportableScene[],
): DiagramDocument

// fromDocument returns scenes WITHOUT an index, in array order; the client
// adapter mints indices (FR-003). Its return type gains a `scenes` key -- a
// change the v1 corpus test must expect, since it asserts on the record set
// exactly. It goes red in the phase that adds the key, not the one that bumps
// the version.
export function fromDocument(
  document: DiagramDocument,
  pageId: string,
): {
  nodes: ExportableNode[]
  connections: ExportableConnection[]
  bindings: BindingDescriptor[]
  scenes: Omit<ExportableScene, 'index'>[]
}
```

```ts
// src/client/documentIO.ts

// exportDocument reads the room's scene records and passes them to toDocument,
// which filters their references through the SAME `documentable` set the nodes
// and connections go through. That is what keeps export from emitting a
// document parseDocument would reject.
//
// importDocument removes every scene record and writes the document's, both
// inside its EXISTING editor.run() and after its EXISTING history mark, as
// direct store writes. Not through sceneView.ts's mutations: those are
// history-ignored by design, and an import must be undoable in one step.
```

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/
│   ├── document.ts                 # version 2, scenes, the upgrade, the reorder
│   ├── document.test.ts            # + the reordered messages, the new rejections
│   ├── guide-examples.test.ts      # the deferred-key guard narrowed; version check
│   └── __fixtures__/v1/            # NEW -- the frozen corpus, literal "version": 1
│       ├── minimal.json
│       ├── nested-collapsed.json
│       └── connections-and-defaults.json
└── client/
    └── documentIO.ts               # scenes exported and replaced, in one recorded change
docs/
└── ai-authoring-guide.md           # a scenes section and a worked example
e2e/
├── document-io.spec.ts             # + FR-003's scene criteria, AND its five hard-coded
│                                   #   `version: 1` literals bumped -- none of them break,
│                                   #   which is the problem: the import suite would
│                                   #   silently become a v1 suite
└── (src/client/panels/DiagramIOPanel.test.tsx pins a message that changes)
```

## Implementation Phases

### Phase 1: The v1 corpus, before anything else
- `src/shared/__fixtures__/v1/` and the test that imports each file and asserts the **record set**
- Written and green **while `DOCUMENT_VERSION` is still 1**, so it is proved to describe v1 before
  v1 stops being the current version. A corpus written after the bump asserts whatever the new code
  does

### Phase 2: Version 2 and the upgrade
- `DOCUMENT_VERSION = 2`, `SUPPORTED_DOCUMENT_VERSIONS`, `upgradeV1`
- The check reorder, and the two pinned messages that change with it
- The corpus from Phase 1 still green — which is the point of doing it first

### Phase 3: The scenes key
- `DocumentScene`, its validation, the two `collapsed` errors, the scene-only id namespace
- `toDocument`/`fromDocument` carrying scenes, references filtered through `documentable`, indices
  generated from array position, export sorted by `(index, id)`

### Phase 4: Export, import, the guide and proof
- `documentIO.ts`: scenes exported; scenes replaced inside the existing recorded change
- The guide's scenes section and worked example; the narrowed deferred-key guard; the version sweep
- FR-003's e2e, including the second client, the single undo, and the four undocumentable cases
