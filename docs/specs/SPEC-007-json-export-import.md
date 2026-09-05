# Spec: JSON export/import and the AI-authoring schema

**ID:** SPEC-007  
**Status:** Draft  
**Last Updated:** 2026-09-05 (rev 2 — post-review)  
**Depends On:** SPEC-004, SPEC-005, SPEC-006

## Overview

A diagram that only exists inside a room is a diagram you cannot hand to anyone, check into a repo,
diff, or ask a model to write for you. This spec gives the tool a **document**: a plain JSON
representation of a diagram that can be copied out, pasted in, and authored by hand or by an AI that
has never seen the codebase.

The predecessor already had this and it is the one part of it the user names a must-have. It is also
the most portable thing it built — the schema describes a graph, not a rendering, so the ideas
survive the change of foundation. What does not survive is its **validation**, which was deliberately
loose: a bad reference did not error, it silently rendered wrong. The predecessor's own authoring
guide warns the author about this in prose, which is the wrong place for it.

## Scope

### In Scope

- A versioned document schema, declared once in `src/shared/` and validated strictly
- Export: the current page as a document, deterministic enough that two exports of the same diagram
  are byte-identical
- Import: replacing the page's contents in one undoable step, behind a confirmation when that would
  destroy hand-drawn work, and rejecting an invalid document before touching the store
- A copy/paste surface that works on an iPad, including where the Clipboard API does not exist
- An AI-authoring guide, with its worked examples proven to import by a test

### Out of Scope

- **Frames and narration.** SPEC-008's subject. The document gains a `frames` key there; this spec
  does not reserve one, because an empty array nothing reads is a field authors will fill in and
  wonder why nothing happens.
- **Node `metadata`.** The predecessor carried `Record<string, string>` on nodes and edges, feeding
  edge captions and node-lens grouping — both deferred (`architecture.md` → Deferred / Non-goals).
  Carrying data no code reads invites authors to write it. Seam: a `metadata` prop on the node shape
  plus a migration, added with its first consumer.
- **Edge sets, actors/actions/triggers, sticky notes, icons, `autoLayout`, `colorPalette`.** Same
  reasoning; all are recorded as deferred already.
- **Z-order.** A node's `index` — its fractional sort key among siblings — is **not** carried, so a
  round trip may reorder overlapping nodes. Stated because the round trip is otherwise exact and a
  silent exception to that is worse than a documented one. `rotation` **is** carried, because nodes
  are rotatable today and losing a rotation is visible. Seam for z-order: an integer `order` field,
  worth adding only if overlap turns out to matter.
- **File download and file picker.** The transport is a text box plus the clipboard — see FR-004.
- **Merging an imported document into an existing diagram**, and **importing into a fresh room**.
  Import replaces the current page (settled 2026-09-05). Opening a new room first and importing there
  gets the non-destructive behaviour with one extra step.
- **Any change to how shapes render or behave.** This spec reads and writes records; it adds no
  shape type, no prop, and no migration to the store.

---

## Functional Requirements

### FR-001: A document schema, declared once and validated strictly

#### Description:

The document is a plain JSON object describing nodes and connections. It is declared in
`src/shared/` beside the shape definitions, and it carries its own `version` — the store's record
migrations do not cover it, because a document can be written by hand a year from now and pasted
into a build that has moved on.

Validation is **strict and total**: a document is either accepted whole or rejected with a message
naming what is wrong and where. This is the deliberate reversal of the predecessor, whose importer
checked only that four keys were arrays and left every referential invariant to the author.

#### Acceptance Criteria:

- [ ] The schema, its validator and the current `version` constant live in one module under
      `src/shared/`, with no `tldraw` import, inside the allowlist `shared-imports.test.ts` enforces
- [ ] A valid document is accepted and the parsed result is typed, not `unknown`
- [ ] Each of these is rejected with a message naming the offending path (e.g. `nodes[2].parentId`),
      and each has its own test: malformed JSON; a missing or unknown `version`; a `parentId` naming
      no node in the document; a connection `sourceId` or `targetId` naming no node; a `parentId`
      cycle; a wrong type on any field
- [ ] **Ids are one namespace, and duplicates are rejected across it.** A node id used twice, a
      connection id used twice, **and a connection id equal to a node id** are each rejected, each
      with its own test. Nodes and connections both mint `shape:<id>`, so a collision between them
      is not a naming preference — the second `createShape` replaces the first record and the
      surviving shape is then bound as though it were a node
