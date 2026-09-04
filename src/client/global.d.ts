import type { Editor } from 'tldraw'

declare global {
  interface Window {
    __editor?: Editor
  }
}
export {}
