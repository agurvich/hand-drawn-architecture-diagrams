import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { b64Vecs } from '@tldraw/tlschema'
import { openRoom, roomId } from '../helpers'

/**
 * THE CORPUS CAPTURE HARNESS. Not a test of the app -- a tool that produces
 * `src/shared/sketch/__fixtures__/strokes/*.json` by drawing real strokes.
 *
 * It exists because a recogniser tuned against hand-written point lists is
 * tuned against the AUTHOR'S IDEA of a rectangle, which is always tidier than a
 * real one. These strokes go through tldraw's actual draw tool -- pointer input,
 * its own smoothing, its own segment encoding -- and come back out through
 * `decodePoints`, so what the classifier sees in the unit tests is byte-for-byte
 * what it sees at runtime.
 *
 * HONEST LIMIT, and each fixture records it in its own `via` field: these are
 * CDP-synthesised pen events, not a pencil on glass. `architecture.md` carries
 * the open iPad-renders-blank defect, so real pencil capture is not available;
 * a spec that waited for it would not be buildable. What CDP gives up is the
 * jitter of a human hand and pressure variation. What it keeps -- and what the
 * classifier actually consumes -- is the tool's own smoothing and resampling,
 * which is the part no hand-written array reproduces.
 *
 * Excluded from the normal run by `testIgnore` in the Playwright config; run it
 * deliberately:
 *   npx playwright test e2e/tools/capture-strokes.spec.ts --config=playwright.capture.ts
 */

const OUT = resolve(process.cwd(), 'src/shared/sketch/__fixtures__/strokes')

interface Stroke {
  name: string
  /** What the recogniser must say. The reason this file is evidence. */
  expect: 'box' | 'line' | 'none'
  why: string
  points: Array<{ x: number; y: number }>
  via: 'cdp-pen'
}

/** Draw a path with pen-typed pointer events and return the decoded points. */
async function draw(page: Page, path: Array<[number, number]>) {
  const cdp = await page.context().newCDPSession(page)
  const pen = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, y: number) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      pointerType: 'pen',
      force: 0.6,
    })

  await page.evaluate(() => {
    window.__editor!.selectAll().deleteShapes(window.__editor!.getSelectedShapeIds())
    window.__editor!.setCurrentTool('draw')
  })

  await pen('mousePressed', path[0]![0], path[0]![1])
  for (const [x, y] of path.slice(1)) await pen('mouseMoved', x, y)
  const last = path[path.length - 1]!
  await pen('mouseReleased', last[0], last[1])

  await expect
    .poll(() => page.evaluate(() => window.__editor!.getCurrentPageShapes().length))
    .toBe(1)

  // A segment has NO `points` field -- it has `path`, delta-encoded base64. The
  // page returns the raw strings and Node decodes them with the store's own
  // `b64Vecs.decodePoints`, which is the exact function the runtime path uses.
  // `getPointsFromDrawSegments` would do it too, but it lives in `tldraw`, which
  // `src/shared/` may not import; `@tldraw/tlschema` is inside the allowlist.
  const paths = await page.evaluate(() => {
    const shape = window.__editor!.getCurrentPageShapes()[0] as unknown as {
      props: { segments: Array<{ path: string }> }
    }
    return shape.props.segments.map((s) => s.path)
  })

  // Shape-LOCAL coordinates, which is what the recogniser consumes: the tool
  // seeds (0,0) at pointer-down and records every later point in shape space.
  // The client adapter is what converts to page space for node hit-testing.
  return paths.flatMap((path) => b64Vecs.decodePoints(path)).map((p) => ({ x: p.x, y: p.y }))
}

/**
 * Each entry is a gesture described in screen coordinates, plus the verdict the
 * recogniser owes it. REFUSALS ARE FIRST: a corpus of only successes cannot see
 * a false positive, and a false positive here eats someone's annotation.
 */