- [ ] An id not matching `^[A-Za-z0-9_.-]{1,128}$` is rejected. Stated honestly: tldraw itself
      validates only the `shape:` prefix and would accept far more, so this is a **deliberate
      narrowing**, not a platform limit. It has one concrete hazard behind it — tldraw interpolates
      a shape id into a `[data-shape-id="…"]` selector, which throws on an embedded quote — and
      otherwise buys ids that are safe in URLs, filenames and prose
- [ ] Rejection is **total** — a document with two independent errors reports at least the first,
      and no partially-valid document is ever returned
- [ ] A node with no `parentId` and a node with one are both valid; `parentId` is optional and
      absent means top-level

### FR-002: Export produces a stable document

#### Description:

Exporting reads the page's records and produces a document. Two exports of the *same diagram built
in a different order* must be identical byte for byte, or the format is useless for diffing and the
round-trip criterion cannot be stated.

#### Acceptance Criteria:

- [ ] Every `diagramNode` on the page appears once, carrying its id, label, position, size,
      rotation, color, collapsed state, and `parentId` when it has a shape parent
- [ ] A child's position is **relative to its parent**, exactly as the record stores it, and a
      top-level node's is absolute — asserted on a nested diagram, because silently absolutising
      one or the other is the error this criterion exists to catch
- [ ] Every `diagramConnection` with both terminals bound appears once as `{ id, sourceId, targetId }`
- [ ] A connection with fewer than two bindings — the mid-drag state — is **omitted**, not exported
      with a null terminal
- [ ] **Ordering is by document id, not by record order.** Asserted by building the same logical
      diagram **twice, in two different creation orders**, and comparing the two exported strings.
      Exporting one diagram twice is not the test: the store does not change between the calls, so
      an implementation that iterates insertion order passes it. tldraw's `getCurrentPageShapesSorted`
      sorts by a fractional index derived from creation order and is exactly the wrong call here
- [ ] Hidden shapes are exported. A collapsed container exports `collapsed: true` **and** its hidden
      descendants; a connection hidden by merging (SPEC-006) is exported too. Read the page's shapes,
      never `getCurrentPageRenderingShapesSorted`, which filters both hidden and off-screen shapes —
      an export that dropped either would make collapse and scrolling destructive

### FR-003: Import replaces the page, in one undoable step, behind a confirmation

#### Description:

Importing validates the whole document, then clears the page and builds the diagram. Settled
2026-09-05: replace rather than merge or redirect, so the author-revise-repaste loop works in place.

**Replacing means the whole page, including hand-drawn work** — freehand strokes, text, notes and
tldraw's own shapes, all of which this tool ships and none of which the document can represent. On a
tool whose premise is sketching with a pencil, that is not something to do silently, so a
confirmation naming what would be lost stands in front of it. Settled 2026-09-05, after the first
draft of this spec omitted the case entirely.

Nothing is written until validation passes and the confirmation is answered, and everything is
written inside one history entry, so a mistaken import is one undo away rather than a cleanup job.

#### Acceptance Criteria:

- [ ] Importing a document into an empty room produces exactly its nodes and connections, with
      hierarchy, positions, sizes, rotations, colors and collapsed state intact
- [ ] Importing into a room holding only `diagramNode`/`diagramConnection` shapes proceeds with **no
      confirmation** and leaves only the imported diagram — asserted by enumerating the full record
      set, not by counting. The common case in the author-revise-repaste loop stays one step
- [ ] Importing into a room that also holds shapes the document cannot represent shows a
      confirmation **naming how many** would be deleted, and importing proceeds only on confirm
- [ ] Dismissing that confirmation leaves the store completely untouched and keeps the pasted text
- [ ] A single undo after an import restores the page to exactly its prior record set, also
      enumerated — including the hand-drawn shapes the import deleted
- [ ] An **invalid** document never reaches the store: the paste-and-confirm path calls
      `parseDocument` first and stops on rejection, asserted by driving that path with bad JSON and
      enumerating the record set before and after. Asserted through the panel, not through
      `importDocument`, whose signature makes an invalid document unrepresentable and the criterion
      therefore vacuous
- [ ] Author-chosen ids survive: a hand-written document using `"web-server"` as a node id produces a
      shape whose exported id is `"web-server"` again, so a document is not rewritten by the act of
      loading it
- [ ] A document whose ids collide with shapes already in the room imports cleanly, because the page
      is cleared first
- [ ] The imported diagram reaches a second client in the room, and both clients' record sets match

### FR-004: A copy/paste surface that works on an iPad

#### Description:

