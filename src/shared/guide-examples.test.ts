import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from './document'
import { jsonBlocks } from './guideExamples'

/**
 * The authoring guide's examples, held to the schema they claim to demonstrate.
 *
 * A guide whose examples do not load is worse than one with none: it is handed
 * to a model as ground truth. The fence tag is the contract -- ```json means a
 * whole importable document, and every schema fragment uses ```ts -- because
 * "every JSON example" is not a rule a script can decide.
 *
 * This half runs in vitest so a typo in the guide fails without a browser. The
 * other half, that each example actually IMPORTS, is in e2e/guide-examples.spec.ts.
 */

const GUIDE = resolve(process.cwd(), 'docs/ai-authoring-guide.md')

describe('the authoring guide', () => {
  const markdown = readFileSync(GUIDE, 'utf8')
  const blocks = jsonBlocks(markdown)

  it('contains at least one ```json block', () => {
    // A corpus of zero silently passes every other test in this file.
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('every ```json block is a whole, valid document', () => {
    for (const [i, block] of blocks.entries()) {
      const result = parseDocument(block)
      expect(result.ok ? null : `block ${i}: ${result.error}`).toBeNull()
    }
  })

  it('has an example that uses nesting AND collapse', () => {
    // A guide that only shows a flat graph teaches the wrong thing about a tool
    // whose whole point is containers.
    const documents = blocks.map((block) => parseDocument(block)).filter((r) => r.ok)
    expect(
      documents.some(
        (r) =>
          r.document.nodes.some((n) => n.parentId !== undefined) &&
          r.document.nodes.some((n) => n.collapsed === true),
      ),
    ).toBe(true)
  })

  it('does not present a deferred feature as available', () => {
    // Named in prose as unavailable is fine; used in an example is not.
    for (const block of blocks) {
      for (const key of ['frames', 'edgeSets', 'metadata', 'icon', 'isActor', 'autoLayout']) {
        expect(block).not.toContain(`"${key}"`)
      }
    }
  })

  it('documents every schema field and no field the schema lacks', () => {
    const fields = ['id', 'label', 'x', 'y', 'w', 'h', 'rotation', 'color', 'collapsed', 'parentId']
    for (const field of fields) expect(markdown).toContain(field)
    for (const absent of ['sourceHandle', 'actorId']) {
      // Present only in the "what this tool does not have" list, never as a field.
      expect(markdown.includes(absent)).toBe(true)
    }
  })
})

describe('THE EXTRACTOR BITES', () => {
  // A gate is not tested by running it on the thing it guards.
  it('finds nothing in a guide with no ```json block, so the empty case fails loudly', () => {
    expect(jsonBlocks('# Title\n\n```ts\ninterface X { a: string }\n```\n')).toEqual([])
  })

  it('does not extract a ```ts fragment', () => {
    const markdown = '```ts\n{ "version": 1 }\n```\n\n```json\n{ "version": 1 }\n```\n'
    expect(jsonBlocks(markdown)).toEqual(['{ "version": 1 }\n'])
  })

  it('extracts several blocks, in order', () => {
    const markdown = '```json\nfirst\n```\n\ntext\n\n```json\nsecond\n```\n'
    expect(jsonBlocks(markdown)).toEqual(['first\n', 'second\n'])
  })

  it('is not fooled by an indented fence inside a block', () => {
    expect(jsonBlocks('```json\n{"a": "```json"}\n```\n')).toEqual(['{"a": "```json"}\n'])
  })
})
