# Spec: Frames in the JSON document

**ID:** SPEC-009  
**Status:** Draft  
**Last Updated:** 2026-09-05  
**Depends On:** SPEC-007, SPEC-008

## Overview

SPEC-007 made a diagram pasteable. SPEC-008 made it narratable. This spec joins them: a document
carries its **frames** as well as its nodes and connections, so what you hand to a colleague — or ask
a model to write — is a walkthrough rather than a picture.

That is the point of the whole arc. "Write me a four-frame tour of this auth system, starting from
the outside" is a request a model can answer only if frames are part of the format.

The cost is a **version 2**, because SPEC-007's document is `version: 1` and rejects unknown keys —
deliberately, so an author who writes `frames` today is told it does nothing rather than being
ignored. Making that key real means every existing document must still import, which is what most of
this spec is about.

## Scope

### In Scope

- `DOCUMENT_VERSION = 2` and a `frames` key
- Accepting a **v1** document unchanged, by upgrading it on the way in
- Exporting frames, deterministically, alongside nodes and connections
- Importing frames: they **replace** the room's frames, as the diagram does (settled 2026-09-05)
- Strict validation of the new key, on the same terms as everything else
- The authoring guide gaining a frames section, with its examples proved by the existing tests

### Out of Scope

- **Any change to what a frame IS.** SPEC-008 owns the record, the lens and the surface. This spec
  carries the same fields through a different medium; if it wants a new field, that is SPEC-008's
  spec to change and not this one's.
- **A document that carries frames but no diagram.** Frames name node ids, so a frames-only document
  either names nothing that exists or is a diagram in disguise. Rejected as unresolvable rather than
  silently importing a set of empty frames.
- **Downgrading.** There is no v2 → v1 export. A tool that reads v1 and is handed v2 should say so;
  writing a lossy downgrade nobody asked for is how a format acquires two truths.
- **Which frame you are viewing.** That is session state SPEC-008 deliberately keeps out of the
  store's document scope, and it is not part of a shared artifact.

---

## Functional Requirements

### FR-001: Version 2, and every v1 document still imports

#### Description:

The version bump is the whole risk. Documents exist in chats, in repos and in files; a format that
breaks them is worse than a format that never grew.

A v1 document is **upgraded on the way in**: it means exactly what it meant before, plus no frames.
The upgrade is a function of the document, not of the app's state.

#### Acceptance Criteria:

- [ ] `DOCUMENT_VERSION` is 2, and an exported document says `"version": 2`
- [ ] A document with `"version": 1` and **no** `frames` key is accepted and imports identically to
      the way it did before this spec — asserted by importing SPEC-007's own fixtures and comparing
      the resulting record set
- [ ] A **v1** document carrying a `frames` key is **rejected**, naming the version: `frames` did not
      exist at v1, and silently accepting it would make the version number decorative
- [ ] A document with a version this build does not know — 3, or 0, or `"2"` — is rejected with a
      message naming both what it got and what it supports, since the reader may be an author whose
      tool is newer than this one
- [ ] The upgrade is a pure function over the parsed document, unit-tested with no Editor, and every
      v1 test in `document.test.ts` still passes against it

### FR-002: Frames in the schema, validated as strictly as everything else

#### Description:

A frame in a document carries what SPEC-008's record carries, minus the machinery: a name, a note, an
order, which nodes read as folded, and what is highlighted. Ids follow the same rules the rest of the
document already enforces, and references are checked.

#### Acceptance Criteria:

- [ ] `frames` is optional and defaults to `[]`, as `nodes` and `connections` already do
- [ ] Frame ids join the document's **one id namespace** — a frame id may not collide with a node id
      or a connection id, for the same reason those two may not collide with each other
- [ ] Every key in a frame's `collapsed` map, and every entry in its `highlighted` list, must name a
      node or connection **in this document**; a dangling reference is rejected with its path
- [ ] `collapsed` keys must name a node specifically — a connection cannot be collapsed, and naming
      one is an authoring error worth catching rather than ignoring
- [ ] Frame order is explicit in the array and does not depend on an `index` field: the document is a
      list, and a list is already ordered. The record's fractional `index` is generated on import
- [ ] Every rejection has its own test asserting the **message**, matching FR-001's treatment in
      SPEC-007

### FR-003: Export and import, with frames replaced

#### Description:

Export carries the room's frames. Import replaces them, exactly as it replaces the diagram — settled
2026-09-05. A document is the whole artifact, so pasting a revised one revises the whole thing.

#### Acceptance Criteria:

- [ ] Export emits every frame in the room, in its current order, with node ids stripped of the
      `shape:` prefix as SPEC-007 already does for nodes and connections
- [ ] Two exports of the same room are byte-identical, including the frames — the determinism
      criterion SPEC-007 established, extended to the new key