The transport is a text box, with the clipboard as an enhancement on top of it — not the other way
round. `navigator.clipboard` requires a secure context, and `architecture.md` → Known Constraints
already records that the dev URL is plain `http` over a LAN IP, where `window.isSecureContext` is
false. On the actual target device, over the actual URL, the manual path is the **only** path, so it
is the one the panel is designed around.

#### Acceptance Criteria:

- [ ] The panel always shows the current diagram's JSON in a selectable text box, with no clipboard
      API involved, and that text parses back to an equal document
- [ ] A copy control copies it when the Clipboard API is available; when it is not, the control says
      so rather than appearing to work, and the text box remains the route
- [ ] The **manual** path is the one asserted end to end: reading the JSON out of the box and pasting
      it into a second room reproduces the diagram. A test that only exercises `navigator.clipboard`
      tests a path the target device does not have
- [ ] Pasting a document into the box and confirming imports it
- [ ] A rejected import shows the validator's message **in the panel**, keeps the pasted text so it
      can be corrected rather than retyped, and leaves the canvas untouched
- [ ] The panel's controls are at least 44×44, the touch target size SPEC-004 established
- [ ] The panel is reachable by keyboard and its controls are labelled, per
      `docs/best-practices/accessibility/accessibility.md`

### FR-005: An authoring guide an AI can be handed cold

#### Description:

A document at `docs/ai-authoring-guide.md`, written to be pasted into a prompt: the schema, the
invariants, and the advice that makes a diagram good in *this* tool rather than merely valid — above
all that nesting plus collapse is the structural device the tool is built around.

The predecessor's guide is the source. It is edited down to what this tool actually has, not copied:
a guide describing deferred features is worse than no guide, because an author cannot tell which half
is real.

#### Acceptance Criteria:

- [ ] The guide documents every field in the schema and no field the schema does not have, and states
      what a round trip does **not** carry (z-order), since that is a loss no field list reveals
- [ ] It states the referential invariants and that they are **enforced**, correcting the
      predecessor's guidance that the author is responsible for them
- [ ] **Every ` ```json ` fenced block in the guide is extracted by a test, validated, and imported.**
      The fence tag is the contract: a ` ```json ` block must be a whole importable document, and
      every schema fragment or partial example uses ` ```ts ` instead. Stated because the
      predecessor's guide has eight fenced blocks of which exactly one is a whole document, so
      "every JSON example" is not a mechanically decidable rule and this is
- [ ] It carries at least one worked example that uses nesting and collapse, since a guide that only
      shows a flat graph teaches the wrong thing about this tool
- [ ] It does not describe frames, edge sets, actors, metadata or icons as available

---

## Data Model

```ts
// src/shared/document.ts -- one declaration, no tldraw import.

export const DOCUMENT_VERSION = 1

/** Ids are one namespace across nodes AND connections -- both mint `shape:<id>`. */
export const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/

export interface DiagramDocument {
  version: number
  nodes: DocumentNode[]
  connections: DocumentConnection[]
}

export interface DocumentNode {
  id: string
  label: string
  /** Relative to `parentId` when set, absolute otherwise -- as the record stores it. */
  x: number
  y: number
  w: number
  h: number
  /** Radians, as tldraw stores it. Omitted on export when 0. */
  rotation?: number
  /** Omitted on export when it equals the shape's default. */
  color?: string
  collapsed?: boolean
  parentId?: string
}

export interface DocumentConnection {
  id: string
  sourceId: string
  targetId: string
}

/** Total: the whole document or a message. Never a partial result. */
export type ParseResult = { ok: true; document: DiagramDocument } | { ok: false; error: string }

export function parseDocument(input: unknown): ParseResult

// --- What the pure conversions consume and produce. Named here rather than in
// --- the contract below, because these four shapes are where the fidelity
// --- questions live: what a document carries is exactly what appears here.

export interface ExportableNode {
  id: string // the raw `shape:...` id; toDocument strips the prefix
  parentId: string // a shape id or a page id
  x: number
  y: number
  rotation: number
  props: { w: number; h: number; label: string; color: string; collapsed: boolean }
}

export interface ExportableConnection {
  id: string
  /** Null when that terminal is unbound; such a connection is omitted entirely. */
  sourceId: string | null
  targetId: string | null
}

export interface ShapeDescriptor {
  id: string // already `shape:<document id>`
  type: 'diagramNode' | 'diagramConnection'
  parentId?: string // omitted for a top-level node; the caller supplies the page id
  x: number
  y: number
  rotation: number
  props: Record<string, unknown>
}

