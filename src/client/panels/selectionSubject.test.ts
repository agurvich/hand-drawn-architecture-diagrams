import { describe, it, expect } from 'vitest'
import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { selectionSubject } from './selectionSubject'

/** The two Editor calls `selectionSubject` makes, and nothing else. */
function editorWith(selected: string[], shapes: Record<string, string>): Editor {
  return {
    getSelectedShapeIds: () => selected as TLShapeId[],
    getShape: (id: TLShapeId) =>
      shapes[id] ? ({ id, type: shapes[id] } as unknown as TLShape) : undefined,
  } as unknown as Editor
}

describe('selectionSubject', () => {
  it('is null with nothing selected', () => {
    expect(selectionSubject(editorWith([], {}))).toBeNull()
  })

  it('names a selected node and a selected connection', () => {
    expect(selectionSubject(editorWith(['a'], { a: 'diagramNode' }))).toEqual({
      kind: 'node',
      id: 'a',
    })
    expect(selectionSubject(editorWith(['c'], { c: 'diagramConnection' }))).toEqual({
      kind: 'connection',
      id: 'c',
    })
  })

  it('is null for SEVERAL, however compatible their types', () => {
    const editor = editorWith(['a', 'b'], { a: 'diagramNode', b: 'diagramNode' })
    expect(selectionSubject(editor)).toBeNull()
  })

  it('is null for tldraw shapes this app has no properties for', () => {
    // Deliberate, and the reason is finding F3: a native `arrow` LOOKS like a
    // connection and is not one, so giving it a properties panel would say it
    // is. `geo` and `draw` are the same case.
    for (const type of ['geo', 'draw', 'arrow', 'text']) {
      expect(selectionSubject(editorWith(['x'], { x: type })), type).toBeNull()
    }
  })

  it('is null when the selected id resolves to no shape', () => {
    // A stale selection is briefly reachable mid-change; the panel must not
    // throw reading props off undefined.
    expect(selectionSubject(editorWith(['gone'], {}))).toBeNull()
  })
})
