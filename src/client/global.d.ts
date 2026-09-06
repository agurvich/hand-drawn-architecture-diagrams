import type { Editor, TLShapeId } from 'tldraw'
import type { SceneRecord } from '@shared/scenes'

declare global {
  interface Window {
    __editor?: Editor
    /**
     * The narration mutations, exposed for e2e.
     *
     * A test that wrote the records directly would prove nothing about the thing
     * under test, which is precisely WHICH writes reach the undo stack -- and
     * `stepScene`'s bounds guard is unreachable through the UI, because the
     * panel disables the buttons at exactly that boundary.
     */
    __scenes?: {
      viewScene: (editor: Editor, sceneId: SceneRecord['id'] | null) => void
      takeOffSceneAndToggle: (editor: Editor, shape: { id: TLShapeId }, effective: boolean) => void
      stepScene: (editor: Editor, delta: -1 | 1) => void
    }
  }
}
export {}
