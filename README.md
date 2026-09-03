# hand-drawn-architecture-diagrams

Sketch software architecture by hand on an iPad, and share the drawing **live** with a colleague.

Built on the [tldraw](https://tldraw.dev) SDK, with every piece of domain state living in tldraw's own
synced store — so collaboration is a property of the system rather than something bolted on afterwards.

## Status

Pre-implementation. The docs are written; no application code exists yet. See
[`docs/specs/INDEX.md`](docs/specs/INDEX.md) for the build order.

## What it is

One persistent graph of your architecture, with two ideas layered on tldraw's canvas:

- **Hierarchical nesting** — containers hold other nodes to arbitrary depth and collapse, merging
  their children's connections into deduplicated lines against the outside world.
- **Frame-based narration** — named snapshots of view state (what is expanded, highlighted, visible),
  stepped forward and back to walk someone through the system.

It replaces [`../architecture-diagrams`](https://github.com/agurvich/architecture-diagrams), a
single-player React Flow app whose sharing was a compressed URL snapshot rather than collaboration.
That repo remains a read-only reference for prior art — see its `docs/canvas-rebuild-handoff.md` for
the feature audit and the reasoning behind the rebuild.

## Development

```bash
npm install
npm run dev
```

No tldraw licence key is needed on localhost. Production deployment is deliberately fenced until the
licensing question is settled — see [`docs/architecture.md`](docs/architecture.md) → *Known Constraints*.

## How work is done here

This repo follows a spec-driven process: features are specified before they are built, plans and diffs
each pass a fresh-context review gate, and the always-loaded docs are kept deliberately small.

- [`CLAUDE.md`](CLAUDE.md) — conventions, settled decisions, session workflow
- [`docs/process.md`](docs/process.md) — the full method
- [`docs/specs/INDEX.md`](docs/specs/INDEX.md) — every spec and its status
- [`docs/decisions.md`](docs/decisions.md) — why things are the way they are

Before pushing, run the gates:

```bash
npm run lint && npm run typecheck && npm test && sh scripts/spec-lint.sh && sh scripts/docs-lint.sh
```

`docs-lint.sh` is deliberately a local pre-push gate rather than a CI job — the reasoning is in
`docs/process.md` §5.

The process scaffold came from
[spec-driven-development-template](https://github.com/agurvich/spec-driven-development-template).
