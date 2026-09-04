# Spec: Connections between nodes

**ID:** SPEC-005  
**Status:** Completed  
**Last Updated:** 2026-09-04 (rev 2 — post-review)  
**Depends On:** SPEC-004

## Overview

A diagram of boxes is not yet a diagram of a system. This spec adds the lines: a **connection** drawn
from one node to another, which stays attached when either end is moved, resized or renamed, and can
be re-aimed at a different node by dragging its endpoint.

Connections are the second half of what makes the predecessor's core feature work. Once they exist,
a collapsed container can absorb the connections crossing its boundary and stand in for them — but
that is deliberately the *next* spec. This one is about making a line that is genuinely attached to
what it points at, rather than a line that happens to be drawn nearby.

## Scope

### In Scope

- A `connection` shape plus a binding type, declared once and consumed by client and worker
- Drawing a connection from one node to another
- Connections re-routing when an endpoint moves, resizes, or is reparented
- Re-aiming an endpoint at a different node
- Lifecycle: deleting a node takes its connections; deleting a connection leaves the nodes
- Connections synced, persisted, and hidden alongside endpoints hidden by collapse

### Out of Scope

- **Merging connections into a collapsed container.** When an endpoint is hidden by collapse, the
  connection hides too — a line to nowhere is worse than no line. **Deduplicating those into a single
  line drawn against the collapsed container is the next spec**, and it is the feature the handoff
  cares most about. It needs this spec's connection model to exist before it can be specified.
- **Named ports.** Connections bind to a *node*, and the anchor is computed from geometry — the
  nearest sensible point on each node's border. The predecessor stored a compass side per endpoint;
  whether that is worth having is a judgement to make after using this. Seam: an optional `port` prop
  on the binding, which the anchor calculation would prefer when present.
- **Labels, arrowheads, styling, routing around obstacles.** A connection is a plain line with a
  direction. A styling pass on a model that may still change is wasted.
- **The actor / action / trigger model.** Recorded in `architecture.md` → Deferred / Non-goals.
- **Connections to anything but a `diagramNode`** — not to a page, not to tldraw built-ins.

---

## Functional Requirements

### FR-001: One definition, two consumers — for bindings too

#### Description:

A binding is registered exactly as a shape is: a `TLGlobalBindingPropsMap` augmentation, a props
validator, migrations, and a `BindingUtil` on the client mirrored by a schema entry on the worker.
The rules SPEC-003 established for shapes apply unchanged, and the existing gates must cover the new
type rather than silently ignoring it.

#### Acceptance Criteria:

- [ ] The connection binding's type string and props are declared once under `src/shared/`, and
      neither the client nor the worker writes the type string as its own literal
- [ ] The **existing** type-string check and import-allowlist test in
      `src/shared/shapes/shared-imports.test.ts` cover the binding type too — extended, not duplicated
- [ ] The worker schema registers the binding by spreading `defaultBindingSchemas` alongside it, and
      an e2e asserts tldraw's own arrow binding still works — the same replace-not-extend trap
      SPEC-003 hit with shapes
- [ ] The client and worker carry the same migration sequence version for the binding, by the check
      `src/shared/shapes/boundary.test.ts` already performs for shapes

### FR-002: A connection can be drawn between two nodes

#### Description:

From a connection tool, dragging from one node to another creates a connection shape bound to both.

#### Acceptance Criteria:

- [ ] A toolbar entry activates the connection tool
- [ ] Dragging from node A to node B creates one `connection` shape and two bindings — one to A as
      source, one to B as target
- [ ] The connection renders between the two nodes' **borders**, not their centres, so it does not
      disappear under the shapes. The rule: intersect the centre-to-centre segment with each node's
      geometry and use the crossing points
- [ ] **When one node contains or overlaps the other** — ordinary now that nesting ships, and
      reachable via FR-003's reparenting criterion — both centres lie inside the outer shape and the
      segment crosses no border, so the intersection set is empty. The fallback is the nearest point
      on each node's geometry to the other's centre. Stated because "between the borders" is not
      binary in that case
- [ ] A drag that ends on empty canvas creates **nothing**, and leaves no orphaned shape or binding
- [ ] A drag that starts and ends on the **same** node creates nothing
- [ ] A connection cannot be created to a shape that is not a `diagramNode`

### FR-003: Connections follow their endpoints

#### Description:

The point of binding rather than drawing is that the line stays correct without the user maintaining
it.

#### Acceptance Criteria:

- [ ] Moving either endpoint node re-routes the connection, asserted on the rendered geometry rather
      than on the shape merely still existing
