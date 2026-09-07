# Completed Spec — SPEC-012: Actors in the JSON document

## What was completed?

A connection carries the node that performs it, so a diagram round-trips whole. Copy one out, paste
it back, and "performed by" survives — which also makes actors something a model can write, and
"who does this?" is usually the question an architecture diagram exists to answer.

- `DOCUMENT_VERSION = 3`, `SUPPORTED_DOCUMENT_VERSIONS = [1, 2, 3]`, `upgradeV2` composing with
  `upgradeV1`.
- `actorId` on `DocumentConnection`, validated per path with two distinct reference errors.
- `BindingDescriptor` is a discriminated union; `documentIO.ts` resolves the tie-break.
- **A frozen v2 corpus** at `src/shared/__fixtures__/v2/` with `document-v2.test.ts`.
- The guide's actors section, and the removal of the paragraph this falsified.

### Deliberate deviations

- **`CONNECTION_KEYS` was split before anything else.** The spec's first draft said it "grows by
  exactly one"; that array is both the allowlist *and* the required-string list, so adding `actorId`
  would have made it mandatory. Split first, alone, with the suite green before the field arrived.
- **The corpora stay GREEN in every phase**, rather than going red in one. The spec's first draft
  borrowed SPEC-009's rule, which cannot apply — `fromDocument`'s return gains no key.

## What changed from earlier specs?

- **`BindingDescriptor` is a union.** The terminal lookup narrows on the discriminant; four call
  sites and one corpus assertion moved with it.
- **`DOCUMENT_VERSION` is 3**, so three pinned version messages moved and the guide's fenced literals
  went to 3 — along with its **prose**, which told models to write `2` and which the version sweep
  deliberately does not cover.
- `e2e/helpers.ts` gained `attributeConnection` and `actorLabels`, which lived in `actors.spec.ts`.

## Verification

367 unit + 249 e2e green, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

| Mutation | Caught by |
| --- | --- |
| `CONNECTION_KEYS` left unsplit | **47 tests** |
| `upgradeV1` jumping straight to 3 | 2 tests |
| The wrong-version guard deleted | the v1/v2 `actorId` test |
| The connection-naming error merged into the dangling one | the two-messages test |
| The actor not filtered against exported nodes | the drop test |
| The worked example losing its actor, or its actor becoming an endpoint | the guide assertion |

**Three things a review caught before any code was written**, each of which would have shipped:

*`CONNECTION_KEYS` doing two jobs* — above. Following the spec literally would have rejected every
document ever written, the frozen v1 corpus and three of the guide's own examples included.

*Export would have named the wrong actor.* Two clients attributing at once is a reachable state and
SPEC-011 settled that the smallest binding id wins, so both screens agree. `BindingDescriptor`
carries no id, so an attribution reaching the format through it had already lost the tie-break and
export would have taken store order — canvas saying "Scheduler" while the file said "IAM role".
Resolved in `documentIO.ts` with the same `chosenActorBinding` the canvas uses.

*Two of three "drop" cases were vacuous* — one restated the other, and one described a connection
that never reaches the export at all. Replaced with cases that discriminate, including **an actor
inside a collapsed container, which must survive**: a filter written against visibility rather than
documentability passes the drop case and silently loses that one.

**The composition is pinned by three assertions because the obvious one cannot see it.** "The parsed
version equals the constant" stays green under an `upgradeV1` taught to jump to the current version —
the mistake that leaves two functions both claiming to produce "the latest". What falsifies it is
pinning each step to its own target and asserting a v1 document passes through both.

**A data-loss path, found by using it.** A merged line is drawn by one of its members — the
representative — and that is the only member you can hit-test, so selecting a `×2` line selects it.
The "Performed by" control read that member's own binding and answered with its actor while the
canvas, one click away, correctly claimed nobody. Worse: choosing "Nobody in particular" from that
reading called `clearActor` on the representative and destroyed its real attribution while every
other member kept theirs — a person correcting a reading that was wrong to begin with, and losing
data doing it. The control now reads through the merge index, and is **read-only on a merged line**
with a note to expand the container. Attributing every member at once is a coherent alternative, but
it is a bulk edit nobody asked for and SPEC-015 changes what a merged edge shows.

**Two criteria were ticked with no test behind them**, both singled out by the spec as invisible to
everything else. Replacing `chosenActorBinding` with `[0]` in the export left 367 unit and 248 e2e
tests green while the canvas said one actor and the file said another; there is now a test that
plants two bindings **in both insertion orders**, because one of them agrees with `[0]` by accident.
And swapping the two version guards left the whole suite green; the document that breaks both rules
at once now pins which message wins.

**The guide said nothing about actors and collapse**, which is the one interaction a model authoring
"who does what" diagrams would hit. It now says the document always keeps every attribution whatever
is folded, and that the drawn line names an actor only when every connection it stands for agrees.

**Not covered:** downgrading — there is no v3 → v2 export, and a v2 build handed a v3 document
reports `expected 1 or 2, got 3`. `icon` joins v3 in SPEC-014; SPEC-015 then reverses SPEC-011's
merged-edge rule, and this spec's per-connection export is what makes that reversal cheap.
