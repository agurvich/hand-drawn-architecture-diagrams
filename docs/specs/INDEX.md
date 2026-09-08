# Spec Index

One row per spec. **Status** here mirrors the spec file header (the header is authoritative). Keep this
to status only — no prose.

| Spec | Title | Status | Depends On |
|------|-------|--------|------------|
| SPEC-001 | Scaffold and canvas | Completed | None |
| SPEC-002 | Sync foundation | Completed | SPEC-001 |
| SPEC-003 | First custom shape under sync | Completed | SPEC-002 |
| SPEC-004 | Hierarchical nesting and collapse | Completed | SPEC-003 |
| SPEC-005 | Connections between nodes | Completed | SPEC-004 |
| SPEC-006 | Merging connections into a collapsed container | Completed | SPEC-004, SPEC-005 |
| SPEC-007 | JSON export/import and the AI-authoring schema | Completed | SPEC-004, SPEC-005, SPEC-006 |
| SPEC-008 | Scenes and narration | Completed | SPEC-004, SPEC-006, SPEC-007 |
| SPEC-009 | Scenes in the JSON document | Completed | SPEC-007, SPEC-008 |
| SPEC-010 | Sketch to clean shape | Completed | SPEC-004, SPEC-005, SPEC-006, SPEC-008 |
| SPEC-011 | Actors on connections | Completed | SPEC-004, SPEC-005, SPEC-006, SPEC-008 |
| SPEC-012 | Actors in the JSON document | Completed | SPEC-009, SPEC-011 |
| SPEC-013 | Hand-drawn content inside a node | Completed | SPEC-004, SPEC-006, SPEC-008, SPEC-010 |
| SPEC-014 | An icon on every node | Completed | SPEC-004, SPEC-007, SPEC-012 |
| SPEC-015 | Actors on a merged edge | Completed | SPEC-006, SPEC-011, SPEC-014 |
| SPEC-016 | Selection properties panel | Completed | SPEC-008, SPEC-011, SPEC-013, SPEC-014, SPEC-015 |
| SPEC-017 | Recognition that works on a real hand | In Progress | SPEC-010 |

## Arcs (build order)

Group related specs and record the order to build them in. Keep this section: a spec split for size
(`process.md` §4) always records its order here, even if you group nothing else.

- **Canvas migration:** SPEC-001 -> SPEC-002 -> SPEC-003 -> SPEC-004 -> SPEC-005 -> SPEC-006 ->
  SPEC-007 -> SPEC-008 -> SPEC-009

  The rebuild of `../architecture-diagrams` on tldraw. The order is deliberate and inverts the
  predecessor's handoff plan, which put multiplayer last: sync lands before the first custom shape so
  the client/worker schema duality is proven on a trivial shape rather than retrofitted across a
  finished shape library (`decisions.md` -> *Multiplayer lands before the first custom shape*).

  SPEC-001 through SPEC-009 are built, closing the arc. The order is not negotiable -- the shape of
  each was not knowable until the one before it landed, and a spec authored against an unproven
  foundation is rewritten rather than built.

  SPEC-009 closes the arc: a document that carries its narration as well as its diagram, which is
  what lets a model be asked for a walkthrough rather than a picture.

- **Drawing:** SPEC-010

  Not part of the migration arc -- nothing in the predecessor to port. Sketch-to-clean-shape is the
  third of the three reasons `decisions.md` -> *Canvas SDK: tldraw* gives for the rebuild, and the one
  tldraw does not ship.

  It needs **SPEC-006** for `nodeAtPoint`, and **SPEC-008** for the custom-record pattern its mode
  uses and for the `@tldraw/store` allowlist widening that pattern required. It does **not** need the
  document work, so it can be built before or after SPEC-009 -- which is the whole reason it is a
  separate arc rather than a tail on the migration one.

- **Sketchbook:** SPEC-010 -> SPEC-013

  Making the surface feel drawn on rather than filled in. SPEC-010 turns a sketch into structure;
  SPEC-013 lets a sketch stay a sketch and still belong to the thing it was drawn inside. They share
  one mechanism -- what a node will accept as a child -- and SPEC-013 changes the answer SPEC-010
  depends on, so the order is not negotiable.

- **Modelling:** SPEC-011 -> SPEC-012 -> SPEC-014 -> SPEC-015

  Attributing a connection to the thing that performs it, and then making that visible at a glance.
  The order is forced: SPEC-014 puts `icon` in the document at the version SPEC-012 introduces, and
  SPEC-015 draws the icons SPEC-014 defines. SPEC-015 also REVERSES a SPEC-011 decision -- a merged
  edge showed no actor when its members disagreed, and now shows them all -- which is why it is last
  and why it carries the superseded markers.

- **iPad readiness:** SPEC-016 -> SPEC-017 -> (edge kinds) -> (node header/body) ->
  (one drawing path) -> (iPad chrome)

  The tool was used on its target device for the first time on 2026-09-08 and almost nothing about
  that session was predicted by the suite. `docs/handoff/2026-09-08-ipad-findings.md` holds the
  findings; the first two have specs, and the later titles are placeholders, not files.

  The order puts the properties panel (finding F2) ahead of sketch recognition (F1), which is the
  reverse of what severity alone suggests: recognition blocks the core loop, the panel only hides
  features. It went the other way because the panel makes SPEC-011 through SPEC-015 reachable at all
  -- five merged specs currently deliver nothing a user can find -- and because F1 has a known
  unknown behind it that F2 does not: scale-normalisation alone moved the corpus from 1 recognised
  box to 8, so there is at least one more defect to find before that work can be sized. The call is
  the project owner's, made 2026-09-08.
