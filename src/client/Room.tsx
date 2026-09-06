import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tldraw, type Editor, type TLShape } from 'tldraw'
import { useSync } from '@tldraw/sync'
import type { TLAssetStore } from 'tldraw'
import { syncUri, type RoomId } from '@shared/room'
import { stripHiddenFromSelection } from './selection'
import { stepScene, takeOffSceneAndToggle, viewScene } from './sceneView'
import {
  bindingUtils,
  components,
  shapeUtils,
  syncSchemaOptions,
  tools,
  uiOverrides,
} from './shapes/registry'
import { shouldHide } from './visibility'
import { unvalidatedSchemaIfRequested } from './devOnly'
import { DiagramIOPanel } from './panels/DiagramIOPanel'
import { NarrationPanel } from './panels/NarrationPanel'
import 'tldraw/tldraw.css'

/**
 * SPEC-002 Out of Scope: no R2, no asset upload. But `assets` is REQUIRED by
 * useSync, so the spec cannot stay silent on it. This stub fails loudly rather
 * than falling back to tldraw's inline base64 store, which would embed image
 * bytes in the synced document and therefore in the room's SQLite forever.
 */
const failLoudlyAssetStore: TLAssetStore = {
  async upload() {
    throw new Error('Image upload is not supported yet (SPEC-002 Out of Scope: assets/R2).')
  },
  resolve(asset) {
    return asset.props.src ?? null
  },
}

/**
 * MODULE-LEVEL, never an inline arrow.
 *
 * `getShapeVisibility` sits in the dependency list of the effect that
 * CONSTRUCTS the editor, so a new function identity on each render tears the
 * editor down and rebuilds it -- losing camera, selection and mounted state.
 * Room.tsx re-renders on connection status, so that would happen in normal use.
 */
const getShapeVisibility = (shape: TLShape, editor: Editor) =>
  shouldHide(shape, editor) ? 'hidden' : 'inherit'

/** How long a connection may sit in `loading` before we admit it may never arrive. */
const SLOW_CONNECTION_MS = 10_000

export function Room({ roomId }: { roomId: RoomId }) {
  const uri = useMemo(() => syncUri(window.location.origin, roomId), [roomId])
  // shapeUtils AND bindingUtils go to BOTH useSync and <Tldraw>: useSync does
  // not include the defaults the way <Tldraw> does, so omitting either here
  // drops it from the SYNCED STORE's schema. Passing bindingUtils only to
  // <Tldraw> registers the util on the editor while leaving the store unable to
  // validate the record -- "Expected one of arrow, got connectionEndpoint", from
  // a store that looks correctly configured from the editor's side.
  // See devOnly.ts: dev + an explicit URL flag, never in a production bundle.
  const devSchema = useMemo(() => unvalidatedSchemaIfRequested(), [])
  const store = useSync(
    devSchema
      ? { uri, assets: failLoudlyAssetStore, schema: devSchema }
      : { uri, assets: failLoudlyAssetStore, ...syncSchemaOptions },
  )

  const [editor, setEditor] = useState<Editor | null>(null)
  // useCallback with no deps, so the identity is stable. onMount is routed
  // through tldraw's own useEvent and is not in the editor-construction dep
  // list, but a stable identity costs nothing and keeps the rule in one place.
  const onMount = useCallback((mounted: Editor) => {
    setEditor(mounted)
    return handleMount(mounted)
  }, [])

  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (store.status !== 'loading') {
      setSlow(false)
      return
    }
    const t = setTimeout(() => setSlow(true), SLOW_CONNECTION_MS)
    return () => clearTimeout(t)
  }, [store.status])

  // Connecting: no editable canvas. Drawing into a document that is about to be
  // replaced by the server's copy must be impossible, not merely discouraged.
  if (store.status === 'loading') {
    return (
      <Centered testId="room-loading">
        <Spinner />
        <p>Connecting to room…</p>
        {slow && (
          <p data-testid="room-slow" className="muted">
            Still trying. The server may be unreachable — this will keep retrying.
          </p>
        )}
      </Centered>
    )
  }

  // A sync error means the SERVER closed the socket with a reason. An
  // unreachable server never reaches here -- it retries in `loading` forever.
  if (store.status === 'error') {
    return (
      <Centered testId="room-error-sync">
        <h1>Couldn’t open this room</h1>
        <p className="muted">{store.error.message}</p>
        <a href="/">Start a new room</a>
      </Centered>
    )
  }

  // synced-remote. The canvas stays mounted and editable even when offline --
  // unmounting it here would destroy the local edits FR-004 requires to survive
  // and re-sync, which is why disconnection is NOT an error state.
  return (
    <div className="canvas-host" data-testid="canvas-host">
      <Tldraw
        store={store.store}
        shapeUtils={shapeUtils}
        bindingUtils={bindingUtils}
        tools={tools}
        overrides={uiOverrides}
        components={components}
        getShapeVisibility={getShapeVisibility}
        onMount={onMount}
      />
      {/* A sibling of <Tldraw>, not a `components` override: a textarea inside
          the canvas component tree fights the canvas's own pointer and keyboard
          handling, which this panel needs none of. */}
      <DiagramIOPanel editor={editor} />
      <NarrationPanel editor={editor} />
      {store.connectionStatus === 'offline' && (
        <div className="offline-pill" data-testid="room-offline" role="status">
          Offline — your changes are saved locally and will sync when you reconnect
        </div>
      )}
    </div>
  )
}

function handleMount(editor: Editor) {
  window.__editor = editor
  // Exposed for e2e. `stepScene` in particular cannot be reached through the UI
  // at its own boundary -- the panel disables the buttons there -- so its guard
  // is asserted directly, and making it wrap otherwise left every test green.
  window.__scenes = { viewScene, takeOffSceneAndToggle, stepScene }
  // Returned disposer is run by tldraw when the editor unmounts.
  return stripHiddenFromSelection(editor)
}

function Centered({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div className="centered" data-testid={testId}>
      <div>{children}</div>
    </div>
  )
}

function Spinner() {
  return <div className="spinner" aria-hidden="true" />
}
