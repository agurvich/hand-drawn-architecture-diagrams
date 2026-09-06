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

335 unit + 217 e2e green locally, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

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
| The client registry losing the actor util | the schema-parity test |
| First-in-array instead of smallest id | 3 unit tests + the two-bindings e2e |
| `localeCompare` instead of plain `<` | the mixed-case unit test |

**The `sameEntry` one is worth naming**: it survives every *unit* test, because memoisation is
invisible from inside a pure function. It takes nine e2e tests down. The spec predicted this exactly,
in the file list, and it is the reason the file list said so.

**A pre-existing flake, recorded rather than absorbed:** `e2e/nesting.spec.ts` fails intermittently
under full-suite parallel load and passes in isolation — two different tests, seen independently by
a reviewer and by me. It is masked by `retries: 2` in CI, which means a real regression in that file
could pass. Not this spec's to fix; queued as its own task.

**The disagreement rule is unit-tested without an Editor**, including the case that a reversal test
catches and a single-direction one does not: swapping which member carries the actor must not change
the answer, or the rule is "the representative's actor" wearing a disguise.

**Three things a review caught, all of which were criteria I had recorded as met:**

*FR-003's "the actor node is indicated while the connection is selected" was not built at all.* No
code, no CSS, no test — and I had marked the FR complete. It is built now, as a dashed ring
deliberately unlike both the scene highlight's solid ring and tldraw's own selection ring: three
meanings on one canvas need three marks. Asserted on computed style, not the class.

*The control covered the JSON launcher entirely.* Its CSS comment claimed the two "never coexist" —
false: only the expanded panel is conditional, and the launcher button is always mounted. Being
mounted later it painted over it, so **export was unreachable whenever a connection was selected**.
This is the third time this corner of the screen has been fought over in that stylesheet, which is
why the control now sits below the top strip and the e2e asserts on OVERLAP rather than coordinates.
It also overflowed a 375px viewport by 41px into somewhere nothing could scroll to, because a
`translate` moves the box after `max-width` has resolved.

*The client/worker parity check did not cover the new binding.* It named `connectionEndpoint`
literally, so a second binding type was simply outside it — and the two halves come from genuinely
independent sources (the client's synced schema from `bindingUtils`' statics, the worker's from
`customBindingSchemas`). They agree today only because each util aliases the shared constants. The
check now iterates the registry and asserts there is more than one custom binding, so it cannot go
stale the same way again.

**And one where the code was right but the evidence was not.** The two-bindings e2e planted
`binding:aaaa` before `binding:zzzz`, so "smallest id" and "first in the array" coincided — an
implementation that just took the first passed 20/20. First-in-array is store order, which is
precisely what need not match between clients. The largest id is planted first now, and
`actor.test.ts` covers every permutation of three plus the `localeCompare` trap.

**Not covered:** actors in the JSON document, which is SPEC-012 — an attribution does not survive an
export today. **The authoring guide now says so explicitly**, rather than continuing to list actors
among things the tool "may grow later", which had become false the moment this shipped. Triggers (an edge pointing at another
edge) remain fenced off by SPEC-005's `canBind`. More than one actor per connection is still out of
scope; the binding makes it addable without a migration if the single case proves too narrow.