export interface BindingDescriptor {
  type: 'connectionEndpoint'
  fromId: string
  toId: string
  props: { terminal: 'start' | 'end' }
}
```

**Ids are the tldraw shape id without its `shape:` prefix, and that is deliberate.** Import mints
`createShapeId(node.id)`, which produces exactly `` `shape:${id}` ``, and export strips the prefix —
so a hand-written `"web-server"` survives a round trip instead of being replaced by a generated id
the next export would emit. It also means the document needs no id-mapping table, and no second
identity for a shape to disagree with its first.

## API / Interface Contract

```ts
// src/shared/document.ts -- pure, both directions, injected records.
//
// Pure for the same reason hierarchy.ts and merge.ts are: unit-testable without
// an Editor, and unable to quietly reach for one. The client module below is a
// thin adapter and that is all it is.

export function toDocument(
  nodes: readonly ExportableNode[],
  connections: readonly ExportableConnection[],
): DiagramDocument

export function fromDocument(document: DiagramDocument): {
  shapes: ShapeDescriptor[]
  bindings: BindingDescriptor[]
}

// src/client/documentIO.ts -- the two adapters, and the ONLY place an Editor
// appears in this spec.
//
// importDocument clears the page and rebuilds it inside a single editor.run()
// after markHistoryStoppingPoint(), which is what makes FR-003's single-undo
// criterion true rather than approximately true.
//
// It takes an ALREADY-PARSED document: parseDocument is called by the panel, on
// the paste path, and nowhere else. That split is why FR-003's "invalid document
// never reaches the store" criterion is asserted through the panel -- through
// this signature it cannot fail.
export function exportDocument(editor: Editor): DiagramDocument
export function importDocument(editor: Editor, document: DiagramDocument): void

/** What the panel needs to decide whether to confirm (FR-003). */
export function undocumentableShapeCount(editor: Editor): number
```

**`fromDocument` returns shapes topologically ordered by `parentId`.** tldraw's `createShapes` does
accept a parent that appears elsewhere in the same batch, so this is not strictly forced by the API —
but the ordering is free, it keeps the function correct if the adapter ever creates in chunks, and
FR-001's cycle rejection is what makes it total.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/
│   ├── document.ts             # NEW -- schema, strict validator, both conversions
│   ├── document.test.ts        # NEW -- unit, no Editor
│   └── shapes/index.ts         # + re-export
└── client/
    ├── documentIO.ts           # NEW -- the Editor adapters
    └── panels/
        ├── DiagramIOPanel.tsx  # NEW -- JSON box, copy control, paste, confirm, errors
        └── DiagramIOPanel.test.tsx
docs/
└── ai-authoring-guide.md       # NEW -- ported down from the predecessor's
e2e/
├── document-io.spec.ts         # NEW
└── guide-examples.spec.ts      # NEW -- extracts and imports every ```json block in the guide
```

## Implementation Phases

### Phase 1: The schema and its validator
- `src/shared/document.ts`: types, `DOCUMENT_VERSION`, `DOCUMENT_ID_PATTERN`, `parseDocument`
- Unit tests for every rejection in FR-001, each asserting the **message**, not just the failure —
  a validator that rejects for the wrong reason gets "fixed" by changing the wrong thing

### Phase 2: The two conversions
- `toDocument` and `fromDocument`, including id-ordered output and the topological ordering
- Round-trip unit tests over plain records, no Editor, including the two-creation-orders case

### Phase 3: The adapters and the surface
- `src/client/documentIO.ts`, including `undocumentableShapeCount`
- `DiagramIOPanel`: the always-present JSON box, the degrading copy control, paste, the confirmation
  gate, the error surface, touch targets, keyboard and labelling
- Route through `docs/best-practices/INDEX.md` for the React and accessibility sections first

### Phase 4: The guide, and proof
- `docs/ai-authoring-guide.md`, edited down to what exists, with `json` fences reserved for whole
  documents
- `e2e/guide-examples.spec.ts` extracting every ` ```json ` block and importing it
- `e2e/document-io.spec.ts` for FR-002, FR-003 and FR-004's manual path, including the record-set
  enumerations, the confirmation gate in both directions, the single undo, and the second client

### Phase 5: Completion corrections
- `architecture.md` §5 currently says the predecessor's schema "survives the change of foundation
  nearly as-is". After this spec it does not: `edges` becomes `connections`, `position` becomes
  `x/y/w/h`, and `metadata`, `edgeSets`, `frames`, `icon`, `isActor`, `autoLayout` and
  `colorPalette` are all gone. Correct that prose as part of the completion ritual
