import { type Editor } from 'tldraw'
import {
  SKETCH_MODE_RECORD_TYPE,
  SKETCH_MODE_SINGLETON_ID,
  type SketchModeRecord,
} from '@shared/sketch'

/**
 * Reading and writing the recognition mode.
 *
 * OFF when the record is absent, which is what a fresh room is. The default
 * lives here rather than in a seeded record so that "off by default" cannot be
 * broken by a seeding step that runs late, or not at all.
 *
 * Writes are HISTORY-IGNORED. tldraw's history filters on `source`, not on
 * record scope, so a session record's writes land on the shared undo stack like
 * any other -- and then undo after a conversion pops the TOGGLE instead of the
 * conversion, which is exactly the criterion the mode exists to protect.
 */
export function sketchModeOn(editor: Editor): boolean {
  return editor.store.get(SKETCH_MODE_SINGLETON_ID)?.on ?? false
}

export function setSketchMode(editor: Editor, on: boolean): void {
  editor.run(
    () => {
      const record: SketchModeRecord = {
        typeName: SKETCH_MODE_RECORD_TYPE,
        id: SKETCH_MODE_SINGLETON_ID,
        on,
      }
      editor.store.put([record])
    },
    { history: 'ignore' },
  )
}
