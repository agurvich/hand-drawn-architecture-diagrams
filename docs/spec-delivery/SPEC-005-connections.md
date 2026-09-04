# Completed Spec — SPEC-005: Connections between nodes

## What was completed?

- **`diagramConnection` shape + `connectionEndpoint` binding**, declared once in `src/shared/` and
  consumed by the client's utils and the worker's schema. Bindings have their **own** migration API
  (`createBindingProps*`) and a `com.tldraw.binding.<type>` sequence key.
- **`ConnectionShapeUtil`** — anchors derived at geometry time from the bound nodes' page transforms,
  with an arrowhead, endpoint handles, and a border anchor that falls back to nearest-point when one
  node contains the other.
- **`ConnectionBindingUtil`** — reparents the connection to the page; deletes the connection shape
  when an endpoint is deleted.
- **`ConnectionTool`** — drag node-to-node, with every refusal (empty canvas, non-node, same node)
  handled by creating nothing rather than cleaning up after.
- **`src/client/visibility.ts`** — one entry point where nodes hide by *ancestry* and connections hide
  by *relationship*.
- Extended the existing gates rather than duplicating them: the type-string check now covers all
  three type strings, and the cross-boundary test compares binding migration versions.

### Deliberate deviations

- **`canBind` is asked about a BINDING, not about the shape in isolation.** A blanket `false` — meant
  as "nothing binds to a connection" — blocked the bindings going *from* the connection to its nodes,
  i.e. all of them. It now reads `toShape.type !== CONNECTION_SHAPE_TYPE`.
- **FR-005's undo criterion needs a history mark.** Shapes created programmatically leave no stopping
  point, so a bare `undo()` rewinds past the setup and empties the page. The test marks first, which
  is what a real user action does anyway.

## What changed from earlier specs?

- **`bindingUtils` must go to `useSync` as well as `<Tldraw>`.** Passing it only to `<Tldraw>`
  registers the util on the editor while leaving the **synced store's schema** unable to validate the
  record — the failure reads `Expected one of "arrow", got "connectionEndpoint"` from a store that
  looks correctly configured from the editor's side. Same shape as the `shapeUtils` trap in SPEC-003.
- **`HierarchyShape.props` was typed as the node's props**, which made every non-node shape fail to
  typecheck through the visibility path. Loosened to `object` with a guarded read — connections flow
  through that path too.
- `src/client/devOnly.ts`'s permissive schema needed the custom shapes and bindings, or the opt-in
  path rejects them.
- `debugStoredSnapshot` reports binding records by `type`/`fromId`/`toId`/`terminal`. Bindings have no
  `label`, so the shape lookup could not see them at all.

## Verification

typecheck 0 · oxlint 0 · prettier 0 · unit 48/48 · e2e 53/53 · spec-lint 0 · docs-lint ok.

The criterion worth naming: **moving a container re-routes connections bound to its descendants.**
That is what a stored-anchor implementation cannot do — the binding hooks fire for a bound shape's own
record and its `parentId`, and moving a container changes neither. Asserted directly, and the same
test asserts the connection's props stay at their defaults however far the endpoints travel, so a
future change that starts storing anchors fails here.

**Owed: FR-004 (re-aiming an endpoint) was not built.** `getHandles` ships, but no
`onHandleDrag`/`onHandleDragEnd` handler exists and `updateBinding` appears nowhere in `src/client`,
so dragging an endpoint is a no-op; no e2e covers it. This spec was marked Completed with the FR
unmet and the debt unrecorded — the same failure SPEC-003 made, which SPEC-004's review caught.
Found by SPEC-006's spec review; built and asserted under SPEC-006 FR-005.

Not covered: merging connections into a collapsed container. A connection hides with its endpoint
today; deduplicating them into a line drawn against the container is the next spec.
