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
| AWS rules moved below the generic ones | **19 tests** |
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

## What review changed

Two reviewers, one reading against the criteria and one building diagrams with it. Four criteria were
ticked by tests that could not fail, and each of those had a mutation that survived:

| Ticked by a test that could not fail | What it now asserts |
| --- | --- |
| "no key appears in both sets" | the two key lists intersected — the old test re-partitioned **one** list by the `aws:` prefix, which is true by construction. `'aws:s3'` planted in the general set left 448/448 green and drew it twice in the picker |
| "the picker lists every icon" | identity against `ICON_KEYS`, not `>= 90` against 97 — `.slice(0, 90)` had left the suite green with seven icons unpickable |
| "every target ≥44×44" | the launcher and the two choice buttons too, not only the grid cells — a `<div role="button">` at 20px had passed |
| "keyboard reachable" | opened with Enter, dismissed with Escape, focus asserted at each step |

And three behaviours the `role="dialog"` implied but did not have: Escape dismisses, focus moves into
the sheet and back to the launcher, and a different node selected closes it rather than re-presenting
it. Picking an icon used to unmount the button focus was on and drop focus to `<body>`.

**A node too small for both now keeps its label and drops the icon.** At 60×40 — reachable by hand,
since the sketch recogniser's own `MIN_BOX_EXTENT` is 40 — the icon pushed the label into
`overflow: hidden` and cut its descenders off. The icon is a second channel for what the text already
says, so when only one fits it is the one that goes.

**Four rules retuned** on the evidence of someone drawing real diagrams with them: `cache|redis` off
the flame (which reads as an alert) onto a bolt; `queue|kafka|stream` off the envelope it shared with
`email`, so a Kafka topic and an SMTP inbox are no longer the same glyph; `nginx|envoy|traefik|haproxy`
added to the proxy rule, which had no coverage at all; and the bare word `nodes` dropped from the p2p
rule — plural matching runs both ways, so it also claimed "node", and every shape in this app is a
node.

Smaller: the three registry lookups go through `Object.hasOwn`, so `icon: 'toString'` from a sync peer
no longer finds `Object.prototype`'s method (nothing was injectable — it stringifies with no `<` in
it — but "an unknown key draws nothing" is the contract the import validator is written against);
`icon: ''` is accepted on import as automatic, the same thing omitting the field means; the picker's
cell borders moved to `#767676` like every other control here, since `#ddd` on white is 1.36:1; and
`guessIconKey` no longer re-splits the label once per rule per pass, which was a third of its cost.

One number in the table above was wrong: the AWS-ordering mutation takes **19** tests down, not 33.
