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
| SPEC-008 | Frames and narration | In Progress | SPEC-004, SPEC-006, SPEC-007 |
| SPEC-009 | Frames in the JSON document | Draft | SPEC-007, SPEC-008 |

## Arcs (build order)

Group related specs and record the order to build them in. Keep this section: a spec split for size
(`process.md` §4) always records its order here, even if you group nothing else.

- **Canvas migration:** SPEC-001 → SPEC-002 → SPEC-003 → SPEC-004 → SPEC-005 → SPEC-006 → SPEC-007 → SPEC-008 → SPEC-009

  The rebuild of `../architecture-diagrams` on tldraw. The order is deliberate and inverts the
  predecessor's handoff plan, which put multiplayer last: sync lands before the first custom shape so
  the client/worker schema duality is proven on a trivial shape rather than retrofitted across a
  finished shape library (`decisions.md` → *Multiplayer lands before the first custom shape*).

  SPEC-001 through SPEC-007 are built; SPEC-008 and SPEC-009 are authored. The order is not
  negotiable — the shape of each was not knowable until the one before it landed, and a spec authored
  against an unproven foundation is rewritten rather than built.

  SPEC-009 closes the arc: a document that carries its narration as well as its diagram, which is
  what lets a model be asked for a walkthrough rather than a picture.
