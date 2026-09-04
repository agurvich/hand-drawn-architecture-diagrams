# Spec Index

One row per spec. **Status** here mirrors the spec file header (the header is authoritative). Keep this
to status only — no prose.

| Spec | Title | Status | Depends On |
|------|-------|--------|------------|
| SPEC-001 | Scaffold and canvas | In Progress | None |
| SPEC-002 | Sync foundation | Draft | SPEC-001 |
| SPEC-003 | First custom shape under sync | Draft | SPEC-002 |

## Arcs (build order)

Group related specs and record the order to build them in. Keep this section: a spec split for size
(`process.md` §4) always records its order here, even if you group nothing else.

- **Canvas migration:** SPEC-001 → SPEC-002 → SPEC-003 → SPEC-004 → SPEC-005 → SPEC-006 → SPEC-007

  The rebuild of `../architecture-diagrams` on tldraw. The order is deliberate and inverts the
  predecessor's handoff plan, which put multiplayer last: sync lands before the first custom shape so
  the client/worker schema duality is proven on a trivial shape rather than retrofitted across a
  finished shape library (`decisions.md` → *Multiplayer lands before the first custom shape*).

  SPEC-001 through SPEC-003 are authored. SPEC-004 onward are **planned, not written** — the shape of
  the riskiest mechanic is not knowable until SPEC-003 proves the boundary, and a spec authored
  against an unproven foundation is rewritten rather than built:

  - SPEC-004 — Hierarchical nesting and collapse (the core feature; the riskiest mechanic)
  - SPEC-005 — Connections via port bindings (workflow-kit pattern, no execution engine)
  - SPEC-006 — JSON export/import and the AI-authoring schema (must-have; ports near as-is)
  - SPEC-007 — Frames and narration
