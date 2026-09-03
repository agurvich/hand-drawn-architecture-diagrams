# Spec: First custom shape under sync

**ID:** SPEC-003  
**Status:** Draft  
**Last Updated:** 2026-09-03 (rev 3 — post-implementer-review)  
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
  shape whose model may still change is wasted. The toolbar entry FR-002 requires reuses a built-in
  tldraw icon rather than introducing one.
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
- [ ] Neither the client nor the worker declares the shape's **type string** as its own literal. Scope
      is the type string only: prop *names* are necessarily written on both sides (`getDefaultProps`
      returns `{ w, h, label }`, `component` reads `shape.props.label`), and agreement on those is
      already carried mechanically by `RecordProps<NodeShape>` and
      `getDefaultProps(): NodeShape['props']`
- [ ] That check **is proven to bite**: a fixture asserts it fails with a named message on a planted
      duplicate type literal, and stays silent on the legitimate shared declaration. The fixture lives
      under `tests/fixtures/` and the check takes a root path argument, so the real run does not fail
      on the planted duplicate. A gate is not
      tested by running it on the thing it guards (`process.md` §3)
- [ ] The shared module imports only from `@tldraw/tlschema` and `@tldraw/validate` — never from
      `tldraw`, which pulls React, DOM and CSS into the Worker bundle. Asserted by an import-allowlist
      test over `src/shared/`, **excluding `*.test.*`**: the cross-boundary test below must import the
      client util, so a sweep that does not exclude test files fails on the test that proves the rule
- [ ] **A cross-boundary test, not an identity assertion:** a record built from the *client* util's
      `getDefaultProps()` is accepted by the *worker* schema's validator, and the same record with one
      prop mutated to the wrong type is rejected by it. Asserting that both sides equal the shared
      constant is `X === X` and cannot fail under any drift. Lives at
      `src/shared/shapes/boundary.test.ts` — named because it is the one test that legitimately
      imports across both runtimes

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
- [ ] A record carrying a prop of the wrong type is rejected by the **worker schema's validator**,
      asserted in a unit test against the validator directly
- [ ] The same rejection is asserted end to end as a socket close with reason
      `TLSyncErrorCloseEventReason.INVALID_RECORD`, not a bare close. **The injection path is named,
      for the same reason FR-004 names its seeding route:** the client store validates locally and
      throws before anything reaches the socket, so a malformed record cannot be produced through the
      normal editor API. The test uses a **development-only client schema override** that skips local
      validation, registered on the same dev-only surface as FR-004's seeding route. Playwright cannot
      read a close code, so the reason is surfaced through the app's error UI (SPEC-002 FR-002) and
      asserted there
- [ ] A record carrying an unknown shape type is rejected
- [ ] Rejecting a record does not remove the other, valid shapes from the room: a second client
      connected throughout still sees the room's prior contents

### FR-004: Props can change without breaking existing rooms

#### Description:

Rooms persist. A prop added or renamed without a migration corrupts documents that already exist, and
does so quietly. The migration path is therefore exercised here, on a shape with nothing to lose,
rather than discovered later on one that matters.

#### Acceptance Criteria:

- [ ] The shape ships v1 as `{ w, h, label }` and a v2 migration adding `color: string`, defaulting to
      `'black'`. The prop is named here because "a migration that adds a prop" leaves the implementer
      inventing both the prior version and the addition, and no other FR mentions a fourth prop
- [ ] A test loads a persisted record written at the older version and asserts it is upgraded to the
      current version with the new prop's default applied
- [ ] A record already at the current version is left unchanged by the migration
- [ ] A room persisted at v1 opens after the v2 migration ships, with its shapes intact and `color`
      defaulted — asserted end to end, not only in a unit test of the migration function. The
      mechanism: a checked-in v1 room snapshot at `e2e/fixtures/room-v1.json`, seeded into Durable
      Object storage through a **test-only** worker route that is registered only when the worker runs
      in development. Without a named seeding path this criterion is undecidable

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

// This string is permanent and migration-bearing — changing it later orphans
// every persisted record. Claimed deliberately now, ahead of the SPEC-006 port.
const NODE_SHAPE_TYPE = 'diagramNode'

type NodeShapeProps = {
  w: number
  h: number
  label: string
  color: string     // added at v2 by the migration below; default 'black'
}

// Validators are exported alongside the type, so the worker schema and the
// client ShapeUtil are built from the same object rather than from two
// hand-written copies that agree today and drift tomorrow.
const nodeShapeProps: RecordProps<NodeShape>

type NodeShape = TLBaseShape<'diagramNode', NodeShapeProps>

// REQUIRED, and easy to miss: BaseBoxShapeUtil<NodeShape> is constrained to
// TLBaseBoxShape, which is Extract<TLShape, ...>. TLShape is derived from the
// augmentable TLGlobalShapePropsMap registry, so a custom shape is not a TLShape
// until it is registered there. Without this, the contract below fails with
// "Type 'NodeShape' does not satisfy the constraint 'TLBaseBoxShape'".
//
// It lives in src/shared/ with the rest of the definition -- it is part of "one
// definition, two consumers" (FR-001), and it imports only @tldraw/tlschema, so
// it satisfies the import allowlist.
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    [NODE_SHAPE_TYPE]: NodeShapeProps
  }
}

