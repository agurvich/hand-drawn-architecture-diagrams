# Completed Spec — SPEC-015: Actors on a merged edge

## What was completed?

Fold a container and the connections crossing its boundary become one line. That line now shows
**every distinct actor** its members name, as icons — first two, then `+N more`. Before this it showed
one actor only when the members agreed, and nothing when they disagreed.

- `MergeEntry.actorId: string | null` → **`actorIds: string[]`** (`src/shared/shapes/merge.ts`), with
  `distinctActors()` replacing `agreedActor()`. Ordered by plain `<` on the id, the same total order
  that picks the representative, so two clients draw the same line without coordinating.
- `actorsOnScreen` (`src/client/actorsOnScreen.ts`) — **the one answer to "who performs this line"**,
  and the shape of the fix rather than an incidental helper. Merge index → `visibleStandInFor` through
  the scene-aware accessor → dedupe after resolution. Three consumers read it: the line, the
  "Performed by" panel, and the dashed ring on the canvas. Re-implementing it per consumer failed
  twice — the panel named the representative's own actor while the line drew two, and after that was
  fixed the ring was still doing it, lighting one node under two icons and nothing at all when the
  representative's actor was the one inside the fold.
- `ConnectionShapeUtil.drawableActors()` splits that answer into what is drawn and what is counted,
  and orders it **by name** rather than by the id the derivation sorts on: the label is in the store
  too, so it is just as deterministic across clients, and which two of six icons you see should not
  look like a coin toss.
- `MAX_ACTOR_ICONS` (`src/client/icons/actorIcons.ts`) — the cap, deliberately in the rendering layer.
- `ActorControl` grew an option for "several", selected and unpickable.
- `sameEntry` in `src/client/mergeIndex.ts` compares `actorIds` **by content**; it is a `computed`'s
  `isEqual`, so a field it ignores is a field whose changes never reach the screen.
- `playwright.config.ts` takes `E2E_PORT`. Several sessions share this repo through worktrees, and
  `reuseExistingServer` cannot tell one worktree's dev server from another's — so a second session's
  run silently tests the first session's build. That happened during this spec and cost an hour of
  chasing a phantom regression; the whole fix is one env var per session.

### Deliberate deviations

- **The cap is two, so FR-002's "three shows three icons" cannot hold.** The cap was settled with the
  user after the criteria were written; three shows two icons and `+1 more`. The criterion was
  corrected in the spec rather than quietly failed.
- **An unmerged line still shows the actor's NAME**, per FR-002's last criterion, so the codebase now
  has two renderings of one idea. That is the spec's call and it is right: icons answer "several", and
  where there is exactly one the name is more precise and there is room for it.

## What changed from earlier specs?

- **SPEC-011 FR-004's second criterion is reversed** — superseded markers on its spec, its delivery
  doc, and a new entry in `docs/decisions.md`. Its unit tests were **rewritten, not deleted**: the
  cases stay, the expectation reverses. Deleting them would remove the only place the old behaviour is
  described, and a reversal that erases its own history reads later as a bug.
- SPEC-006's merge derivation changed shape (one field), so every construction site of a `MergeEntry`
  moved with it.

## Verification

467 unit + the full e2e suite green locally, plus typecheck, oxlint, prettier, spec-lint and
docs-lint. `e2e/actors.spec.ts` carries the reversal: disagreement shows both, three collapse to
`+1 more`, two actors inside one folded container count once, the icons have their own painted halo
(a box-shadow ring, a different mechanism from the label's stroke halo with the same silent-failure
mode), an actor pinned to `'none'` keeps its slot and its accessible name, and two clients list the
actors in the same order.

**A run that lies is worse than a run that fails.** Every e2e result in this spec was suspect until the
port collision above was found — the suite was green against another worktree's build, and then red
against it for the same reason. The `E2E_PORT` change is the fix; the lesson is that
`reuseExistingServer` is a footgun the moment more than one agent has a checkout.

## What review changed

Two reviewers, one against the criteria and one building diagrams with it. Between them they found
the same bug in two more places, plus two ways the line under-reported what crosses a boundary — the
exact failure this spec exists to fix.

- **The canvas ring was the third consumer, and it was missed.** `actorsOfSelection` read the selected
  connection's own binding, so a merged line drawing two icons lit exactly one node — and lit nothing
  at all when the representative's actor was inside the folded container, since that id is not on
  screen. Hence `actorsOnScreen`: one resolution, three readers.
- **The panel named actors the line cannot draw.** It read raw ids off the index, so with two actors
  inside a fold the line drew one icon ("Platform") while the control said "Alice, Dave".
- **An actor with no label vanished from the set and was not even counted** — three actors, one
  unnamed, drew two icons and *no* `+N more`. Inherited from SPEC-011, where a name-only rendering
  had nothing to draw; here the icon exists regardless.
- **An actor pinned to `'none'` was given an empty 20px chip.** Two actors, one iconless, drew one
  glyph and no overflow badge — the line saying "one actor" about two. It is now counted rather than
  slotted, and `+N more` carries the names in its accessible name, because `title` is inert under the
  row's `pointer-events: none`.
- **The ordering criterion was proven by a test that could not fail** — all-lowercase fixture ids,
  where `localeCompare` and plain `<` agree. Swapping the comparator left 467/467 green. It now uses
  the same `aB3`/`Ab3` pair the representative rule 275 lines up uses, for the same reason.
- **The five-actor cap had no test**, only the three-actor one. Behaviour was already right.
- **At 375px the merged names were unreadable**: a `<select>` truncates to its own width and a
  disabled one cannot be opened to see the rest. The note carries them now, and wraps.
- Two doc sites still stated the old rule with no marker — `docs/ai-authoring-guide.md`, which is live
  author-facing guidance and was simply corrected, and SPEC-012's spec, which got the marker.
