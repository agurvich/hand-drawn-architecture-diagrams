# Spec: Actors in the JSON document

**ID:** SPEC-012  
**Status:** Completed  
**Last Updated:** 2026-09-07 (rev 3 — built)  
**Depends On:** SPEC-009, SPEC-011

## Overview

SPEC-011 made a connection able to say **who performs it**. The format cannot carry that, so today an
attribution does not survive an export: copy a diagram out, paste it back, and every "performed by"
is gone. The guide says so in as many words, which is honest and not a substitute for fixing it.

This closes that. A connection gains an optional `actorId`, and a diagram round-trips whole.

It also makes actors something a **model can write**, which is the larger point. "Who does this?" is
usually the question being asked of an architecture diagram, and until the format carries the answer
a model can draw the boxes and the lines but not the part people care about.

The cost is a **version 3**, and the version-2 work is the template: a frozen corpus proving the old
format still means what it meant, a guard so an author who writes `actorId` at the wrong version is
told which mistake they made, and a guide section.

## Scope

### In Scope

- `DOCUMENT_VERSION = 3` and an optional `actorId` on a connection
- Accepting **v1 and v2** documents unchanged, by upgrading them on the way in
- **A frozen v2 corpus**, built by this spec — the v1 one exists, the v2 one does not
- Exporting attributions, and **never emitting a document the validator would reject**
- Importing them: the attribution binding is created alongside the endpoint bindings
- Strict validation of the new field, on the same terms as everything else
- The guide gaining an actors section, and **losing the paragraph that says the format cannot carry
  them** — which becomes false the moment this ships

### Out of Scope

- **Any change to what an attribution IS.** SPEC-011 owns the binding, its lifecycle and its
  rendering. This carries the same fact through a different medium.
- **Downgrading.** There is no v3 → v2 export, and a v2 build handed a v3 document reports
  `document.version: expected 1 or 2, got 3`. Nothing here reaches a build that already shipped.
- **`isActor` on a node.** SPEC-011 refused it as a stored form of a derivable fact and nothing has
  changed; a node is an actor because something attributes to it.
- **More than one actor per connection.** Still one line, one performer.

---

## Functional Requirements

### FR-001: Version 3, and every older document still imports

#### Description:

The same risk the version-2 bump carried, with one more version to keep working. The mechanism is
already in place — `SUPPORTED_DOCUMENT_VERSIONS`, `upgradeV1`, the reordered checks — so this is
mostly about proving the claim rather than building it.

**The v1 corpus alone is not enough evidence.** It proves v1 documents still parse; it says nothing
about v2, which is the version everything written since SPEC-009 uses, and the one most likely to
exist in a chat window right now.

#### Acceptance Criteria:

- [ ] `DOCUMENT_VERSION` is 3, `SUPPORTED_DOCUMENT_VERSIONS` is `[1, 2, 3]`, and an exported document
      says `"version": 3`
- [ ] **A frozen v2 corpus exists** at `src/shared/__fixtures__/v2/`, with the literal `"version": 2`
      hard-coded and never referencing the constant, covering scenes — including a scene whose
      `collapsed` and `highlighted` name real ids, since that is what v2 added
- [ ] Every v2 corpus file imports, and the **`fromDocument` record set** is asserted. The test lives
      beside the v1 one and shares its structure
- [ ] **Both corpora stay GREEN in every phase, and any edit to either `EXPECTED` blob is a
      defect.** Rev 1 borrowed SPEC-009's "goes red in exactly one phase" rule; it does not apply
      here, and saying it would send a builder looking for a redness that is not coming — or
      manufacturing one. `fromDocument`'s return gains no key, and no corpus file carries an
      `actorId`, so the blobs are byte-identical before and after. Staying green is the stronger
      claim and the true one
- [ ] **`upgradeV1` composes with the new upgrade rather than being replaced.** A v1 document must
      reach v3, and the natural mistake is an `upgradeV1` that jumps straight there, leaving two
      functions that both claim to produce "the current version" and disagree the next time one is
      added.
      **Proven by three assertions, because the obvious one cannot see it:**
      `document-v1.test.ts:374-378` asserts the parsed version equals the constant, which stays green
      under a jumping `upgradeV1`. What falsifies it is the existing unit test at `:383-390` pinning
      `upgradeV1(...)` to `version: 2` — kept — plus its new mirror pinning `upgradeV2(...)` to 3
      with content unchanged, plus one assertion that a v1 document through **both** lands at 3 with
      `scenes: []`
