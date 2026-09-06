import { describe, it, expect } from 'vitest'
import {
  parseDocument,
  toDocument,
  fromDocument,
  DOCUMENT_VERSION,
  DOCUMENTABLE_SHAPE_TYPES,
  type DiagramDocument,
  type ExportableNode,
  type ExportableConnection,
  type BindingDescriptor,
  type ExportableScene,
} from './document'
import { NODE_SHAPE_TYPE, nodeShapeDefaultProps } from './shapes/node'
import { CONNECTION_SHAPE_TYPE, connectionShapeDefaultProps } from './shapes/connection'
import { CONNECTION_BINDING_TYPE, type ConnectionTerminal } from './bindings/connection'

const PAGE = 'page:main'

function json(value: unknown): string {
  return JSON.stringify(value)
}

function doc(over: Partial<DiagramDocument> = {}): string {
  return json({ version: DOCUMENT_VERSION, nodes: [], connections: [], ...over })
}

/** The error, or a loud failure if the document was unexpectedly accepted. */
function errorFrom(input: string): string {
  const result = parseDocument(input)
  if (result.ok) throw new Error(`expected rejection, got a document: ${input}`)
  return result.error
}

function node(id: string, over: Record<string, unknown> = {}) {
  return { id, label: id, x: 0, y: 0, w: 100, h: 60, ...over }
}

// --- records, for the conversions ---

function exportableNode(id: string, over: Partial<ExportableNode> = {}): ExportableNode {
  return {
    id: `shape:${id}`,
    type: NODE_SHAPE_TYPE,
    parentId: PAGE,
    x: 0,
    y: 0,
    rotation: 0,
    props: { w: 100, h: 60, label: id, color: 'black', collapsed: false },
    ...over,
  }
}

function exportableConnection(id: string): ExportableConnection {
  return {
    id: `shape:${id}`,
    type: CONNECTION_SHAPE_TYPE,
    parentId: PAGE,
    x: 0,
    y: 0,
    rotation: 0,
    props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
  }
}

function exportableScene(id: string, over: Partial<ExportableScene> = {}): ExportableScene {
  return {
    id: `diagramScene:${id}`,
    name: id,
    note: '',
    collapsed: {},
    highlighted: [],
    index: 'a1',
    ...over,
  }
}

function binding(from: string, to: string, terminal: ConnectionTerminal): BindingDescriptor {
  return {
    type: CONNECTION_BINDING_TYPE,
    fromId: `shape:${from}`,
    toId: `shape:${to}`,
    props: { terminal },
  }
}

