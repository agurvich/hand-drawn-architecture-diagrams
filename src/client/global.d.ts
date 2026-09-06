import type { Editor } from 'tldraw'

declare global {
  interface Window {
    __editor?: Editor
    /**
     * The narration mutations, exposed for e2e.
     *
     * PR 2 gives these a surface; until then a test that wrote the records
     * directly would prove nothing about the thing under test -- and the thing
     * under test is precisely WHICH writes reach the undo stack.
     */
    __scenes?: {
      viewScene: (editor: Editor, sceneId: string | null) => void
      takeOffSceneAndToggle: (editor: Editor, shape: { id: string }, effective: boolean) => void
    }
  }
}
export {}
