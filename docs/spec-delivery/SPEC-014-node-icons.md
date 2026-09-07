# Completed Spec — SPEC-014: An icon on every node

## What was completed?

Type "Postgres" and the node becomes a database. Type "S3 bucket" and it becomes the **real AWS S3
icon**. Rename it and the icon follows; pick one by hand and it stays picked.

- `src/shared/icons/` — the ported rule table (108 rules), `guessIconKey`, `resolveNodeIcon`, and
  `ICON_KEYS` derived from the rules.
- `src/client/icons/registry.tsx` — Lucide for the general vocabulary, 28 vendored AWS architecture
  SVGs for named services. `NodeIcon.tsx` draws them.
- `src/client/panels/IconPicker.tsx`.
- `icon` on the node shape, with a migration; `icon` in the document at version 3.

### Deliberate deviations

- **Two improvements on the port, not copies.** Plural handling runs in both directions, so `user`
  and `users` were indistinguishable to a single pass and whichever rule sat first won both — a node
  called "User" got the plural icon forever. An exact-word pass runs first now. And
  `service|services` sat in the middle of the table, swallowing "Auth service" and "Billing service"
  into a generic gear before the specific rules ran; catch-alls belong last, which is the table's own
  stated principle.
- **`aws-icons` is not a dependency.** The 28 SVGs this app uses are vendored under
  `src/client/icons/aws/` rather than pulling a 300-icon package for 28 of them.

## What changed from earlier specs?

- **`NodeShapeProps` gained `icon`**, with a migration — so every construction site in tests moved,
  and both frozen corpora went red in exactly the phase that changes what a document becomes.
- `NODE_KEYS` gained `icon`; `DocumentNode` gained an optional `icon`.

## Verification

448 unit + 263 e2e green, plus typecheck, oxlint, prettier, spec-lint and docs-lint.

| Mutation | Caught by |
| --- | --- |
| AWS rules moved below the generic ones | **33 tests** |
| The exact-match pass removed | the singular/plural tests |
| Whole-word matching relaxed to substring | 3 tests |
| The `service` catch-all back near the top | the "Auth service" case |
| The icon written at creation instead of resolved live | 3 e2e |
| `'none'` treated as unset | the three-states test |
| The automatic icon exported | 16 tests |
| An unknown icon key accepted | the rejection test |
| **The migration removed** | the pre-migration room test |

**The migration mutation survived until a test was written for it**, which is the whole reason that
test exists: every other test creates its nodes fresh, so nothing could see a room that already
existed. A prop added without a migration corrupts those rooms quietly. The fixture is a `diagramNode`
at sequence version 0 — no color, no collapsed, no icon — and it must open with the icon defaulted to
**automatic**, so it is guessed from the label the node has always had rather than frozen at whatever
migration time happened to see.

**The rule table and the artwork cannot drift**, asserted both ways: every key a rule can produce is
drawable, and no icon exists that no rule can reach. The shared list is *derived from the rules* and
the client list is *what the registry can draw* — deliberately two lists, because one would have
nothing to compare.

**Not covered:** custom or uploaded icons; matching on anything but the label (the predecessor also
searched a `metadata` map, which this app does not have); and SPEC-015's merged-edge rendering, which
is what these icons were built for.
