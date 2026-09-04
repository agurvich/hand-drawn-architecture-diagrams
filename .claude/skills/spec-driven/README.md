# spec-driven (skill)

The **behavior** layer of this repo's spec-driven process: the workflow Claude follows to author
specs, run plan-gated builds, put spec/plan/diff through a blocking fresh-context review gate, watch
PRs/main, and run the completion ritual. The full method and rationale live in
[`docs/process.md`](../../../docs/process.md).

## Files here

- **`SKILL.md`** — the workflow Claude executes. **Claude Code auto-discovers it** at this path
  (`.claude/skills/spec-driven/SKILL.md`) — no install needed in a repo that contains it.

> This repo is a **derived project**, not the template it came from. The template's canonical
> `template/` payload and its mirror checks (`sync-from-skill.sh`, `check-mirror.sh`) were removed
> when the project was scaffolded — the upstream README lists that as the expected step. The docs at
> the repo root are now hand-maintained sources, not generated files.

## Using it

- **Claude Code:** available automatically. Invoke explicitly with `/spec-driven`, or just describe the
  task ("draft a spec for X", "build SPEC-007", "run the completion ritual") and it triggers.
- **Cowork:** install once into Settings → Capabilities (global across repos). Zip this `spec-driven/`
  folder with a `.skill` extension and use the install button, or add it via settings. A Cowork install
  is separate from Claude Code's auto-discovery.