- [ ] A **v1 or v2** document carrying `actorId` is rejected naming the **version**, not the key, by
      an explicit check before the upgrade — the same shape as v2's `scenes` guard, and for the same
      reason: after the reorder the version gate passes and `actorId` is a legal v3 key, so without
      it the author's attribution is silently discarded
- [ ] The rejection reads `connections[0].actorId: requires version 3`. **Pathed to the connection,
      not to `document.version`** — unlike v2's scenes guard, which is a top-level key. An author who
      wrote it on one of forty connections needs to know which
- [ ] **The guard is DEFENSIVE about its own input**, because it runs before `connections` has been
      checked. The upgrade is at `document.ts:283` and `Array.isArray(rawConnections)` is not until
      `:293`, so a naive loop over `raw.connections` throws `connections is not iterable` on
      `{"version":1,"connections":5}` — an exception escaping a function whose contract
      (`document.ts:133`) is "the whole document or a message. Never a partial result". It skips
      anything that is not an array of objects and lets the existing checks report it, with a test
      for exactly that input
- [ ] **The order of the two version guards is pinned.** For a v1 document carrying both `scenes` and
      a connection `actorId`, one message wins and a test says which. `document.test.ts:148-155`
      exists because that question was once left implicit
- [ ] A version this build does not know is rejected with
      `document.version: expected 1 or 2 or 3, got 4`. The wording falls out of the existing
      `join(' or ')`; pinned here because the v2 spec pinned its own and a gap reads as oversight
- [ ] **`TOP_LEVEL_KEYS` is unchanged** — `actorId` is a CONNECTION key, so the union-of-all-versions
      hazard SPEC-009 recorded does not apply at the top level. It applies to `CONNECTION_KEYS`
      instead, and the guard above is what covers it

### FR-002: An attribution in the schema

#### Description:

`actorId` on a connection names the node that performs it. One field, and every rule the existing
reference fields already follow.

#### Acceptance Criteria:

- [ ] `actorId` is optional and omitted when absent — the same omit-at-default rule `note`,
      `collapsed` and `highlighted` follow, so an unattributed connection exports as it does today
- [ ] It must be a string matching `DOCUMENT_ID_PATTERN`, with its own test
- [ ] It must name a **node** in this document. A dangling id is rejected with its path; an id naming
      a **connection** is rejected with a different message, because those are two different
      authoring mistakes — the precedent scenes set with `collapsed`
- [ ] **A connection may be attributed to one of its own endpoints**, accepted with a test saying so.
      SPEC-011 accepts it on the canvas and a format that refused it would make a legal room
      unexportable
- [ ] **`CONNECTION_KEYS` is SPLIT before `actorId` goes anywhere near it.** That one array is doing
      two jobs today (`document.ts:363` as an allowlist, `:366-368` as a list of REQUIRED strings),
      so "grows by exactly one" would make `actorId` mandatory and reject
      `{"id":"a-b","sourceId":"a","targetId":"b"}` with `connections[0].actorId: must be a string`.
      Every v1 corpus file, three of the guide's examples and half of `document.test.ts` go red at
      once. The node loop already has the right shape — `NODE_KEYS` is allowlist-only and each field
      is checked on its own — and the connection loop follows it
- [ ] An unknown key on a connection is still rejected, by the allowlist half

### FR-003: Export and import

#### Description:

Export carries the attribution; import rebuilds the binding. The property SPEC-007 exists to hold —
export never emits a document its own validator rejects — is the thing most easily broken here,
because SPEC-011 deliberately keeps an attribution pointing at a node the document may not carry.

#### Acceptance Criteria:

- [ ] Export emits `actorId` with the `shape:` prefix stripped, as every other reference is
- [ ] **An attribution naming a node the document does not carry is DROPPED, and the result still
      validates.** Filtered against the exported **node** set, which for once is the right set — an
      actor is always a node. **One real case and two that discriminate**, not the three rev 1 listed:
      rev 1's second case (a connection whose own endpoints were dropped) is vacuous, because such a
      connection never reaches the export at all (`document.ts:646-647` skips it), and its third was
      a restatement of the first. So:
      an actor **parented into a tldraw shape** (the real drop);
      an actor **inside a collapsed container**, which must SURVIVE — collapse does not affect
      documentability, and a filter written against visibility rather than documentability passes
      the drop case and silently loses this one;
      and an actor naming a node **deleted after the binding was made**, which
      `onBeforeDeleteToShape` makes transient but a synced room can still hold