describe('parseDocument — acceptance', () => {
  it('accepts an empty document', () => {
    const result = parseDocument(doc())
    expect(result).toEqual({
      ok: true,
      document: { version: DOCUMENT_VERSION, nodes: [], connections: [], scenes: [] },
    })
  })

  it('defaults nodes and connections to [] so a node-only document is valid', () => {
    const result = parseDocument(json({ version: DOCUMENT_VERSION, nodes: [node('a')] }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.connections).toEqual([])
  })

  it('accepts a node with and a node without parentId', () => {
    const result = parseDocument(doc({ nodes: [node('p'), node('c', { parentId: 'p' })] as never }))
    expect(result.ok).toBe(true)
  })

  it('accepts every optional field', () => {
    const result = parseDocument(
      doc({
        nodes: [node('a', { rotation: 1.5, color: '#4f8ff7', collapsed: true })] as never,
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.document.nodes[0]).toMatchObject({
        rotation: 1.5,
        color: '#4f8ff7',
        collapsed: true,
      })
    }
  })
})

describe('parseDocument — rejection, each naming its path', () => {
  it('rejects malformed JSON', () => {
    expect(errorFrom('{ not json')).toMatch(/^document: not valid JSON/)
  })

  it('rejects a non-object', () => {
    expect(errorFrom('[]')).toBe('document: must be a JSON object')
  })

  it('rejects a missing version', () => {
    expect(errorFrom(json({ nodes: [], connections: [] }))).toBe('document.version: missing')
  })

  // HARD-CODED, not built from SUPPORTED_DOCUMENT_VERSIONS: a pin that
  // interpolates the implementation's own expression is not a pin. Changing the
  // separator to ', ' would keep a derived assertion green.
  it.each([
    [3, 'document.version: expected 1 or 2, got 3'],
    [0, 'document.version: expected 1 or 2, got 0'],
    ['2', 'document.version: expected 1 or 2, got "2"'],
  ])('rejects version %p', (version, message) => {
    expect(errorFrom(json({ version, nodes: [] }))).toBe(message)
  })

  it('rejects a v1 document carrying scenes, naming the VERSION not the key', () => {
    // After the reorder `version: 1` passes the version gate and `scenes` is a
    // legal v2 key, so without its own guard this document is ACCEPTED and the
    // author's scenes vanish.
    expect(errorFrom(json({ version: 1, nodes: [], scenes: [] }))).toBe(
      'document.version: scenes requires version 2',
    )
  })

  it('rejects an unknown key at the top level', () => {
    // `scenes` used to be this test's unknown key. It is a real key now, so the
    // check needs one that is still made up -- and it needs to STAY made up.
    expect(errorFrom(json({ version: DOCUMENT_VERSION, edgeSets: [] }))).toBe(
      'document.edgeSets: unknown key',
    )
  })

  it('rejects an unknown key on a node', () => {
    expect(errorFrom(doc({ nodes: [node('a', { metadata: {} })] as never }))).toBe(
      'nodes[0].metadata: unknown key',
    )
  })

  it('rejects an unknown key on a connection', () => {
    expect(
      errorFrom(
        doc({
          nodes: [node('a'), node('b')] as never,
          connections: [{ id: 'c', sourceId: 'a', targetId: 'b', sets: [] }] as never,
        }),
      ),
    ).toBe('connections[0].sets: unknown key')
  })

  it('rejects a wrong type on a field', () => {
    expect(errorFrom(doc({ nodes: [node('a', { w: '100' })] as never }))).toBe(
      'nodes[0].w: must be a finite number',
    )
  })

  it('rejects a zero or negative w/h — they pass createShapes validation and crash the canvas', () => {
    // nodeShapeProps uses T.nonZeroNumber, so `w: 0` clears a finite-only check
    // here and then throws inside createShapes, which escapes to tldraw's error
    // boundary and replaces the canvas with a Reset data button. The user is
    // told nothing. Finite is not the same as valid.
    for (const bad of [0, -1, -200.5]) {
      expect(errorFrom(doc({ nodes: [node('a', { w: bad })] as never }))).toBe(
        'nodes[0].w: must be greater than zero',
      )
      expect(errorFrom(doc({ nodes: [node('a', { h: bad })] as never }))).toBe(
        'nodes[0].h: must be greater than zero',
      )
    }
  })

  it('still allows a negative x or y — those are ordinary canvas coordinates', () => {
    expect(parseDocument(doc({ nodes: [node('a', { x: -500, y: -20 })] as never })).ok).toBe(true)
  })

  it('rejects a non-finite number', () => {
    // JSON has no NaN literal; a string that parses to one does not exist, so
    // this covers the guard against a hand-built value reaching here.
    expect(errorFrom(doc({ nodes: [node('a', { x: null })] as never }))).toBe(
      'nodes[0].x: must be a finite number',
    )
  })

  it('rejects an id outside the pattern', () => {
    expect(errorFrom(doc({ nodes: [node('has space')] as never }))).toMatch(
      /^nodes\[0\]\.id: must match/,
    )
  })

  it('rejects an id containing a quote — the concrete hazard behind the pattern', () => {
    expect(errorFrom(doc({ nodes: [node('a"b')] as never }))).toMatch(/^nodes\[0\]\.id: must match/)
  })

  it('rejects an empty id', () => {
    expect(errorFrom(doc({ nodes: [node('')] as never }))).toMatch(/^nodes\[0\]\.id: must match/)
  })

  it('ACCEPTS a bare CSS keyword, including the shape default', () => {
    // Removing the keyword branch left the whole suite green while making a
    // legal hand-authored document unimportable.
    for (const color of [nodeShapeDefaultProps.color, 'red', 'rebeccapurple']) {
      const result = parseDocument(doc({ nodes: [node('a', { color })] as never }))
      expect(result.ok).toBe(true)
    }
  })

  it('rejects an invalid color', () => {
    expect(errorFrom(doc({ nodes: [node('a', { color: '#gggggg' })] as never }))).toMatch(
      /^nodes\[0\]\.color: must be a hex color/,
    )
    // Uppercase keywords are rejected, and the message says why.
    expect(errorFrom(doc({ nodes: [node('a', { color: 'RED' })] as never }))).toContain('lowercase')
  })

  it('rejects an explicit null for nodes or connections — `?? []` would swallow it', () => {
    expect(errorFrom(json({ version: DOCUMENT_VERSION, nodes: null }))).toBe(
      'document.nodes: must be an array',
    )
    expect(errorFrom(json({ version: DOCUMENT_VERSION, connections: null }))).toBe(
      'document.connections: must be an array',
    )
  })

  it('rejects a non-array nodes or connections', () => {
    expect(errorFrom(json({ version: DOCUMENT_VERSION, nodes: {} }))).toBe(
      'document.nodes: must be an array',
    )
  })

  it('rejects a wrong type on every remaining optional and required field', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ label: 1 }, 'nodes[0].label: must be a string'],
      [{ rotation: 'x' }, 'nodes[0].rotation: must be a finite number'],
      [{ collapsed: 'yes' }, 'nodes[0].collapsed: must be a boolean'],
      [{ parentId: 7 }, 'nodes[0].parentId: must be a string'],
      [{ color: 7 }, 'nodes[0].color: must be a string'],
      [{ w: '100' }, 'nodes[0].w: must be a finite number'],
    ]
    for (const [over, expected] of cases) {
      expect(errorFrom(doc({ nodes: [node('a', over)] as never }))).toBe(expected)
    }
  })

  it('rejects a non-string on a connection endpoint, and a bad connection id', () => {
    expect(
      errorFrom(
        doc({
          nodes: [node('a')] as never,
          connections: [{ id: 'c', sourceId: 1, targetId: 'a' }] as never,
        }),
      ),
    ).toBe('connections[0].sourceId: must be a string')
    // The id pattern applies to CONNECTION ids too -- half of the one-namespace
    // argument, and it was asserted only for nodes.
    expect(
      errorFrom(
        doc({
          nodes: [node('a')] as never,
          connections: [{ id: 'bad id', sourceId: 'a', targetId: 'a' }] as never,
        }),
      ),
    ).toMatch(/^connections\[0\]\.id: must match/)
  })

  it('rejects a dangling parentId', () => {
    expect(errorFrom(doc({ nodes: [node('a', { parentId: 'nope' })] as never }))).toBe(
      'nodes[0].parentId: no node with id "nope"',
    )
  })

  it('rejects a dangling sourceId', () => {
    expect(
      errorFrom(
        doc({
          nodes: [node('a')] as never,
          connections: [{ id: 'c', sourceId: 'nope', targetId: 'a' }] as never,
        }),
      ),
    ).toBe('connections[0].sourceId: no node with id "nope"')
  })

  it('rejects a dangling targetId', () => {
    expect(
      errorFrom(
        doc({
          nodes: [node('a')] as never,
          connections: [{ id: 'c', sourceId: 'a', targetId: 'nope' }] as never,
        }),
      ),
    ).toBe('connections[0].targetId: no node with id "nope"')
  })
})

