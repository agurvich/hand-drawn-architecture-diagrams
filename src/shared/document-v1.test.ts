import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument, fromDocument } from './document'

/**
 * THE FROZEN v1 CORPUS.
 *
 * Every other test in this repo builds its fixtures from the live
 * `DOCUMENT_VERSION`, which means flipping that constant converts the whole
 * suite into a suite for the NEW version rather than leaving a regression test
 * behind -- the tests keep passing while testing nothing about the old format.
 *
 * These files are the answer: literal `"version": 1`, hard-coded, never derived
 * from the constant. That literal IS the fixture. They were written and made
 * green while 1 was still the current version, so they are evidence about v1
 * rather than a description of whatever the code does now.
 *
 * The assertion is on `fromDocument`'s RECORD SET, not on the parsed document.
 * A parsed v1 document legitimately comes back carrying the current version
 * number; what must not change is the shapes, connections and bindings a v1
 * document turns into. A parse that succeeds and produces different records is
 * exactly the failure this guards, and asserting on the parse output would miss
 * it entirely.
 *
 * Read with `process.cwd()`, not `import.meta.url`: the suite runs under jsdom
 * (`vitest.config.ts`), where `import.meta.url` is not a `file:` URL -- the same
 * reason `shared-imports.test.ts` and `guide-examples.test.ts` resolve this way.
 */

const CORPUS = resolve(process.cwd(), 'src/shared/__fixtures__/v1')
const FILES = readdirSync(CORPUS)
  .filter((name) => name.endsWith('.json'))
  .sort()

const PAGE_ID = 'page:corpus'

function records(name: string) {
  const result = parseDocument(readFileSync(resolve(CORPUS, name), 'utf8'))
  if (!result.ok) throw new Error(`${name} was rejected: ${result.error}`)
  return fromDocument(result.document, PAGE_ID)
}

/**
 * The record set each corpus file produced while `DOCUMENT_VERSION` was still 1.
 * Inlined rather than kept in a sibling file on purpose: a frozen expectation
 * that lives beside a generator is one careless `>` from being rewritten to
 * match whatever the code now does. Here it has to be edited in a diff someone
 * reads.
 *
 * It is EXPECTED to need one edit, in the phase that adds `scenes` to
 * `fromDocument`'s return -- and in no other phase. A change here outside that
 * phase means v1 documents stopped meaning what they meant.
 */
const EXPECTED = {
  'connections-and-defaults.json': {
    nodes: [
      {
        id: 'shape:a',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          w: 200,
          h: 120,
          label: 'A',
          color: 'black',
          collapsed: false,
        },
      },
      {
        id: 'shape:b',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 400,
        y: 0,
        rotation: 0,
        props: {
          w: 200,
          h: 120,
          label: 'B',
          color: '#ff8800',
          collapsed: false,
        },
      },
      {
        id: 'shape:c',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 800,
        y: 0,
        rotation: 0.5,
        props: {
          w: 200,
          h: 120,
          label: 'C',
          color: 'black',
          collapsed: false,
        },
      },
    ],
    connections: [
      {
        id: 'shape:a-b',
        type: 'diagramConnection',
        parentId: 'page:corpus',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          start: {
            x: 0,
            y: 0,
          },
          end: {
            x: 100,
            y: 0,
          },
        },
      },
      {
        id: 'shape:b-c',
        type: 'diagramConnection',
        parentId: 'page:corpus',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          start: {
            x: 0,
            y: 0,
          },
          end: {
            x: 100,
            y: 0,
          },
        },
      },
    ],
    bindings: [
      {
        type: 'connectionEndpoint',
        fromId: 'shape:a-b',
        toId: 'shape:a',
        props: {
          terminal: 'start',
        },
      },
      {
        type: 'connectionEndpoint',
        fromId: 'shape:a-b',
        toId: 'shape:b',
        props: {
          terminal: 'end',
        },
      },
      {
        type: 'connectionEndpoint',
        fromId: 'shape:b-c',
        toId: 'shape:b',
        props: {
          terminal: 'start',
        },
      },
      {
        type: 'connectionEndpoint',
        fromId: 'shape:b-c',
        toId: 'shape:c',
        props: {
          terminal: 'end',
        },
      },
    ],
  },
  'id-edges.json': {
    nodes: [
      {
        id: 'shape:x',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          w: 100,
          h: 100,
          label: 'one char',
          color: 'black',
          collapsed: false,
        },
      },
      {
        id: 'shape:Loooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooog',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 200,
        y: 0,
        rotation: 0,
        props: {
          w: 100,
          h: 100,
          label: '128 chars',
          color: 'black',
          collapsed: false,
        },
      },
      {
        id: 'shape:dot.dash-under_score',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 400,
        y: 0,
        rotation: 0,
        props: {
          w: 100,
          h: 100,
          label: 'punctuation',
          color: 'black',
          collapsed: false,
        },
      },
    ],
    connections: [],
    bindings: [],
  },
  'minimal.json': {
    nodes: [
      {
        id: 'shape:solo',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          w: 200,
          h: 120,
          label: 'Solo',
          color: 'black',
          collapsed: false,
        },
      },
    ],
    connections: [],
    bindings: [],
  },
  'nested-collapsed.json': {
    nodes: [
      {
        id: 'shape:outer',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          w: 600,
          h: 400,
          label: 'Outer',
          color: 'black',
          collapsed: false,
        },
      },
      {
        id: 'shape:middle',
        type: 'diagramNode',
        parentId: 'shape:outer',
        x: 40,
        y: 60,
        rotation: 0,
        props: {
          w: 400,
          h: 260,
          label: 'Middle',
          color: 'black',
          collapsed: true,
        },
      },
      {
        id: 'shape:inner',
        type: 'diagramNode',
        parentId: 'shape:middle',
        x: 30,
        y: 50,
        rotation: 0,
        props: {
          w: 180,
          h: 100,
          label: 'Inner',
          color: 'black',
          collapsed: false,
        },
      },
    ],
    connections: [],
    bindings: [],
  },
} as const