- [ ] Resizing either endpoint node re-routes the connection
- [ ] Reparenting an endpoint into a container re-routes the connection, and the connection is not
      dragged into the container itself. Drag-reparenting already excludes it —
      `canReceiveNewChildrenOfType` accepts only `diagramNode` — so this fences the *binding util*,
      whose obvious implementation (copied from tldraw's `ArrowBindingUtil.reparentArrow`) reparents
      the connection to the common ancestor of its endpoints
- [ ] Moving a **container** re-routes connections attached to its descendants
- [ ] A connection whose endpoint is hidden by collapse is itself hidden; expanding restores it.
      **This cannot ride SPEC-004's existing path.** `isHiddenByCollapse` walks `parentId`, and
      tldraw's own inheritance does the same; a connection is parented to the **page**, so a parent
      walk never hides it — and FR-003 forbids reparenting it into the container. The mechanism is
      therefore its own: the visibility callback resolves the connection's bindings
      (`editor.getBindingsFromShape`) and returns `'hidden'` when either bound node is hidden. It
      lives in `src/client`, not `src/shared`, because the shared allowlist permits only
      `@tldraw/tlschema` and `@tldraw/validate`

### FR-004: An endpoint can be re-aimed

#### Description:

A connection is wrong more often than it is missing. Dragging an endpoint onto a different node
re-binds it, without deleting and redrawing.

#### Acceptance Criteria:

- [ ] Dragging the source endpoint onto node C re-binds the source to C; the connection's identity
      (its shape id) is unchanged
- [ ] The same for the target endpoint
- [ ] Dropping an endpoint on empty canvas leaves the binding as it was, rather than orphaning the
      connection
- [ ] Dropping an endpoint on the connection's *other* endpoint node is refused — a self-connection
      is not created by the back door
- [ ] The node under a dragged endpoint is hinted, so the user can see what it will attach to

### FR-005: Lifecycle

#### Description:

A binding is a relationship, and deleting either side must not leave the other half behind.

**Two of these are framework-native and two are not, and the difference matters.** tldraw already
deletes bindings when a bound shape is deleted, so "no dangling binding" and "deleting a connection
leaves the nodes" pass with no code from this spec — they are regression tests. What tldraw does
*not* do is delete the **connection shape** when its endpoint goes; without that, deleting a node
leaves a line bound to nothing. That is `onBeforeDeleteToShape`'s job and the only load-bearing part.

#### Acceptance Criteria:

- [ ] **(load-bearing)** Deleting a node deletes every connection bound to it, at both ends
- [ ] **(load-bearing)** Deleting a **container** deletes connections bound to its descendants
- [ ] *(regression over framework behaviour)* Deleting a connection leaves both nodes intact
- [ ] Undo after deleting a node restores the node **and** its connections
- [ ] *(regression over framework behaviour)* No binding survives pointing at a shape that no longer
      exists — asserted by a sweep over **all** bindings after each case above, never a sample

### FR-006: Connections sync and persist

#### Description:

Bindings are records like any other, so they travel the path SPEC-002 established. This asserts it
rather than assuming it, because bindings are a second record type and nothing has yet proven the
room carries them.

#### Acceptance Criteria:

- [ ] A connection drawn in one client appears in another, attached to the same two nodes
- [ ] Re-aiming an endpoint in one client is reflected in the other
- [ ] Deleting a node in one client removes the connection in the other
- [ ] The connection **and both bindings** reach durable storage, asserted on stored content rather
      than a record count. SPEC-004's probe finds a document by `props.label` and reports
      `parentId`/`collapsed`; a binding has none of those, so `debugStoredSnapshot` is **extended
      again** to report binding records by `typeName`, `type`, `fromId` and `toId`. Without that the
      criterion degrades to the count SPEC-004 went out of its way to eliminate

---

## Data Model

```ts
// src/shared/bindings/connection.ts — one declaration, both runtimes

const CONNECTION_BINDING_TYPE = 'connectionEndpoint'

interface ConnectionBindingProps {
  /** Which end of the connection this binding is. */
  terminal: 'start' | 'end'
}

// Registered the same way a custom shape is (SPEC-003), or the binding is not a
// TLBinding and the utils will not type-check.
declare module '@tldraw/tlschema' {
  interface TLGlobalBindingPropsMap {
    [CONNECTION_BINDING_TYPE]: ConnectionBindingProps
  }
}

// src/shared/shapes/connection.ts
const CONNECTION_SHAPE_TYPE = 'diagramConnection'

interface ConnectionShapeProps {
  /** Fallback geometry, used only while a terminal is unbound mid-drag. */
  start: { x: number; y: number }
  end: { x: number; y: number }
}
```

A connection stores **no endpoint ids**. The bindings are the relationship — duplicating the ids in
props would create a second home for the same fact, which is the failure `decisions.md` →
*Store-native domain state* exists to prevent.

---

## API / Interface Contract

```ts
// ANCHORS ARE DERIVED AT GEOMETRY TIME, NEVER STORED.
//
// The tempting implementation -- recompute in onAfterChangeToShape and write the
// result into props -- fails FR-003 and is the wrong shape twice over:
//
//  1. The hook fires with reason 'self' only when the BOUND SHAPE'S OWN record
//     changes, and 'ancestry' only when its parentId changes. Moving a container
//     changes only the container's record, so nothing fires for a connection
//     bound to a descendant -- exactly the criterion at FR-003.
//  2. Writing anchors from a hook writes to the store once per pointer frame
//     during a drag, the same churn SPEC-004 rejected onDragShapesOver for.
//
// tldraw's own ArrowBindingUtil does not do it either: it computes routing inside
// getGeometry from the bound shapes' page transforms, which invalidates when an
// ANCESTOR moves. ConnectionShapeUtil.getGeometry does the same.

class ConnectionBindingUtil extends BindingUtil<ConnectionBinding> {
  static type = CONNECTION_BINDING_TYPE

  // Keeps the connection in a sensible place in the hierarchy. NOT where routing
  // is computed.
  onAfterChangeToShape(options: BindingOnShapeChangeOptions<ConnectionBinding>): void

  // Load-bearing, and NOT for deleting the binding -- tldraw already deletes
  // bindings when a bound shape goes. Its job is deleting the CONNECTION SHAPE,
  // without which a node delete leaves an orphaned line bound to nothing.
  onBeforeDeleteToShape(options: BindingOnShapeDeleteOptions<ConnectionBinding>): void
}

// Registered on BOTH sides, exactly as shapeUtils are (SPEC-003):
useSync({ uri, assets, shapeUtils, bindingUtils })
<Tldraw shapeUtils={shapeUtils} bindingUtils={bindingUtils} ... />
createTLSchema({ shapes: {...}, bindings: { ...defaultBindingSchemas, ...customBindingSchemas } })
```

## Configuration / Environment

None.

## File & Folder Structure

```
src/
├── shared/
│   ├── bindings/
│   │   ├── connection.ts          # binding type, props, migrations, augmentation
│   │   └── connection.test.ts
│   └── shapes/
│       ├── connection.ts          # the connection shape definition
│       ├── index.ts               # + customBindingSchemas
│       ├── shared-imports.test.ts # extended to cover binding types
│       └── boundary.test.ts       # extended to compare binding migration versions
├── client/
│   ├── Room.tsx                   # + bindingUtils on useSync AND <Tldraw>; + the
│   │                              #   binding-aware branch of getShapeVisibility
│   ├── visibility.ts              # resolves bindings; cannot live in src/shared
│   ├── devOnly.ts                 # its permissive schema needs the binding too
│   ├── shapes/
│   │   ├── ConnectionShapeUtil.tsx
│   │   └── registry.ts            # + bindingUtils export, + Toolbar entry
│   ├── bindings/ConnectionBindingUtil.ts
│   └── tools/ConnectionTool.ts
└── worker/
    ├── schema.ts                  # + bindings, defaults spread in
    └── RoomDurableObject.ts       # debugStoredSnapshot reports bindings (FR-006)
e2e/
├── connections.spec.ts
└── helpers.ts                     # + addConnection
```

## Implementation Phases

### Phase 1: The model
- The binding and shape definitions in `src/shared/`, with migrations
- Extend the existing type-string and import-allowlist checks to cover binding types
- Extend the cross-boundary test to compare binding migration versions

### Phase 2: Rendering and re-routing
- `ConnectionShapeUtil.getGeometry` computing anchors from the bound nodes' page transforms — derived
  every time, never written to props — and `ConnectionBindingUtil` for reparenting and delete
- Register `bindingUtils` on `useSync`, `<Tldraw>`, and the worker schema
- `src/client/visibility.ts`: hide a connection whose bound node is hidden, by resolving its bindings
  rather than walking `parentId`

### Phase 3: Creating and re-aiming
- `ConnectionTool`; the refusals from FR-002 and FR-004
- Endpoint handles, re-binding, and the drop hint

### Phase 4: Proof
- Extend `debugStoredSnapshot` to report binding records
- Lifecycle sweeps from FR-005 — enumerate all bindings, never sample
- Two-client sync and the durable-storage content assertions from FR-006
