import { describe, it, expect } from 'vitest'
import {
  parseDocument,
  toDocument,
  fromDocument,
  DOCUMENT_VERSION,
  type DiagramDocument,
  type ExportableNode,
  type ExportableConnection,
  type BindingDescriptor,
} from './document'
import { NODE_SHAPE_TYPE } from './shapes/node'
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
    parentId: PAGE,
    x: 0,
    y: 0,
    rotation: 0,
    props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
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
      document: { version: DOCUMENT_VERSION, nodes: [], connections: [] },
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

  it('rejects an unknown version', () => {
    expect(errorFrom(json({ version: 99, nodes: [] }))).toBe(
      `document.version: expected ${DOCUMENT_VERSION}, got 99`,
    )
  })

  it('rejects an unknown key at the top level', () => {
    expect(errorFrom(json({ version: DOCUMENT_VERSION, frames: [] }))).toBe(
      'document.frames: unknown key',
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

  it('rejects an invalid color', () => {
    expect(errorFrom(doc({ nodes: [node('a', { color: '#gggggg' })] as never }))).toBe(
      'nodes[0].color: must be a hex color or a CSS color keyword',
    )
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
  it('reports at least the first of two independent errors, and returns no document', () => {
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
    const document = toDocument([exportableNode('a')], [], [])
    expect(Object.keys(document.nodes[0]!).sort()).toEqual(['h', 'id', 'label', 'w', 'x', 'y'])
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
        exportableNode('framed', { parentId: 'shape:someFrame' }),
        exportableNode('deep', { parentId: 'shape:framed' }),
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
      [exportableNode('framed', { parentId: 'shape:someFrame' }), exportableNode('ok')],
      [exportableConnection('c')],
      [binding('c', 'ok', 'start'), binding('c', 'framed', 'end')],
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
    const parsed = parseDocument(doc({ nodes: [node('a')] as never }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const { nodes } = fromDocument(parsed.document, PAGE)
    expect(nodes[0]).toEqual({
      id: 'shape:a',
      parentId: PAGE,
      x: 0,
      y: 0,
      rotation: 0,
      props: { w: 100, h: 60, label: 'a', color: 'black', collapsed: false },
    })
  })

  it('orders a parent before its child, whatever order the document lists them in', () => {
    const parsed = parseDocument(doc({ nodes: [node('c', { parentId: 'p' }), node('p')] as never }))
    if (!parsed.ok) throw new Error(parsed.error)
    const { nodes } = fromDocument(parsed.document, PAGE)
    expect(nodes.map((n) => n.id)).toEqual(['shape:p', 'shape:c'])
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

describe('the document module does not reach for the shape type strings', () => {
  it('exports the node type from the one definition', () => {
    // Cheap guard that the constants are the source, alongside the mechanical
    // check in shared-imports.test.ts.
    expect(NODE_SHAPE_TYPE).toBe('diagramNode')
  })
})