- [ ] **A MERGED connection exports its own attribution, not the merged one.** What a merged line
      DRAWS is a rendering decision about one drawn line — SPEC-011 blanked it when the members
      disagreed and SPEC-015 (2026-09-07) makes it show them all, and neither is the document's
      business.
      The document carries what each connection actually is, or collapsing a container before an
      export would silently erase attributions from the file. Asserted by collapsing a container
      whose members disagree and checking every attribution is still in the export
- [ ] Import creates one `connectionActor` binding per attributed connection, inside the existing
      recorded change, so **one undo** restores the previous room whole
- [ ] The imported attribution renders — asserted on the label, not on the binding, so this covers
      the whole path rather than the write
- [ ] A round trip is exact: export, import, export again yields an identical document
- [ ] Two exports of an unchanged room are identical, attributions included — **which requires the
      tie-break below to be resolved, or this criterion flakes rather than fails**
- [ ] The imported attributions reach a second client
- [ ] **WHICH actor binding the document records is decided, not left to array order.** SPEC-011
      established that two actor bindings on one connection is a reachable state — two clients
      attributing at once — and that the **smallest binding id** wins, so both draw the same label
      without coordinating. `BindingDescriptor` carries no `id` (`document.ts:175-180`), so an
      attribution arriving through it loses the tie-break and export picks whatever
      `getBindingsFromShape` returned. Concrete failure: the canvas says "Scheduler" and the export
      says "IAM role". `documentIO.ts` resolves it with `chosenActorBinding` **before** building the
      descriptor — the same function `actorIdOf` uses, so there is one rule and not two — and a test
      plants two bindings and pins which id is exported

### FR-004: The guide stops saying the opposite

#### Description:

The guide currently contains a paragraph explaining that the app has actors and the format does not
carry them. It becomes false on merge, and it is the paragraph a model reads before deciding not to
write one.

#### Acceptance Criteria:

- [ ] That paragraph is **removed**, not amended — its whole subject is a limitation that no longer
      exists
- [ ] `actorId` leaves the guide's "do not write these" list (`ai-authoring-guide.md:329`). **There
      is no guard to narrow** — rev 1 said there was, borrowing SPEC-009's shape, but
      `guide-examples.test.ts:85`'s list is `edgeSets, metadata, icon, isActor, autoLayout` and
      `actorId` is not in it. The nearest match is `isActor`, which must STAY. What does need
      attention is `guide-examples.test.ts:98-101`: it loops over `['sourceHandle', 'actorId']`
      asserting *presence*, under a comment saying they appear "only in the what-this-tool-does-not-
      have list, never as a field" — which becomes false on merge, and which the assertion could
      never have detected either way. `actorId` moves to the documented-fields list at `:91-102` and
      the stale comment goes
- [ ] The guide documents `actorId`, says an actor is a node, and says what it is FOR — the thing
      performing a connection is often neither of its ends, which is the whole reason the field
      exists and the part a model will otherwise never use
- [ ] A worked example carries an attribution, and a **new** assertion observes it. The existing
      extraction tests cannot: a guide with zero `actorId` examples passes all of them. SPEC-009 did
      not do it this way either — it added a dedicated check that its scenes example was a real
      walkthrough. The equivalent here: at least one parsed block has a connection whose `actorId` is
      **neither its `sourceId` nor its `targetId`**, which is also the only form that demonstrates
      the point — the thing performing a connection is often neither of its ends
- [ ] **Every fenced block declaring a version declares 3**, over ` ```json ` and ` ```ts ` — the
      existing sweep, which already covers the ` ```ts ` block the JSON extractor skips
- [ ] **The guide's PROSE version claim is updated too**, and it is not covered by that sweep.
      `ai-authoring-guide.md:32-33` says "write `2` for anything new" — the sweep is deliberately
      scoped to fenced blocks so prose stays free to say v1 documents still import, which means this
      sentence would go on telling models to write 2 with nothing noticing

---

## Data Model

```ts
// src/shared/document.ts

export const DOCUMENT_VERSION = 3
export const SUPPORTED_DOCUMENT_VERSIONS = [1, 2, 3] as const

export interface DocumentConnection {
  id: string
  sourceId: string
  targetId: string
  /** The node that performs this connection. Optional; omitted when absent. */
  actorId?: string
}