const GESTURES: Array<{
  name: string
  expect: Stroke['expect']
  why: string
  path: Array<[number, number]>
}> = [
  // --- refusals ---
  {
    name: 'refuse-dot',
    expect: 'none',
    why: 'A tap. Below any extent worth calling a shape.',
    path: [
      [400, 300],
      [402, 301],
      [401, 302],
    ],
  },
  {
    name: 'refuse-scribble',
    expect: 'none',
    why: 'Crossing out a word. The commonest annotation there is.',
    path: [
      [300, 300],
      [340, 260],
      [300, 340],
      [380, 270],
      [310, 350],
      [400, 280],
      [330, 360],
      [420, 300],
    ],
  },
  {
    name: 'refuse-spiral',
    expect: 'none',
    why: 'Closed and roughly round, so a naive closure test admits it.',
    path: [
      [400, 300],
      [430, 300],
      [440, 330],
      [420, 355],
      [385, 360],
      [355, 340],
      [350, 305],
      [370, 275],
      [405, 265],
      [440, 275],
      [462, 305],
      [460, 345],
    ],
  },
  {
    name: 'refuse-squiggly-underline',
    expect: 'none',
    why: 'Long and roughly horizontal, so a naive line test admits it.',
    path: [
      [200, 400],
      [230, 385],
      [260, 415],
      [290, 385],
      [320, 415],
      [350, 385],
      [380, 415],
      [410, 390],
    ],
  },
  {
    name: 'refuse-triangle',
    expect: 'none',
    why: 'Closed, three corners. The nearest miss to a box.',
    path: [
      [400, 250],
      [500, 420],
      [300, 420],
      [400, 250],
    ],
  },
  {
    name: 'refuse-bad-box',
    expect: 'none',
    why: 'Meant as a box, drawn far too loosely to be called one.',
    path: [
      [300, 250],
      [420, 235],
      [470, 300],
      [455, 400],
      [340, 430],
      [270, 380],
      [265, 300],
      [310, 262],
    ],
  },
  {
    name: 'refuse-open-box',
    expect: 'none',
    why: 'Three sides of a rectangle. Not closed, so not a box.',
    path: [
      [300, 250],
      [500, 250],
      [500, 400],
      [320, 400],
    ],
  },
  {
    name: 'refuse-l-shape',
    expect: 'none',
    why:
      'Closed, and every corner is square -- so the squareness test admits it. ' +
      'Only the CORNER COUNT refuses it. A bracket round two things is a real annotation.',
    path: [
      [300, 250],
      [500, 250],
      [500, 340],
      [420, 340],
      [420, 430],
      [300, 430],
      [300, 340],
      [302, 255],
    ],
  },
  {
    name: 'refuse-tiny-box',
    expect: 'none',
    why:
      'A real closed rectangle with four square corners -- it passes every shape ' +
      'test. It is refused for being too small to be a node anyone could read or tap.',
    path: [
      [400, 300],
      [428, 299],
      [430, 322],
      [429, 325],
      [402, 326],
      [399, 312],
      [401, 302],
    ],
  },
  {
    name: 'refuse-wavy-line',
    expect: 'none',
    why:
      'Open, long, and never doubles back -- so only the DEVIATION test refuses it. ' +
      'Underlining a whole phrase with a flourish looks exactly like this.',
    path: [
      [200, 300],
      [240, 260],
      [280, 300],
      [320, 340],
      [360, 300],
      [400, 260],
      [440, 300],
      [480, 340],
      [520, 300],
    ],
  },
  {
    name: 'refuse-tiny-flick',
    expect: 'none',
    why:
      'A short straight flick -- perfectly straight, no backtrack, so every line ' +
      'test passes it. Only MIN_STROKE_EXTENT refuses it. A tick or a comma.',
    path: [
      [400, 300],
      [403, 302],
      [406, 304],
      [409, 306],
    ],
  },
  {
    name: 'refuse-bowed-line',
    expect: 'none',
    why:
      'A smooth arc: only 1.09x its own span, so the BACKTRACK test passes it. ' +
      'Only the deviation test refuses it. This is what a curly brace or a sweeping ' +
      'pointer line looks like, and calling it a connection would be wrong.',
    path: [
      [200, 300],
      [232, 281],
      [264, 264],
      [296, 250],
      [328, 241],
      [360, 238],
      [392, 241],
      [424, 250],
      [456, 264],
      [488, 281],
      [520, 300],
    ],
  },
  // --- boxes ---
  {
    name: 'box-clockwise',
    expect: 'box',
    why: 'An ordinary hand-drawn rectangle.',
    path: [
      [300, 250],
      [360, 248],
      [430, 252],
      [498, 250],
      [500, 310],
      [502, 370],
      [499, 400],
      [430, 402],
      [360, 398],
      [302, 401],
      [298, 340],
      [301, 280],
      [303, 253],
    ],
  },
  {
    name: 'box-anticlockwise',
    expect: 'box',
    why: 'The same rectangle drawn the other way; the verdict must not care.',
    path: [
      [300, 250],
      [301, 300],
      [299, 350],
      [300, 400],
      [360, 401],
      [430, 399],
      [498, 400],
      [500, 350],
      [502, 300],
      [499, 252],
      [440, 249],
      [370, 251],
      [304, 248],
    ],
  },
  {
    name: 'box-started-mid-edge',
    expect: 'box',
    why: 'Started halfway along the top; the corners are in a different order.',
    path: [
      [400, 250],
      [470, 249],
      [499, 251],
      [501, 320],
      [498, 400],
      [420, 402],
      [330, 399],
      [299, 401],
      [301, 320],
      [298, 251],
      [340, 250],
      [398, 252],
    ],
  },
  {
    name: 'box-overshot-corner',
    expect: 'box',
    why: 'The pen carried past the start, as a real hand does.',
    path: [
      [300, 250],
      [400, 247],
      [500, 251],
      [503, 330],
      [499, 400],
      [400, 403],
      [300, 399],
      [297, 330],
      [301, 250],
      [330, 249],
      [355, 251],
    ],
  },
  {
    name: 'box-small-but-usable',
    expect: 'box',
    why: 'Near the small end of what should still become a node.',
    path: [
      [400, 300],
      [450, 299],
      [500, 301],
      [501, 330],
      [499, 360],
      [450, 361],
      [400, 359],
      [399, 330],
      [401, 302],
    ],
  },
  // --- lines ---
  {
    name: 'line-straight',
    expect: 'line',
    why: 'The plain case: one node to another.',
    path: [
      [200, 300],
      [260, 302],
      [330, 299],
      [400, 301],
      [470, 300],
      [540, 302],
    ],
  },
  {
    name: 'line-diagonal',
    expect: 'line',
    why: 'Direction must not matter.',
    path: [
      [200, 200],
      [260, 250],
      [330, 300],
      [400, 350],
      [470, 400],
    ],
  },
  {
    name: 'line-gently-curved',
    expect: 'line',
    why: 'Nobody draws a straight line.',
    path: [
      [200, 300],
      [265, 285],
      [330, 275],
      [400, 272],
      [470, 280],
      [540, 297],
    ],
  },
  {
    name: 'line-routed-around-obstacle',
    expect: 'box',
    why:
      'RIGHT, DOWN, RIGHT -- three corners, and its ends can fall close enough that the pure ' +
      'classifier calls it a box. That is CORRECT for a node-blind function. The client adapter ' +
      'overrides it when both ends resolve to two different nodes, which is FR-003 and is why the ' +
      'rule is outcome-shaped rather than order-shaped. This fixture exists to pin the pure ' +
      'verdict so the override has something to override.',
    path: [
      [250, 300],
      [320, 301],
      [390, 299],
      [392, 350],
      [390, 400],
      [388, 450],
      [450, 452],
      [510, 449],
      [512, 400],
      [509, 350],
      [507, 305],
      [440, 303],
      [330, 302],
      [262, 301],
    ],
  },
]

test('capture the stroke corpus', async ({ page }) => {
  test.setTimeout(180_000)
  await openRoom(page, roomId('capture'))
  mkdirSync(OUT, { recursive: true })

  for (const gesture of GESTURES) {
    const points = await draw(page, gesture.path)
    expect(points.length, `${gesture.name} produced no points`).toBeGreaterThan(2)
    const stroke: Stroke = {
      name: gesture.name,
      expect: gesture.expect,
      why: gesture.why,
      via: 'cdp-pen',
      points: points.map((p) => ({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
      })),
    }
    writeFileSync(resolve(OUT, `${gesture.name}.json`), JSON.stringify(stroke, null, 2) + '\n')
  }
})
