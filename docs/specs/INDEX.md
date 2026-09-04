# Spec Index

One row per spec. **Status** here mirrors the spec file header (the header is authoritative). Keep this
to status only — no prose.

| Spec | Title | Status | Depends On |
|------|-------|--------|------------|
| SPEC-001 | Scaffold and canvas | Completed | None |
| SPEC-002 | Sync foundation | Completed | SPEC-001 |
| SPEC-003 | First custom shape under sync | Completed | SPEC-002 |
| SPEC-004 | Hierarchical nesting and collapse | Completed | SPEC-003 |
| SPEC-005 | Connections between nodes | Draft | SPEC-004 |

## Arcs (build order)

Group related specs and record the order to build them in. Keep this section: a spec split for size
(`process.md` §4) always records its order here, even if you group nothing else.

- **Canvas migration:** SPEC-001 → SPEC-002 → SPEC-003 → SPEC-004 → SPEC-005 → SPEC-006 → SPEC-007 → SPEC-008

  The rebuild of `../architecture-diagrams` on tldraw. The order is deliberate and inverts the
  predecessor's handoff plan, which put multiplayer last: sync lands before the first custom shape so
  the client/worker schema duality is proven on a trivial shape rather than retrofitted across a
  finished shape library (`decisions.md` → *Multiplayer lands before the first custom shape*).

  SPEC-001 through SPEC-005 are authored. SPEC-006 onward are **planned, not written** — the shape of
  each is not knowable until the one before it lands, and a spec authored against an unproven
  foundation is rewritten rather than built:

  - SPEC-006 — Merging connections into a collapsed container (the other half of the core feature;
    it needs SPEC-004's collapse AND SPEC-005's connections, so it cannot be specified before both)
  - SPEC-007 — JSON export/import and the AI-authoring schema (must-have; ports near as-is)
  - SPEC-008 — Frames and narration