// Migrations are part of the definition, not a worker-side afterthought.
const nodeVersions = createShapePropsMigrationIds(NODE_SHAPE_TYPE, { AddColor: 1 })
const nodeShapeMigrations: TLPropsMigrations = createShapePropsMigrationSequence({
  sequence: [{ id: nodeVersions.AddColor, up, down }],
})
```

---

## API / Interface Contract

```
// client — extends BaseBoxShapeUtil, which supplies box resize for free.
// Targets tldraw 5.x (CLAUDE.md -> Tech Stack), where getIndicatorPath is the
// abstract method and indicator() is a deprecated stub. On 4.x this does NOT
// compile: `indicator` is abstract there, and getIndicatorPath is never called
// unless useLegacyIndicator() is overridden to false. If the pin ever moves
// back to 4.x, this contract moves with it.
// canEdit() defaults to FALSE — double-click label editing does not work until
// it is overridden.
class NodeShapeUtil extends BaseBoxShapeUtil<NodeShape> {
  static type = NODE_SHAPE_TYPE          // from src/shared, never a local literal
  static props = nodeShapeProps
  static migrations = nodeShapeMigrations
  getDefaultProps(): NodeShape['props']
  getGeometry(shape): Geometry2d
  component(shape): ReactNode
  getIndicatorPath(shape): TLIndicatorPath | undefined
  override canEdit() { return true }
}

// client registration — useSync does NOT include the default shape utils the
// way <Tldraw> does. Both the sync call and the canvas need them, or the
// built-ins vanish client-side: the mirror of the worker-side hazard above.
const shapeUtils = [...customShapeUtils, ...defaultShapeUtils]
const store = useSync({ uri, assets, shapeUtils })

// FR-002's toolbar entry needs all three of these; shapeUtils alone renders the
// shape but gives no way to create one.
<Tldraw store={store} shapeUtils={shapeUtils} tools={[NodeTool]} overrides={uiOverrides} />

// worker — `shapes` REPLACES the defaults rather than extending them, so the
// built-ins must be spread back in. Omitting them makes every draw/geo/arrow
// record an unknown type at the room boundary, silently regressing everything
// SPEC-002 proved — and makes FR-003's "unknown type is rejected" criterion
// pass for exactly the wrong reason.
import { createTLSchema, defaultShapeSchemas, defaultBindingSchemas } from '@tldraw/tlschema'

schema = createTLSchema({
  shapes: { ...defaultShapeSchemas, [NODE_SHAPE_TYPE]: { props, migrations } },
  bindings: defaultBindingSchemas,
})
```

## Configuration / Environment

None beyond SPEC-002's.

## File & Folder Structure

```
src/
├── shared/
│   └── shapes/
│       ├── node.ts            # type, props, validators, migrations, augmentation
│       ├── node.test.ts       # migration tests (FR-004)
│       ├── boundary.test.ts   # the cross-boundary test (FR-001)
│       └── index.ts           # the registry both runtimes import
├── client/
│   ├── Room.tsx               # EDITED: useSync + <Tldraw> both take shapeUtils
│   ├── shapes/
│   │   ├── NodeShapeUtil.tsx
│   │   └── NodeShapeUtil.test.tsx
│   └── tools/
│       └── NodeTool.ts        # the StateNode + UI override behind the toolbar entry
└── worker/
    ├── schema.ts              # built from src/shared/shapes, defaults spread in
    └── devOnlyRoutes.ts        # v1 room seeding (FR-004) + the unvalidated-client
                                # override (FR-003); development builds only
e2e/
├── custom-shape.spec.ts       # FR-005, and the persisted-room case from FR-004
└── fixtures/
    └── room-v1.json           # a room persisted before the v2 migration
```

## Implementation Phases

### Phase 1: The shared definition

- Write `src/shared/shapes/node.ts`: type string, props, validators, default props, and the
  `TLGlobalShapePropsMap` augmentation
- Write the registry in `src/shared/shapes/index.ts` that both runtimes consume
- Add the type-string check required by FR-001, plus the fixture proving it bites and the
  import-allowlist test

### Phase 2: Both consumers

- Build the client `ShapeUtil` from the shared definition: geometry, component, `getIndicatorPath`,
  `canEdit`; extend `BaseBoxShapeUtil` for resize
- Add the `StateNode` tool and UI override behind the toolbar entry
- Pass `shapeUtils` to **both** `useSync` and `<Tldraw>` in `Room.tsx`
- Build the worker schema from the same definition, spreading in `defaultShapeSchemas` and
  `defaultBindingSchemas`, and register it on the Durable Object
- Add the toolbar entry that creates the shape

### Phase 3: Evolution and proof

- Add the v2 `color` migration with the unit tests from FR-004, the `room-v1.json` fixture and the
  development-only seeding route
- Write the validation tests from FR-003, asserting the validator's failure rather than a closed socket
- Write the two-context sync spec and the persisted-room-across-migration spec
