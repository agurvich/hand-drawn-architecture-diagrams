# Completed Spec — SPEC-011: Actors on connections

## What was completed?

A connection can now say **who performs it**, independent of its two ends. Select a line, pick a node
from "Performed by", and the actor's name appears on the line. An IAM role copying between two
buckets it is not itself drawn connected to; a scheduler kicking off a job that writes to a database.

- `src/shared/bindings/actor.ts` — the `connectionActor` binding and `chosenActorBinding`.
- `src/client/actors.ts` — `actorIdOf`, `attributeTo`, `clearActor`.
- `src/client/bindings/ActorBindingUtil.ts`, `src/client/panels/ActorControl.tsx`.
- `merge.ts`'s `ConnectionEndpoints` and `MergeEntry` gained `actorId`.

### Deliberate deviations

- **The node-only restriction is enforced in `attributeTo`, not by a util hook.** The spec's contract
  implied `canBind` on the binding util; `canBind` is a hook on the SHAPE util, and a binding util is
  asked nothing at creation time. The connection shape's existing `canBind` already refuses another
  connection (SPEC-005's fence, which is what keeps triggers out); "and not a tldraw shape" has
  nowhere else to live than the one function that makes an attribution.

## What changed from earlier specs?

- **`ConnectionEndpoints` gained a required `actorId`**, so every construction site had to change —
  which is the point of it being required rather than optional: `mergeIndex.ts` is the only place the
  type is built outside tests, and a silently-defaulted field there would have been an attribution
  that never rendered.
- **`mergeIndex.ts`'s `sameEntry` gained `actorId`.** That function is the `isEqual` of a `computed`,
  so a field the derivation produces and the comparator ignores is a field whose changes are
  invisible: re-attributing would produce an index the memo calls unchanged, and the label would
  never update. No error, no warning — a control that appears to do nothing.
- `shared-imports.test.ts` covers one more type string.

## Verification

330 unit + 214 e2e green locally, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

**Nine mutations, all caught:**

| Mutation | Caught by |
| --- | --- |
| `actorId` dropped from `sameEntry` | **nine** e2e tests |
| The endpoint util's delete hook copied onto the actor util | the delete-the-actor test |
| Attributing appends instead of replacing | the enumerate-the-bindings test |
| The history mark removed | the one-undo test |
| The node-type check removed | the tldraw-shape refusal test |
| Largest binding id chosen instead of smallest | the two-bindings test |
| The raw accessor instead of the scene-aware one | the scene-folded actor test |
| The halo token misspelled to `--color-background` | the computed-style test |
| The label stacked on top of the ×N count | the overlap test |

**The `sameEntry` one is worth naming**: it survives every *unit* test, because memoisation is
invisible from inside a pure function. It takes nine e2e tests down. The spec predicted this exactly,
in the file list, and it is the reason the file list said so.

**The disagreement rule is unit-tested without an Editor**, including the case that a reversal test
catches and a single-direction one does not: swapping which member carries the actor must not change
the answer, or the rule is "the representative's actor" wearing a disguise.

**Not covered:** actors in the JSON document, which is SPEC-012 — **an attribution does not survive
an export today, and the authoring guide does not yet say so.** Triggers (an edge pointing at another
edge) remain fenced off by SPEC-005's `canBind`. More than one actor per connection is still out of
scope; the binding makes it addable without a migration if the single case proves too narrow.
