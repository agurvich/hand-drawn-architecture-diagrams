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
| `document` | `src/shared/document.ts` | The diagram document: strict validator over raw text, plus `toDocument`/`fromDocument`, which meet exactly so the round trip composes |
| `documentIO` | `src/client/documentIO.ts` | The Editor adapters — `exportDocument`, `importDocument`, `undocumentableShapeCount` |
| `DiagramIOPanel` | `src/client/panels/DiagramIOPanel.tsx` | Copy the diagram out as JSON, paste one in; text box primary, clipboard an enhancement |
| `jsonBlocks` | `src/shared/guideExamples.ts` | The authoring guide's fence contract, shared by both test lanes |
| e2e panel helpers | `e2e/helpers.ts` | `pageRecords`, `openPanel`, `exportedJson`, `pasteDocument`, `addHalfConnection` |
| `scenes` | `src/shared/scenes/scene.ts` | The scene records and the pure lens: `effectiveCollapsed`, `withEffectiveCollapsed`, `isSceneStale` |
| `sceneView` | `src/client/sceneView.ts` | Per-viewer scene state, the shared `GetShape` override, and every scene mutation with its history rule |
| `NarrationPanel` | `src/client/panels/NarrationPanel.tsx` | Step, capture, rename, reorder, delete; the off-scene marker |
| e2e scene helpers | `e2e/helpers.ts` | `addScene`, `viewScene`, `hiddenShapeIds`, `offSceneNodeIds`, `activeSceneId` |
| `sceneType` | `src/shared/scenes/sceneType.ts` | The scene type string and its id prefix, tldraw-free so `document.ts` can strip it |
| v1 corpus | `src/shared/__fixtures__/v1/` | Frozen `"version": 1` documents; the regression base for any future version bump |
| e2e document helpers | `e2e/helpers.ts` | `sceneRecords`, `pasteDocumentAndConfirm` |
| `recognise` | `src/shared/sketch/recognise.ts` | Pure stroke classifier: box, line or nothing, plus `isPurposeful` and the named tolerances |
| stroke corpus | `src/shared/sketch/__fixtures__/strokes/` | 21 recorded strokes with expected verdicts; 12 are refusals |
| capture harness | `e2e/tools/capture-strokes.spec.ts` | Draws real strokes and writes the corpus; run via `playwright.capture.ts` |
| `sketchMode` | `src/client/sketch/sketchMode.ts` | Per-viewer recognition toggle, off by default, history-ignored |
| `SketchToggle` | `src/client/panels/SketchToggle.tsx` | The control, with the conversion live region |
| e2e sketch helpers | `e2e/helpers.ts` | `penStroke`, `shapesByType`, `setSketchMode` |
| `actor` binding | `src/shared/bindings/actor.ts` | The attribution binding, and `chosenActorBinding`'s smallest-id rule |
| `actors` | `src/client/actors.ts` | `actorIdOf`, `attributeTo`, `clearActor` — the one place an attribution is made |
| `ActorBindingUtil` | `src/client/bindings/ActorBindingUtil.ts` | Deliberately hookless: the absence of a delete hook is the behaviour |
| `ActorControl` | `src/client/panels/ActorControl.tsx` | Performed-by, on the selected connection |
| e2e content helpers | `e2e/helpers.ts` | `addTldrawShape`, `parentOf`, `pageBounds`, `dragCorner` |