describe('the frozen v1 corpus', () => {
  it('is not empty -- an empty directory would pass every test below', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(4)
  })

  for (const name of FILES) {
    describe(name, () => {
      const source = readFileSync(resolve(CORPUS, name), 'utf8')

      it('declares version 1 as a literal', () => {
        expect(JSON.parse(source)).toMatchObject({ version: 1 })
      })

      it('parses', () => {
        const result = parseDocument(source)
        if (!result.ok) throw new Error(`${name} was rejected: ${result.error}`)
      })
    })
  }

  it('turns into the same records it always did', () => {
    const actual: Record<string, unknown> = {}
    for (const name of FILES) {
      const result = parseDocument(readFileSync(resolve(CORPUS, name), 'utf8'))
      if (!result.ok) throw new Error(`${name} was rejected: ${result.error}`)
      actual[name] = fromDocument(result.document, PAGE_ID)
    }
    expect(actual).toEqual(EXPECTED)
  })

  /**
   * The blob above catches ANY drift; these say what the corpus was built to
   * exercise, so a future edit to it can be judged rather than just diffed.
   */
  it('keeps a three-deep parent chain, with collapse on the middle only', () => {
    const nodes = records('nested-collapsed.json').nodes
    const byId = new Map(nodes.map((node) => [node.id, node]))
    expect(byId.get('shape:middle')?.parentId).toBe('shape:outer')
    expect(byId.get('shape:inner')?.parentId).toBe('shape:middle')
    expect(byId.get('shape:outer')?.parentId).toBe(PAGE_ID)
    expect(byId.get('shape:middle')?.props.collapsed).toBe(true)
    expect(byId.get('shape:inner')?.props.collapsed).toBe(false)
  })

  it('restores omitted fields to their defaults and keeps written ones', () => {
    const nodes = records('connections-and-defaults.json').nodes
    expect(nodes.map((node) => node.props.color)).toEqual(['black', '#ff8800', 'black'])
    expect(nodes.map((node) => node.rotation)).toEqual([0, 0, 0.5])
  })

  it('binds both ends of every connection', () => {
    const { bindings } = records('connections-and-defaults.json')
    expect(
      bindings.map((binding) => [binding.fromId, binding.toId, binding.props.terminal]),
    ).toEqual([
      ['shape:a-b', 'shape:a', 'start'],
      ['shape:a-b', 'shape:b', 'end'],
      ['shape:b-c', 'shape:b', 'start'],
      ['shape:b-c', 'shape:c', 'end'],
    ])
  })

  it('carries both ends of the id pattern through unchanged', () => {
    const ids = records('id-edges.json').nodes.map((node) => node.id.slice('shape:'.length))
    expect(ids.map((id) => id.length)).toEqual([1, 128, 20])
    expect(ids).toContain('dot.dash-under_score')
  })
})