- [ ] Import **replaces** every frame in the room. Asserted by enumerating the frame records before
      and after, not by counting
- [ ] **One undo restores the frames too.** SPEC-008 makes frame authoring history-ignored, so an
      import that deleted frames outside the history stack would be unundoable — the import's frame
      writes therefore ride the same recorded change as its shape writes
- [ ] The **confirmation** SPEC-007 shows counts shapes the document cannot describe; frames are now
      describable, so a room whose only extra content is frames imports without one
- [ ] A round trip is exact: export, import, export again yields an identical document, frames
      included
- [ ] The imported frames reach a second client in the room, and both clients' frame records match

### FR-004: The guide teaches frames

#### Description:

The authoring guide is what a model is handed. A frames key it does not describe is a key no model
will write.

#### Acceptance Criteria:

- [ ] The guide documents every frame field and no field the schema lacks, and states that frames
      are replaced on import
- [ ] It explains what a frame is **for** — that a diagram plus a sequence of frames is a walkthrough,
      and that the useful frames are the ones that change what is folded
- [ ] It carries at least one worked example with frames, and that example is imported by the
      existing extraction test, which already covers every ` ```json ` block
- [ ] It says a frame is a **lens**: stepping through frames never changes the diagram, so an author
      should not expect a frame to "set" anything
- [ ] The guide's version number is updated everywhere it appears, and a test asserts the guide names
      the current `DOCUMENT_VERSION` — a guide that teaches the old version is worse than one that
      teaches nothing

---

## Data Model

```ts
// src/shared/document.ts

export const DOCUMENT_VERSION = 2

export interface DiagramDocument {
  version: number
  nodes: DocumentNode[]
  connections: DocumentConnection[]
  frames: DocumentFrame[]
}

export interface DocumentFrame {
  /** In the document's ONE id namespace, alongside nodes and connections. */
  id: string
  name: string
  /** Commentary shown while the frame is active. Optional; defaults to ''. */
  note?: string
  /**
   * Node ids that read as folded (or explicitly open) while this frame is
   * active. Keys must name NODES in this document -- a connection cannot fold.
   */
  collapsed?: Record<string, boolean>
  /** Node or connection ids to accent. */
  highlighted?: string[]
}
```

**No `index`.** SPEC-008's record carries a fractional sort key; a document carries an array, and an
array is already ordered. Import generates the indices, export reads them back into order. Carrying
both would give the format two places to disagree about what order the frames are in.

## API / Interface Contract

```ts
// src/shared/document.ts -- the upgrade is pure and testable without an Editor.

/**
 * A v1 document, as v2. Pure: a function of the document, never of app state.
 *
 * v1 is v2 with no frames, so this adds an empty array and nothing else -- which
 * is exactly why the criterion that matters is that v1 documents import
 * IDENTICALLY, not that the upgrade is clever.
 */
function upgradeV1(document: unknown): unknown

// parseDocument's signature is unchanged: it takes raw text and returns the
// whole document or a message. The upgrade happens inside it, after the version
// is read and before anything else is validated -- so every rule downstream is
// written against v2 only, and there is one shape in the codebase rather than
// two.
export function parseDocument(input: string): ParseResult
```

**The frame records import inside the same recorded change as the shapes.** SPEC-008 makes frame
authoring history-ignored so that narration edits never interleave with diagram edits on the undo
stack — but an *import* is a diagram edit, and its frame writes must be undone with it. That is a
deliberate exception, and the criterion in FR-003 is what holds it.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
└── shared/
    ├── document.ts        # version 2, the frames key, the upgrade, the conversions
    └── document.test.ts   # + the v1 corpus, the new rejections, the upgrade
src/client/
└── documentIO.ts          # export reads frames; import replaces them, in the same change
docs/
└── ai-authoring-guide.md  # a frames section and a worked example
e2e/
└── document-io.spec.ts    # + the frame criteria from FR-003
```

## Implementation Phases

### Phase 1: Version 2 and the upgrade
- `DOCUMENT_VERSION = 2`, `upgradeV1`, the version rejections
- **The v1 corpus first**: every existing document fixture, asserted to import identically, before
  any new field exists. It is the criterion most likely to be quietly broken by later phases

### Phase 2: The frames key
- `DocumentFrame`, its validation, the id namespace, the reference checks
- `toDocument`/`fromDocument` carrying frames, with indices generated on the way in

### Phase 3: Export, import and the undo
- `documentIO.ts`: frames in the export; frames replaced on import, inside the shapes' recorded
  change so one undo covers both
- The confirmation no longer counting frames as undescribable

### Phase 4: The guide, and proof
- The guide's frames section and worked example, picked up by the existing extraction test
- The e2e criteria from FR-003, including the second client and the single undo
