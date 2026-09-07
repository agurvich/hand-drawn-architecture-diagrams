import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument, fromDocument, DOCUMENT_VERSION } from './document'

/**
 * THE FROZEN v2 CORPUS -- the sibling of `document-v1.test.ts`, and written for
 * the same reason.
 *
 * The v1 corpus proves v1 documents still mean what they meant. It says nothing
 * about v2, which is the version everything written since scenes shipped uses,
 * and therefore the one most likely to be sitting in somebody's chat window
 * right now. A version-3 bump with only a v1 corpus behind it would be testing
 * the format two steps back and taking the step in between on trust.
 *
 * Literal `"version": 2`, hard-coded, never derived from the constant. Written
 * and made green while 2 IS the current version, so it is evidence about v2
 * rather than a description of whatever the code does after the bump.
 *
 * The assertion is on `fromDocument`'s RECORD SET, not the parsed document: a
 * parsed v2 document legitimately comes back carrying the current version
 * number, and what must not change is the shapes, connections, bindings and
 * scenes it becomes.
 */

const CORPUS = resolve(process.cwd(), 'src/shared/__fixtures__/v2')
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
 * What each corpus file produced while `DOCUMENT_VERSION` was still 2.
 *
 * Inlined rather than kept beside a generator, for the reason the v1 blob is:
 * a frozen expectation living next to the thing that writes it is one careless
 * `>` from being rewritten to match whatever the code now does.
 *
 * It is EXPECTED to need one edit, in the phase that changes `fromDocument`'s
 * return -- and in no other phase.
 */
const EXPECTED = {
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
          icon: '',
        },
      },
    ],
    connections: [],
    bindings: [],
    scenes: [],
  },
  'no-scenes-key.json': {
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
          icon: '',
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
          color: 'black',
          collapsed: false,
          icon: '',
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
    ],
    scenes: [],
  },
  'scenes-at-their-defaults.json': {
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
          icon: '',
        },
      },
    ],
    connections: [],
    bindings: [],
    scenes: [
      {
        id: 'diagramScene:bare',
        name: 'Nothing folded, nothing lit',
        note: '',
        collapsed: {},
        highlighted: [],
      },
    ],
  },
  'scenes-naming-real-ids.json': {
    nodes: [
      {
        id: 'shape:client',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 0,
        y: 0,
        rotation: 0,
        props: {
          w: 200,
          h: 120,
          label: 'Client',
          color: 'black',
          collapsed: false,
          icon: '',
        },
      },
      {
        id: 'shape:platform',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 400,
        y: 0,
        rotation: 0,
        props: {
          w: 400,
          h: 320,
          label: 'Platform',
          color: 'black',
          collapsed: true,
          icon: '',
        },
      },
      {
        id: 'shape:gateway',
        type: 'diagramNode',
        parentId: 'shape:platform',
        x: 40,
        y: 40,
        rotation: 0,
        props: {
          w: 180,
          h: 100,
          label: 'Gateway',
          color: 'black',
          collapsed: false,
          icon: '',
        },
      },
      {
        id: 'shape:db',
        type: 'diagramNode',
        parentId: 'page:corpus',
        x: 900,
        y: 0,
        rotation: 0,
        props: {
          w: 200,
          h: 120,
          label: 'Postgres',
          color: 'black',
          collapsed: false,
          icon: '',
        },
      },
    ],
    connections: [
      {
        id: 'shape:client-gateway',
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
        id: 'shape:gateway-db',
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
        fromId: 'shape:client-gateway',
        toId: 'shape:client',
        props: {
          terminal: 'start',
        },
      },
      {
        type: 'connectionEndpoint',
        fromId: 'shape:client-gateway',
        toId: 'shape:gateway',
        props: {
          terminal: 'end',
        },
      },
      {
        type: 'connectionEndpoint',
        fromId: 'shape:gateway-db',
        toId: 'shape:gateway',
        props: {
          terminal: 'start',
        },
      },
      {
        type: 'connectionEndpoint',
        fromId: 'shape:gateway-db',
        toId: 'shape:db',
        props: {
          terminal: 'end',
        },
      },
    ],
    scenes: [
      {
        id: 'diagramScene:outline',
        name: 'The shape of it',
        note: 'Three things, one folded.',
        collapsed: {
          'shape:platform': true,
        },
        highlighted: [],
      },
      {
        id: 'diagramScene:inside',
        name: 'Inside the platform',
        note: '',
        collapsed: {
          'shape:platform': false,
        },
        highlighted: ['shape:gateway', 'shape:gateway-db'],
      },
    ],
  },
} as const

describe('the frozen v2 corpus', () => {
  it('is not empty, and covers what v2 ADDED', () => {
    // A corpus of documents that would have been valid at v1 proves nothing
    // about v2. Scenes are the whole of what v2 added.
    expect(FILES.length).toBeGreaterThanOrEqual(4)
    const withScenes = FILES.filter((name) => records(name).scenes.length > 0)
    expect(withScenes.length).toBeGreaterThanOrEqual(2)
  })

  for (const name of FILES) {
    describe(name, () => {
      const source = readFileSync(resolve(CORPUS, name), 'utf8')

      it('declares version 2 as a literal', () => {
        expect(JSON.parse(source)).toMatchObject({ version: 2 })
      })

      it('parses', () => {
        const result = parseDocument(source)
        if (!result.ok) throw new Error(`${name} was rejected: ${result.error}`)
      })
    })
  }

  it('turns into the same records it always did', () => {
    const actual: Record<string, unknown> = {}
    for (const name of FILES) actual[name] = records(name)
    expect(actual).toEqual(EXPECTED)
  })

  it('parses to the CURRENT version, which is why the assertion is on records', () => {
    const result = parseDocument(readFileSync(resolve(CORPUS, FILES[0]!), 'utf8'))
    if (!result.ok) throw new Error('rejected')
    expect(result.document.version).toBe(DOCUMENT_VERSION)
  })

  /**
   * The blob above catches ANY drift; these say what the corpus was built to
   * exercise, so a future edit to it can be judged rather than merely diffed.
   */
  it('keeps a scene naming real node and connection ids', () => {
    const scenes = records('scenes-naming-real-ids.json').scenes
    expect(scenes.map((s) => s.name)).toEqual(['The shape of it', 'Inside the platform'])
    expect(scenes[0]!.collapsed).toEqual({ 'shape:platform': true })
    expect(scenes[1]!.highlighted).toEqual(['shape:gateway', 'shape:gateway-db'])
  })

  it('restores a scene omitted fields to their defaults', () => {
    const scene = records('scenes-at-their-defaults.json').scenes[0]!
    expect(scene.note).toBe('')
    expect(scene.collapsed).toEqual({})
    expect(scene.highlighted).toEqual([])
  })

  it('accepts a v2 document with no scenes key at all', () => {
    expect(records('no-scenes-key.json').scenes).toEqual([])
  })
})
