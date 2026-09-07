# Completed Spec — SPEC-015: Actors on a merged edge

## What was completed?

Fold a container and the connections crossing its boundary become one line. That line now shows
**every distinct actor** its members name, as icons — first two, then `+N more`. Before this it showed
one actor only when the members agreed, and nothing when they disagreed.

- `MergeEntry.actorId: string | null` → **`actorIds: string[]`** (`src/shared/shapes/merge.ts`), with
  `distinctActors()` replacing `agreedActor()`. Ordered by plain `<` on the id, the same total order
  that picks the representative, so two clients draw the same line without coordinating.
- `ConnectionShapeUtil.actors()` (`src/client/shapes/`) resolves each id through
  `visibleStandInFor` + the scene-aware accessor, then **dedupes after resolution**, and renders the
  icons through SPEC-014's `NodeIcon` — one rule for what icon an actor has, three consumers.
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

460 unit + the full e2e suite green locally, plus typecheck, oxlint, prettier, spec-lint and
docs-lint. `e2e/actors.spec.ts` carries the reversal: disagreement shows both, three collapse to
`+1 more`, two actors inside one folded container count once, the icons have their own painted halo
(a box-shadow ring, a different mechanism from the label's stroke halo with the same silent-failure
mode), an actor pinned to `'none'` keeps its slot and its accessible name, and two clients list the
actors in the same order.

**A run that lies is worse than a run that fails.** Every e2e result in this spec was suspect until the
port collision above was found — the suite was green against another worktree's build, and then red
against it for the same reason. The `E2E_PORT` change is the fix; the lesson is that
`reuseExistingServer` is a footgun the moment more than one agent has a checkout.
