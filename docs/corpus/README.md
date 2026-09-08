# Corpus — real drawings, kept for tuning

Not test fixtures. These are whole diagrams drawn by a person on the target device, kept because
a recogniser tuned against strokes its own author drew with a mouse is tuned against nothing.

| File | What it is |
| --- | --- |
| `ipad-aws-2026-09-07.room.json` | The room snapshot: 276 `draw` shapes, tldraw record format, page-space coordinates recoverable as `point + shape.x/y`. Points are `b64Vecs.decodePoints(segment.path)` — delta-encoded base64, shape-local. |
| `ipad-aws-2026-09-07.svg` | The same strokes rendered, for looking at without a running app. |

**Provenance.** Alex, 2026-09-07, iPad + Apple Pencil, portrait, drawn at varying zoom (the camera
was at 6% when he stopped). Room `rOm0tDOl-pDkum2w` on the local dev worker. Every stroke has
`isPen: true`. The subject is a real diagram he wanted to draw: two AWS accounts, S3 buckets, a step
function, IAM roles, and the transfers between them.

**Why it matters.** Run against it, the recogniser at `9b90856` classified **one** stroke of 276 as a
box, and that one was undone. See `docs/handoff/2026-09-08-ipad-findings.md`.

Colours carry meaning he applied himself, unprompted: orange for data movement, light-green for
permission/actor, black for structure and sequence.