/**
 * `ExportableConnection` does NOT grow a field: it mirrors the connection SHAPE,
 * and the attribution is a binding, not a prop. It arrives the way the endpoints
 * do -- through the binding list -- so `toDocument` reads it from the same place
 * it already reads `start` and `end` from.
 *
 * But `BindingDescriptor` is SINGLE-VARIANT today: `type` is the endpoint type
 * and `props: { terminal }` is not optional. Carrying an actor binding through
 * the same array makes it a discriminated union, which then forces narrowing at
 * `document.ts:643` -- `own.find((b) => b.props.terminal === want)` does not
 * typecheck against a variant whose props have no terminal -- and touches
 * `fromDocument`'s return type. Four call sites. Named here because rev 1 said
 * "arrives the way the endpoints do" and left the type change implicit.
 */
export type BindingDescriptor =
  | { type: typeof CONNECTION_BINDING_TYPE; fromId: string; toId: string; props: { terminal: ConnectionTerminal } }
  | { type: typeof ACTOR_BINDING_TYPE; fromId: string; toId: string }
```

**No new record, no new binding type, no migration.** SPEC-011's `connectionActor` binding already
exists on both halves; this is a format change only.

## API / Interface Contract

```ts
// The upgrades COMPOSE. A v1 document goes through both, in order.
export function upgradeV1(document: Record<string, unknown>): Record<string, unknown> // -> v2
export function upgradeV2(document: Record<string, unknown>): Record<string, unknown> // -> v3

// In parseDocument:
//   version -> v1+scenes guard -> unknown top-level key -> upgrade v1 -> upgrade v2
//
// upgradeV2 is a NO-OP on content: v3 adds an optional field, so a v2 document
// is already a valid v3 one. It exists anyway, and returns a document with the
// version moved, because a version step with no function is a version step
// nobody can find later -- and because the composition above is what a v4 will
// extend.
//
// The actorId-at-the-wrong-version guard runs PER CONNECTION and before the
// upgrade, so it can name the connection that carries it.
```

`toDocument` reads the attribution from the bindings it is already given — `mergeIndex.ts` is not
involved, and structurally cannot be: `merge.ts` is a shared module with no store access, and
`exportDocument` never touches `getMergeIndex`. So the merged-connection rule is the DEFAULT
outcome rather than a hazard to avoid, and its criterion is a regression pin. It needs an Editor, so
it lives in `e2e/document-io.spec.ts`.

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/
│   ├── document.ts                  # version 3, actorId, upgradeV2, the guard
│   ├── document.test.ts             # + the new rejections; the pinned messages that move
│   ├── document-v1.test.ts          # goes red ONLY in the phase that changes fromDocument
│   ├── document-v2.test.ts          # NEW
│   ├── __fixtures__/v2/             # NEW -- literal "version": 2, scenes included
│   └── guide-examples.test.ts       # the deferred-key guard narrowed again
└── client/
    └── documentIO.ts                # export resolves the binding via chosenActorBinding, then
                                     #   builds the descriptor; import creates it
e2e/
├── helpers.ts                       # + attribute/actorLabels, which live in actors.spec.ts today
└── document-io.spec.ts              # + FR-003, including the merged-connection pin
docs/
└── ai-authoring-guide.md            # the actors section; the false paragraph removed
```

**One assertion in `e2e/document-io.spec.ts` breaks, not eight.** Its `version: 1` and `version: 2`
literals are mostly *inputs*, which stay valid at v3; the one that moves is the `.toBe(2)` on an
export's version.

`docs/component-inventory.md` gains a row for the v2 corpus at completion, as SPEC-009 added one for
the v1 corpus.

## Implementation Phases

### Phase 1: The v2 corpus, while v2 is still current
- `src/shared/__fixtures__/v2/` and `document-v2.test.ts`, green **before** the bump
- The same rule as the v1 corpus: written while the version it describes is the current one, or it
  asserts whatever the new code does

### Phase 2: Version 3 and the upgrades
- `DOCUMENT_VERSION = 3`, `SUPPORTED_DOCUMENT_VERSIONS`, `upgradeV2` composing with `upgradeV1`
- Both corpora green and untouched — the gate on this phase

### Phase 3: The field
- **Split `CONNECTION_KEYS` first**, allowlist from required-fields, with the suite green before
  `actorId` is added to either. Doing it in the same step hides which change broke what
- `actorId` on `DocumentConnection`, the validation and the two reference errors
- The `BindingDescriptor` union, and `chosenActorBinding` resolving the tie-break in `documentIO.ts`
- The wrong-version guard, pathed to the connection
- `toDocument`/`fromDocument`; **both corpora stay green** — an edit to either is a defect

### Phase 4: The room, the guide and proof
- `documentIO.ts` both directions; the merged-connection rule
- The guide's actors section, and the removal of the paragraph this spec falsifies
- `e2e/document-io.spec.ts`, including the second client and the single undo