describe('parseDocument — ids are one namespace', () => {
  it('rejects a node id used twice', () => {
    expect(errorFrom(doc({ nodes: [node('a'), node('a')] as never }))).toBe(
      'nodes[1].id: duplicate id "a"',
    )
  })

  it('rejects a connection id used twice', () => {
    expect(
      errorFrom(
        doc({
          nodes: [node('a'), node('b')] as never,
          connections: [
            { id: 'c', sourceId: 'a', targetId: 'b' },
            { id: 'c', sourceId: 'b', targetId: 'a' },
          ] as never,
        }),
      ),
    ).toBe('connections[1].id: duplicate id "c" (already used by a connection)')
  })

  it('rejects a connection id equal to a node id — the record-overwrite case', () => {
    expect(
      errorFrom(
        doc({
          nodes: [node('a'), node('b')] as never,
          connections: [{ id: 'a', sourceId: 'a', targetId: 'b' }] as never,
        }),
      ),
    ).toBe('connections[0].id: duplicate id "a" (already used by a node)')
  })
})

describe('parseDocument — cycles', () => {
  it('rejects a node parented to itself', () => {
    expect(errorFrom(doc({ nodes: [node('a', { parentId: 'a' })] as never }))).toBe(
      'nodes[0].parentId: parentId cycle',
    )
  })

  it('rejects a three-node cycle', () => {
    expect(
      errorFrom(
        doc({
          nodes: [
            node('a', { parentId: 'b' }),
            node('b', { parentId: 'c' }),
            node('c', { parentId: 'a' }),
          ] as never,
        }),
      ),
    ).toBe('nodes[0].parentId: parentId cycle')
  })

  it('names the LOWEST-indexed member, whatever order the cycle is walked in', () => {
    // Every member of a cycle is equally offending, so "whichever we noticed
    // first" would make the message depend on iteration order.
    const nodes = [
      node('z', { parentId: 'y' }),
      node('y', { parentId: 'x' }),
      node('x', { parentId: 'z' }),
    ]
    expect(errorFrom(doc({ nodes: nodes as never }))).toBe('nodes[0].parentId: parentId cycle')
    expect(errorFrom(doc({ nodes: [...nodes].reverse() as never }))).toBe(
      'nodes[0].parentId: parentId cycle',
    )
  })

  it('names the lowest member of the CYCLE, not of the tail leading into it', () => {
    // The 3-cycle above cannot tell these apart: there, index 0 is both. Here
    // the tail is indices 0-2 and the cycle is 3-5, so a walk-wide minimum
    // would wrongly report nodes[0].
    const nodes = [
      node('t0'),
      node('t1', { parentId: 't0' }),
      node('t2', { parentId: 't1' }),
      node('c0', { parentId: 'c2' }),
      node('c1', { parentId: 'c0' }),
      node('c2', { parentId: 'c1' }),
    ]
    // t2 hangs off the tail; make it reach the cycle so one walk covers both.
    nodes[0] = node('t0', { parentId: 'c0' })
    expect(errorFrom(doc({ nodes: nodes as never }))).toBe('nodes[3].parentId: parentId cycle')
  })

  it('accepts a deep chain that is not a cycle', () => {
    const nodes = Array.from({ length: 200 }, (_, i) =>
      node(`n${i}`, i === 0 ? {} : { parentId: `n${i - 1}` }),
    )
    expect(parseDocument(doc({ nodes: nodes as never })).ok).toBe(true)
  })

  it('is LINEAR: a 20,000-node parent chain parses fast', () => {
    // The per-node ancestor walk -- the version that is obvious to write -- was
    // measured at 12.5s on this input. A generous bound: the point is to fail
    // if someone replaces the colored walk, not to benchmark the machine.
    const nodes = Array.from({ length: 20_000 }, (_, i) =>
      node(`n${i}`, i === 0 ? {} : { parentId: `n${i - 1}` }),
    )
    const started = Date.now()
    expect(parseDocument(doc({ nodes: nodes as never })).ok).toBe(true)
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

describe('parseDocument — totality', () => {
  it('rejects a document with two independent errors, naming a real one and returning none', () => {
    // Which one is named follows the PHASE order (per-field, then identity,
    // then references, then cycles), not the array index -- so the duplicate at
    // index 1 outranks the dangling parentId at index 0. Both are genuine; the
    // guarantee is that no partial document escapes.
    const result = parseDocument(
      doc({ nodes: [node('a', { parentId: 'nope' }), node('a')] as never }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('nodes[1].id: duplicate id "a"')
    expect(result).not.toHaveProperty('document')
  })
})

describe('toDocument', () => {
  it('strips the shape: prefix and carries the fields', () => {
    const document = toDocument(
      [
        exportableNode('web', {
          x: 10,
          y: 20,
          props: { w: 300, h: 200, label: 'Web', color: '#4f8ff7', collapsed: true },
        }),
      ],
      [],
      [],
    )
    expect(document.nodes).toEqual([
      { id: 'web', label: 'Web', x: 10, y: 20, w: 300, h: 200, color: '#4f8ff7', collapsed: true },
    ])
  })

  it('omits rotation, color and collapsed at their defaults — one rule for all three', () => {
    const document = toDocument(
      [exportableNode('a', { props: { ...nodeShapeDefaultProps, w: 100, h: 60, label: 'a' } })],
      [],
      [],
    )
    expect(Object.keys(document.nodes[0]!).sort()).toEqual(['h', 'id', 'label', 'w', 'x', 'y'])
  })

  it('the omit-at-default colour tracks the SHAPE default, not a copy of it', () => {
    // A second home for that fact drifts silently: change the shape default and
    // every export starts emitting an explicit color while the suite stays green.
    const document = toDocument(
      [
        exportableNode('a', {
          props: { w: 1, h: 1, label: 'a', color: nodeShapeDefaultProps.color, collapsed: false },
        }),
      ],
      [],
      [],
    )
    expect(document.nodes[0]).not.toHaveProperty('color')
  })

  it('carries a shape parentId and drops a page parentId', () => {
    const document = toDocument(
      [exportableNode('p'), exportableNode('c', { parentId: 'shape:p', x: 5, y: 7 })],
      [],
      [],
    )
    expect(document.nodes.find((n) => n.id === 'p')!.parentId).toBeUndefined()
    // Positions are carried verbatim: a child's is parent-relative, as stored.
    expect(document.nodes.find((n) => n.id === 'c')).toMatchObject({ parentId: 'p', x: 5, y: 7 })
  })

  it('exports a connection with both terminals bound', () => {
    const document = toDocument(
      [exportableNode('a'), exportableNode('b')],
      [exportableConnection('c')],
      [binding('c', 'a', 'start'), binding('c', 'b', 'end')],
    )
    expect(document.connections).toEqual([{ id: 'c', sourceId: 'a', targetId: 'b' }])
  })

  it('sorts by document id under plain `<`, not by input order', () => {
    const a = toDocument([exportableNode('b'), exportableNode('a')], [], [])
    const b = toDocument([exportableNode('a'), exportableNode('b')], [], [])
    expect(json(a)).toBe(json(b))
    expect(a.nodes.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('sorts mixed-case ids the way merge.ts does, not the way localeCompare does', () => {
    const document = toDocument([exportableNode('aB'), exportableNode('Ab')], [], [])
    expect(document.nodes.map((n) => n.id)).toEqual(['Ab', 'aB'])
  })
})

describe('toDocument — never emits a document parseDocument rejects', () => {
  it('omits a connection with no binding for a terminal (mid-drag)', () => {
    const document = toDocument(
      [exportableNode('a')],
      [exportableConnection('c')],
      [binding('c', 'a', 'start')],
    )
    expect(document.connections).toEqual([])
    expect(parseDocument(json(document)).ok).toBe(true)
  })

  it('omits a connection with TWO bindings on the SAME terminal', () => {
    // Not hypothetical: two clients re-aiming the same end concurrently produce
    // exactly this, since sync is last-write-wins per record, not per terminal.
    // A "exactly two bindings" test would export an undefined targetId here.
    const document = toDocument(
      [exportableNode('a'), exportableNode('b')],
      [exportableConnection('c')],
      [binding('c', 'a', 'start'), binding('c', 'b', 'start')],
    )
    expect(document.connections).toEqual([])
    expect(parseDocument(json(document)).ok).toBe(true)
  })

  it('omits a connection bound to a shape that no longer exists', () => {
    const document = toDocument(
      [exportableNode('a')],
      [exportableConnection('c')],
      [binding('c', 'a', 'start'), binding('c', 'gone', 'end')],
    )
    expect(document.connections).toEqual([])
    expect(parseDocument(json(document)).ok).toBe(true)
  })

  it('omits a node nested inside a shape the document cannot describe, and its subtree', () => {
    const document = toDocument(
      [
        exportableNode('scened', { parentId: 'shape:someScene' }),
        exportableNode('deep', { parentId: 'shape:scened' }),
        exportableNode('fine'),
      ],
      [],
      [],
    )
    expect(document.nodes.map((n) => n.id)).toEqual(['fine'])
    expect(parseDocument(json(document)).ok).toBe(true)
  })

  it('omits a connection whose endpoint is an undocumentable node', () => {
    const document = toDocument(
      [exportableNode('scened', { parentId: 'shape:someScene' }), exportableNode('ok')],
      [exportableConnection('c')],
      [binding('c', 'ok', 'start'), binding('c', 'scened', 'end')],
    )
    expect(document.connections).toEqual([])
    expect(parseDocument(json(document)).ok).toBe(true)
  })

  it('does not hang on a parentId cycle in hand-built records', () => {
    const document = toDocument(
      [exportableNode('a', { parentId: 'shape:b' }), exportableNode('b', { parentId: 'shape:a' })],
      [],
      [],
    )
    expect(document.nodes).toEqual([])
  })
})

describe('fromDocument', () => {
  it('mints shape ids and restores the omitted defaults', () => {
    // The literal 'black' below is a DELIBERATE TRIPWIRE, not laziness. Changing
    // the node shape's default color silently changes what every existing
    // document means: a node with no `color` starts importing as the new
    // default, and every export starts emitting an explicit one. That is a
    // migration-shaped decision, and this is where someone is made to notice.
    const parsed = parseDocument(doc({ nodes: [node('a')] as never }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const { nodes } = fromDocument(parsed.document, PAGE)
    expect(nodes[0]).toEqual({
      id: 'shape:a',
      type: NODE_SHAPE_TYPE,
      parentId: PAGE,
      x: 0,
      y: 0,
      rotation: 0,
      props: { w: 100, h: 60, label: 'a', color: 'black', collapsed: false },
    })
  })

  it('emits a `type` on every shape, or createShapes throws and takes the canvas with it', () => {
    // The round trip cannot catch this: toDocument never reads `type`, so the
    // one field that makes a shape a shape is exactly the field the round trip
    // is closed over. Asserted on the KEY SET, so a missing field fails here
    // rather than in a React error boundary.
    const parsed = parseDocument(
      doc({
        nodes: [node('a'), node('b')] as never,
        connections: [{ id: 'c', sourceId: 'a', targetId: 'b' }] as never,
      }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const { nodes, connections } = fromDocument(parsed.document, PAGE)
    const keys = ['id', 'parentId', 'props', 'rotation', 'type', 'x', 'y']
    for (const record of [...nodes, ...connections]) {
      expect(Object.keys(record).sort()).toEqual(keys)
    }
    expect(nodes.map((n) => n.type)).toEqual([NODE_SHAPE_TYPE, NODE_SHAPE_TYPE])
    expect(connections.map((c) => c.type)).toEqual([CONNECTION_SHAPE_TYPE])
  })

  it('orders a parent before its child, whatever order the document lists them in', () => {
    const parsed = parseDocument(doc({ nodes: [node('c', { parentId: 'p' }), node('p')] as never }))
    if (!parsed.ok) throw new Error(parsed.error)
    const { nodes } = fromDocument(parsed.document, PAGE)
    expect(nodes.map((n) => n.id)).toEqual(['shape:p', 'shape:c'])
  })

  it('parents a connection to the PAGE with zeroed geometry and the default props', () => {
    // Asserted nowhere before: toDocument never reads these fields, so the
    // round-trip tests cannot see them either. Parenting a connection to a node
    // would change its coordinate space on import.
    const parsed = parseDocument(
      doc({
        nodes: [node('a'), node('b')] as never,
        connections: [{ id: 'c', sourceId: 'a', targetId: 'b' }] as never,
      }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const { connections } = fromDocument(parsed.document, PAGE)
    expect(connections).toEqual([
      {
        id: 'shape:c',
        type: CONNECTION_SHAPE_TYPE,
        parentId: PAGE,
        x: 0,
        y: 0,
        rotation: 0,
        props: connectionShapeDefaultProps,
      },
    ])
  })

  it('gives each connection two bindings, one per terminal', () => {
    const parsed = parseDocument(
      doc({
        nodes: [node('a'), node('b')] as never,
        connections: [{ id: 'c', sourceId: 'a', targetId: 'b' }] as never,
      }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const { bindings } = fromDocument(parsed.document, PAGE)
    expect(bindings).toEqual([binding('c', 'a', 'start'), binding('c', 'b', 'end')])
  })
})

describe('toDocument — the binding join is indexed, not scanned', () => {
  it('stays linear with many connections', () => {
    // Two full scans of every binding per connection is O(C^2): measured at 2.0s
    // for 16,000 connections. The module reasons about linearity twice
    // elsewhere and cites numbers; this was the loop nobody checked.
    const count = 16_000
    const nodes = [exportableNode('a'), exportableNode('b')]
    const connections = Array.from({ length: count }, (_, i) => exportableConnection(`c${i}`))
    const bindings = connections.flatMap((_, i) => [
      binding(`c${i}`, 'a', 'start'),
      binding(`c${i}`, 'b', 'end'),
    ])
    const started = Date.now()
    expect(toDocument(nodes, connections, bindings).connections).toHaveLength(count)
    expect(Date.now() - started).toBeLessThan(1_000)
  })
})

describe('the round trip', () => {
  const source = doc({
    nodes: [
      node('platform', { w: 400, h: 300, collapsed: true, color: '#4f8ff7' }),
      node('web', { parentId: 'platform', x: 20, y: 40, rotation: 0.25 }),
      node('db', { x: 700, y: 100 }),
    ] as never,
    connections: [{ id: 'web-db', sourceId: 'web', targetId: 'db' }] as never,
  })

  it('document -> records -> document preserves content, and RE-SORTS by id', () => {
    // Not a fixed point on the FIRST pass, and that is the documented
    // behaviour: parseDocument keeps the author's array order, toDocument sorts
    // by id. Asserted rather than glossed, because a reader who assumes
    // byte-identity here will write a test that fails for the right reason and
    // then "fix" the exporter.
    const first = parseDocument(source)
    if (!first.ok) throw new Error(first.error)
    const { nodes, connections, bindings } = fromDocument(first.document, PAGE)
    const round = toDocument(nodes, connections, bindings)

    expect(round.nodes.map((n) => n.id)).toEqual(['db', 'platform', 'web'])
    expect([...round.nodes].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(
      [...first.document.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)),
    )
    expect(round.connections).toEqual(first.document.connections)
  })

  it('IS a fixed point from the second pass on', () => {
    const first = parseDocument(source)
    if (!first.ok) throw new Error(first.error)
    const one = fromDocument(first.document, PAGE)
    const pass1 = toDocument(one.nodes, one.connections, one.bindings)
    const two = fromDocument(pass1, PAGE)
    const pass2 = toDocument(two.nodes, two.connections, two.bindings)
    expect(json(pass2)).toBe(json(pass1))
  })

  it('array order is not significant: reversing the input changes nothing in the output', () => {
    const first = parseDocument(source)
    if (!first.ok) throw new Error(first.error)
    const one = fromDocument(first.document, PAGE)
    const straight = toDocument(one.nodes, one.connections, one.bindings)

    const reparsed = parseDocument(
      json({
        version: DOCUMENT_VERSION,
        nodes: [...first.document.nodes].reverse(),
        connections: first.document.connections,
      }),
    )
    if (!reparsed.ok) throw new Error(reparsed.error)
    const other = fromDocument(reparsed.document, PAGE)
    expect(json(toDocument(other.nodes, other.connections, other.bindings))).toBe(json(straight))
  })

  it('the SAME diagram built in two different creation orders exports identically', () => {
    // The real determinism test. Exporting one diagram twice is not: the store
    // does not change between the calls, so an implementation that iterates
    // insertion order passes that.
    const forwards = toDocument(
      [exportableNode('a'), exportableNode('b'), exportableNode('c')],
      [exportableConnection('x')],
      [binding('x', 'a', 'start'), binding('x', 'c', 'end')],
    )
    const backwards = toDocument(
      [exportableNode('c'), exportableNode('b'), exportableNode('a')],
      [exportableConnection('x')],
      [binding('x', 'a', 'start'), binding('x', 'c', 'end')],
    )
    expect(json(forwards)).toBe(json(backwards))
  })

  it('an author-chosen id survives, so loading does not rewrite the document', () => {
    const parsed = parseDocument(doc({ nodes: [node('web-server')] as never }))
    if (!parsed.ok) throw new Error(parsed.error)
    const r = fromDocument(parsed.document, PAGE)
    expect(r.nodes[0]!.id).toBe('shape:web-server')
    expect(toDocument(r.nodes, r.connections, r.bindings).nodes[0]!.id).toBe('web-server')
  })
})

describe('the shape types a document can describe', () => {
  it('is exactly the node and the connection', () => {
    // Not decoration: a third custom shape type added later has to be a
    // deliberate decision about whether the document covers it, and this is
    // where that decision gets made rather than forgotten.
    expect([...DOCUMENTABLE_SHAPE_TYPES]).toEqual([NODE_SHAPE_TYPE, CONNECTION_SHAPE_TYPE])
  })
})

describe('scenes in a document', () => {
  const withDiagram = (scenes: unknown[]) =>
    json({
      version: DOCUMENT_VERSION,
      nodes: [node('a'), node('b')],
      connections: [{ id: 'k', sourceId: 'a', targetId: 'b' }],
      scenes,
    })

  it('defaults to [] so a scene-less document is valid', () => {
    const result = parseDocument(doc())
    expect(result.ok && result.document.scenes).toEqual([])
  })

  it('rejects an explicit null rather than coalescing it to empty', () => {
    // The bug `nodes` and `connections` already carry a comment about: `?? []`
    // would accept this and show the author an empty result instead of an error.
    expect(errorFrom(json({ version: DOCUMENT_VERSION, scenes: null }))).toBe(
      'document.scenes: must be an array',
    )
  })

  it('carries name, note, collapsed and highlighted through', () => {
    const result = parseDocument(
      withDiagram([
        {
          id: 's1',
          name: 'Overview',
          note: 'Start here.',
          collapsed: { a: true },
          highlighted: ['k'],
        },
      ]),
    )
    expect(result.ok && result.document.scenes).toEqual([
      {
        id: 's1',
        name: 'Overview',
        note: 'Start here.',
        collapsed: { a: true },
        highlighted: ['k'],
      },
    ])
  })

  it('ACCEPTS a scene id equal to a node or connection id', () => {
    // Scenes mint `diagramScene:<id>`, a different record type in a different id
    // space, so nothing is overwritten. The reverse rule would make a room that
    // legitimately holds both unexportable.
    const result = parseDocument(withDiagram([{ id: 'a', name: 'same as a node' }]))
    expect(result.ok).toBe(true)
  })

  it.each([
    [{ id: 's', name: 'x', bogus: 1 }, 'scenes[0].bogus: unknown key'],
    [{ name: 'x' }, 'scenes[0].id: must be a string'],
    [
      { id: 's has spaces', name: 'x' },
      `scenes[0].id: must match ${String(/^[A-Za-z0-9_.-]{1,128}$/)}`,
    ],
    [{ id: 's' }, 'scenes[0].name: must be a string'],
    [{ id: 's', name: 1 }, 'scenes[0].name: must be a string'],
    [{ id: 's', name: 'x', note: 1 }, 'scenes[0].note: must be a string'],
    [{ id: 's', name: 'x', collapsed: [] }, 'scenes[0].collapsed: must be an object'],
    [
      { id: 's', name: 'x', collapsed: { a: 'yes' } },
      'scenes[0].collapsed["a"]: must be a boolean',
    ],
    [{ id: 's', name: 'x', highlighted: {} }, 'scenes[0].highlighted: must be an array'],
    [{ id: 's', name: 'x', highlighted: [1] }, 'scenes[0].highlighted[0]: must be a string'],
  ])('rejects %j', (scene, message) => {
    expect(errorFrom(withDiagram([scene]))).toBe(message)
  })

  it('rejects a duplicate scene id, naming its path', () => {
    expect(
      errorFrom(
        withDiagram([
          { id: 's', name: 'one' },
          { id: 's', name: 'two' },
        ]),
      ),
    ).toBe('scenes[1].id: duplicate id "s"')
  })

  it('gives a collapsed key that names NOTHING its own error', () => {
    expect(errorFrom(withDiagram([{ id: 's', name: 'x', collapsed: { nope: true } }]))).toBe(
      'scenes[0].collapsed["nope"]: no node with id "nope"',
    )
  })

  it('gives a collapsed key that names a CONNECTION a different error', () => {
    // Two different authoring mistakes, so two different messages: one is a
    // typo, the other is a misunderstanding of what collapsing means.
    expect(errorFrom(withDiagram([{ id: 's', name: 'x', collapsed: { k: true } }]))).toBe(
      'scenes[0].collapsed["k"]: names a connection, which cannot be collapsed',
    )
  })

  it('rejects a dangling highlight, naming its path', () => {
    expect(errorFrom(withDiagram([{ id: 's', name: 'x', highlighted: ['ghost'] }]))).toBe(
      'scenes[0].highlighted[0]: no node or connection with id "ghost"',
    )
  })

  it('accepts a highlight naming a CONNECTION, not only a node', () => {
    const result = parseDocument(withDiagram([{ id: 's', name: 'x', highlighted: ['k', 'a'] }]))
    expect(result.ok && result.document.scenes[0]!.highlighted).toEqual(['k', 'a'])
  })
})

describe('toDocument — scenes', () => {
  const nodes = [exportableNode('a'), exportableNode('b')]
  const conns = [exportableConnection('k')]
  const binds = [binding('k', 'a', 'start'), binding('k', 'b', 'end')]

  it('strips the diagramScene: prefix and omits the three defaults', () => {
    const out = toDocument(nodes, conns, binds, [exportableScene('s1')])
    expect(out.scenes).toEqual([{ id: 's1', name: 's1' }])
  })

  it('keeps a surviving CONNECTION highlight', () => {
    // The case the drop-cases cannot see, and the one a builder filtering
    // `highlighted` through the node set would silently break -- every drop
    // test still passes while every connection highlight vanishes.
    const out = toDocument(nodes, conns, binds, [
      exportableScene('s1', { highlighted: ['shape:k', 'shape:a'] }),
    ])
    expect(out.scenes[0]!.highlighted).toEqual(['k', 'a'])
  })

  it('drops references the document does not carry, and still validates', () => {
    const out = toDocument(nodes, conns, binds, [
      exportableScene('s1', {
        collapsed: { 'shape:a': true, 'shape:ghost': true },
        highlighted: ['shape:ghost', 'shape:b'],
      }),
    ])
    expect(out.scenes[0]!.collapsed).toEqual({ a: true })
    expect(out.scenes[0]!.highlighted).toEqual(['b'])
    expect(parseDocument(json(out)).ok).toBe(true)
  })

  it('keeps a scene that ends up naming NOTHING, and still validates', () => {
    const out = toDocument(nodes, conns, binds, [
      exportableScene('s1', { collapsed: { 'shape:ghost': true }, highlighted: ['shape:ghost'] }),
    ])
    expect(out.scenes).toEqual([{ id: 's1', name: 's1' }])
    expect(parseDocument(json(out)).ok).toBe(true)
  })

  it('exports a room of scenes with NO diagram at all, and still validates', () => {
    const out = toDocument([], [], [], [exportableScene('s1', { collapsed: { 'shape:a': true } })])
    expect(out.scenes).toEqual([{ id: 's1', name: 's1' }])
    expect(parseDocument(json(out)).ok).toBe(true)
  })

  it('drops a highlight on a half-bound connection', () => {
    const half = [binding('k', 'a', 'start')]
    const out = toDocument(nodes, conns, half, [
      exportableScene('s1', { highlighted: ['shape:k'] }),
    ])
    expect(out.connections).toEqual([])
    expect(out.scenes).toEqual([{ id: 's1', name: 's1' }])
  })

  it('breaks an index TIE on id, under plain <', () => {
    // Passed in REVERSE id order deliberately: Array.sort is stable, so without
    // the tiebreak the result is input order and the mutation would not bite.
    const out = toDocument(nodes, conns, binds, [
      exportableScene('zz', { index: 'a1' }),
      exportableScene('aa', { index: 'a1' }),
    ])
    expect(out.scenes.map((s) => s.id)).toEqual(['aa', 'zz'])
  })

  it('sorts by index before id', () => {
    const out = toDocument(nodes, conns, binds, [
      exportableScene('aa', { index: 'a2' }),
      exportableScene('zz', { index: 'a1' }),
    ])
    expect(out.scenes.map((s) => s.id)).toEqual(['zz', 'aa'])
  })
})

describe('fromDocument — scenes', () => {
  it('returns scenes in ARRAY order, prefixed, with no index', () => {
    const parsed = parseDocument(
      json({
        version: DOCUMENT_VERSION,
        nodes: [node('a')],
        connections: [],
        scenes: [
          { id: 'second', name: 'Second', collapsed: { a: true } },
          { id: 'first', name: 'First', highlighted: ['a'] },
        ],
      }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    expect(fromDocument(parsed.document, PAGE).scenes).toEqual([
      {
        id: 'diagramScene:second',
        name: 'Second',
        note: '',
        collapsed: { 'shape:a': true },
        highlighted: [],
      },
      {
        id: 'diagramScene:first',
        name: 'First',
        note: '',
        collapsed: {},
        highlighted: ['shape:a'],
      },
    ])
  })

  it('array order in is array order out, on twelve scenes', () => {
    // Twelve, not three: the count at which a plausible index scheme first
    // scrambles, since 'a10' < 'a2'.
    const ids = Array.from({ length: 12 }, (_, i) => `s${i + 1}`)
    const parsed = parseDocument(
      json({ version: DOCUMENT_VERSION, scenes: ids.map((id) => ({ id, name: id })) }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    expect(fromDocument(parsed.document, PAGE).scenes.map((s) => s.id)).toEqual(
      ids.map((id) => `diagramScene:${id}`),
    )
  })
})
