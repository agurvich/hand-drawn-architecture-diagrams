# Spec: First custom shape under sync

**ID:** SPEC-003  
**Status:** Draft  
**Last Updated:** 2026-09-03  
**Depends On:** SPEC-002

## Overview

Prove that a shape we invent can live in a synced room. tldraw requires every custom shape to be known
to both halves of the system — the client renders it, the worker validates and migrates it — and if the
two ever disagree, records are rejected at the room boundary. This spec establishes that boundary once,
on the simplest shape the product could possibly need (a labelled box), together with the pattern that
keeps the two halves from drifting and the migration path that lets a shape's props change without
corrupting rooms that already exist. It is deliberately small: its value is not the box, it is that
every shape after it — containers, connections, frames — is built on a boundary that has been crossed
and tested rather than one that has been read about.

## Scope

### In Scope

- A single shape definition in `src/shared/`, from which both the client `ShapeUtil` and the worker
  schema are derived
- A `Node` shape: a rectangle with an editable text label
- Creating one from the toolbar, and editing its label on the canvas
- Prop validation at the room boundary, and a migration proving props can evolve
- End-to-end coverage that the custom shape syncs between two clients

### Out of Scope

- **Nesting, collapse, containment.** The `Node` here holds no children. Hierarchy is SPEC-004 and is
  the reason this spec exists, but none of its behaviour is built here.
- **Connections, ports and bindings.** Nothing links two nodes. That is SPEC-005.
- **Styling, theming, icons, colour palettes.** The shape looks plain on purpose; a design pass on a
  shape whose model may still change is wasted.
- **A properties panel.** The label is edited on the canvas; a panel arrives when there are enough
  props to warrant one.
- **Porting the predecessor's `DiagramNode` type.** Its shape is informative but it was designed for a
  different renderer, and adopting it here would import decisions this foundation may not want. The
  port proper is SPEC-006.

---

## Functional Requirements

### FR-001: One definition, two consumers

#### Description:

The shape's type name and prop shape are declared exactly once, in `src/shared/`, and both the client
`ShapeUtil` and the worker schema are built from that declaration. Hand-writing the two halves
separately is the failure this spec exists to prevent.

#### Acceptance Criteria:

- [ ] The shape's type string and prop validators are exported from a single module under
      `src/shared/`, imported by both the client and the worker
- [ ] Neither the client nor the worker declares the shape's type string or prop names as its own
      literal — asserted by a test or lint rule that enumerates the shape modules and fails on a second
      declaration, not by a reviewer reading the diff
- [ ] The shared module imports nothing that is browser-only or worker-only, so it loads in both
      runtimes
- [ ] A unit test asserts the client's `ShapeUtil` type and the worker schema's registered type are the
      same value, obtained from the shared module

### FR-002: The Node shape renders and is editable

#### Description:

A `Node` is a rectangle carrying a text label. It can be created from the toolbar, moved, resized,
selected and its label edited, using tldraw's own interaction primitives.

#### Acceptance Criteria:

- [ ] A toolbar entry creates a `Node` on the canvas
- [ ] The shape renders its label, is selectable, and shows a selection indicator matching its geometry
- [ ] The shape can be moved and resized with the select tool
- [ ] Double-clicking the shape enters label editing, and the typed text is stored in the shape's props
- [ ] A `Node` created with an empty label renders without error and can be given a label afterwards

### FR-003: The worker validates props at the room boundary

#### Description:

The worker's schema rejects records that do not satisfy the shape's validators, so a malformed or
hostile client cannot corrupt a room for everyone else in it.

#### Acceptance Criteria:

- [ ] A record whose props satisfy the validators is accepted and persisted
- [ ] A record carrying a prop of the wrong type is rejected, and the rejection is asserted against the
      validator's failure — not merely against a connection closing
- [ ] A record carrying an unknown shape type is rejected
- [ ] Rejecting a record does not remove the other, valid shapes from the room: a second client
      connected throughout still sees the room's prior contents

### FR-004: Props can change without breaking existing rooms

#### Description:

Rooms persist. A prop added or renamed without a migration corrupts documents that already exist, and
does so quietly. The migration path is therefore exercised here, on a shape with nothing to lose,
rather than discovered later on one that matters.

#### Acceptance Criteria:

- [ ] The shape ships at least one migration that adds a prop to a prior version of its record
- [ ] A test loads a persisted record written at the older version and asserts it is upgraded to the
      current version with the new prop's default applied
- [ ] A record already at the current version is left unchanged by the migration
- [ ] A room persisted before the migration existed opens after it, with its shapes intact — asserted
      end to end, not only in a unit test of the migration function

### FR-005: The custom shape syncs

#### Description:

Everything SPEC-002 proved for built-in shapes holds for this one.

#### Acceptance Criteria:

- [ ] A `Node` created in one browser context appears in a second context on the same room
- [ ] A label edited in one context updates in the other
- [ ] Moving the shape in one context moves it in the other
- [ ] After a worker restart, a reloaded client still sees the `Node` with its label

---

## Data Model

```ts
// src/shared/shapes/node.ts — the single declaration both runtimes consume

const NODE_SHAPE_TYPE = 'diagramNode'

type NodeShapeProps = {
  w: number
  h: number
  label: string
}

// Validators are exported alongside the type, so the worker schema and the
// client ShapeUtil are built from the same object rather than from two
// hand-written copies that agree today and drift tomorrow.
const nodeShapeProps: RecordProps<NodeShape>

// Migrations are part of the definition, not a worker-side afterthought.
const nodeShapeMigrations: TLPropsMigrations
```

---

## API / Interface Contract

```
// client
class NodeShapeUtil extends ShapeUtil<NodeShape> {
  static type = NODE_SHAPE_TYPE          // from src/shared, never a local literal
  static props = nodeShapeProps
  static migrations = nodeShapeMigrations
  getDefaultProps(): NodeShapeProps
  getGeometry(shape): Geometry2d
  component(shape): ReactNode
  indicator(shape): ReactNode
}

// worker
schema = createTLSchema({ shapes: { [NODE_SHAPE_TYPE]: { props, migrations } } })
```

## Configuration / Environment

None beyond SPEC-002's.

## File & Folder Structure

```
src/
├── shared/
│   └── shapes/
│       ├── node.ts            # type, props, validators, migrations
│       ├── node.test.ts       # migration tests (FR-004)
│       └── index.ts           # the registry both runtimes import
├── client/
│   └── shapes/
│       ├── NodeShapeUtil.tsx
│       └── NodeShapeUtil.test.tsx
└── worker/
    └── schema.ts              # built from src/shared/shapes
e2e/
└── custom-shape.spec.ts       # FR-005, and the persisted-room case from FR-004
```

## Implementation Phases

### Phase 1: The shared definition

- Write `src/shared/shapes/node.ts`: type string, props, validators, default props
- Write the registry in `src/shared/shapes/index.ts` that both runtimes consume
- Add the test or lint rule required by FR-001 that fails on a duplicated declaration

### Phase 2: Both consumers

- Build the client `ShapeUtil` from the shared definition: geometry, component, indicator, resize
- Build the worker schema from the same definition and register it on the Durable Object
- Add the toolbar entry that creates the shape

### Phase 3: Evolution and proof

- Add a migration adding a prop, with the unit tests from FR-004
- Write the validation tests from FR-003, asserting the validator's failure rather than a closed socket
- Write the two-context sync spec and the persisted-room-across-migration spec
