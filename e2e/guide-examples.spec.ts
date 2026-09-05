import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openRoom, pasteDocument, pageRecords, roomId } from './helpers'
import { jsonBlocks } from '../src/shared/guideExamples'

/**
 * Every worked example in the authoring guide, actually imported.
 *
 * The vitest half (src/shared/guide-examples.test.ts) proves the blocks parse.
 * This half proves they LOAD -- a document can be schema-valid and still fail to
 * become a diagram, and the guide is handed to a model as ground truth.
 */
const guide = readFileSync(resolve(process.cwd(), 'docs/ai-authoring-guide.md'), 'utf8')
const blocks = jsonBlocks(guide)

test.describe('SPEC-007 FR-005 — the guide examples import', () => {
  test('the guide has examples to test at all', () => {
    expect(blocks.length).toBeGreaterThan(0)
  })

  for (const [i, block] of blocks.entries()) {
    test(`example ${i + 1} imports and produces its nodes`, async ({ page }) => {
      await openRoom(page, roomId(`guide${i}`))
      await pasteDocument(page, block)

      // The panel closes only on a successful import, so its absence IS the
      // assertion that nothing was rejected.
      await expect(page.getByTestId('diagram-io')).toHaveCount(0)
      const expected = (JSON.parse(block) as { nodes?: unknown[] }).nodes?.length ?? 0
      const records = await pageRecords(page)
      expect(records.filter((r) => r.type === 'diagramNode')).toHaveLength(expected)
    })
  }
})
