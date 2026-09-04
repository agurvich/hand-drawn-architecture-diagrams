# Component Inventory

Reusable modules/services/components/hooks already built, so a new spec reuses instead of rebuilding.
**One line per item** — name, path, one-line purpose. The code is the source of truth; this is just the
index to find it. Add a row as part of the completion ritual when a spec ships something reusable.

| Name | Path | Purpose |
|------|------|---------|
| `room` | `src/shared/room.ts` | Room id validation, generation, and the `RoomRoute` discriminated route; imported by both client and worker |
| `RoomDurableObject` | `src/worker/RoomDurableObject.ts` | One Durable Object per room: holds the `TLSocketRoom`, persists a debounced snapshot to SQLite |
| `Room` | `src/client/Room.tsx` | Connects a room and renders the four connection states (loading / sync error / offline / live) |
| e2e helpers | `e2e/helpers.ts` | `newParticipant` (a second browser context = a distinct tldraw user), `openRoom`, `shapeCount`, `drawBox` |
| Node shape definition | `src/shared/shapes/node.ts` | The one declaration of the `diagramNode` shape: type string, props, validators, migrations, and the `TLGlobalShapePropsMap` augmentation |
| `customShapeSchemas` | `src/shared/shapes/index.ts` | The registry the client maps to ShapeUtils and the worker spreads into `createTLSchema` |
| `NodeShapeUtil` | `src/client/shapes/NodeShapeUtil.tsx` | Client half of the Node shape; `BaseBoxShapeUtil` with `getIndicatorPath` + `canEdit` |
| Shape/tool registry | `src/client/shapes/registry.ts` | `shapeUtils`, `tools`, `uiOverrides`, `components` — pass to BOTH `useSync` and `<Tldraw>` |
| `roomSchema` | `src/worker/schema.ts` | Worker half: built-ins spread in alongside the custom shapes |
| `hierarchy` | `src/shared/shapes/hierarchy.ts` | Pure rules: `collapsedAncestorOf`, `isHiddenByCollapse`, `wouldCreateCycle`, `descendantCount` — injected accessors, no Editor |
| `stripHiddenFromSelection` | `src/client/selection.ts` | Side effect keeping hidden shapes out of `selectedShapeIds`; hiding alone does not prevent selection |
| Connection shape + binding | `src/shared/shapes/connection.ts`, `src/shared/bindings/connection.ts` | The `diagramConnection` shape and `connectionEndpoint` binding; one declaration, both runtimes |
| `ConnectionShapeUtil` | `src/client/shapes/ConnectionShapeUtil.tsx` | Derives anchors from bound nodes' page transforms at geometry time; never stores them |
| `ConnectionBindingUtil` | `src/client/bindings/ConnectionBindingUtil.ts` | Reparents the connection to the page, and deletes it when an endpoint goes |
| `shouldHide` | `src/client/visibility.ts` | Nodes hide by ancestry, connections hide by relationship — one entry point for `getShapeVisibility` |
| `merge` | `src/shared/shapes/merge.ts` | Pure derivation of the collapsed view: `visibleStandInFor` (outermost collapsed ancestor) + `computeMergeIndex`'s five rules — injected accessors, no Editor |
| `getMergeIndex` | `src/client/mergeIndex.ts` | The derivation as a `computed` keyed on the Editor; holds ids, flags and counts, never coordinates |
| `nodeAtPoint` | `src/client/nodeAtPoint.ts` | The one definition of "which node is under this point", shared by the connection tool and endpoint re-aiming |
