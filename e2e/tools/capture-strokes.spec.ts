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

/**
 * A deterministic jitter source. Seeded, so a re-capture reproduces the corpus
 * exactly -- a random one would make every re-run a silent re-tuning.
 */
function noise(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000 - 0.5
  }
}

/**
 * Turn the waypoints of a gesture into a DENSE, WOBBLY path -- roughly one
 * sample every 4px, each nudged by up to ~1.4px.
 *
 * Without this the harness dispatches one pointer event per authored waypoint,
 * tldraw has nothing to smooth, and the fixture that comes back is the authored
 * polyline with a different origin. That is a real failure mode: it was the
 * first thing a reviewer checked, and the fixtures were byte-identical to the
 * paths in this file. A corpus like that tests the encoder, not the recogniser.
 *
 * The jitter is the honest part of the substitute for a human hand. What CDP
 * still cannot give us is pressure and true timing, which is why every fixture
 * carries `via: 'cdp-pen'`.
 */
function densify(path: Array<[number, number]>, seed: number): Array<[number, number]> {
  const wobble = noise(seed)
  const out: Array<[number, number]> = []
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1]!
    const [x1, y1] = path[i]!
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push([x0 + (x1 - x0) * t + wobble() * 2.8, y0 + (y1 - y0) * t + wobble() * 2.8])
    }
  }
  out.push(path[path.length - 1]!)
  return out
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
  {
    name: 'box-rounded-corners',
    expect: 'box',
    why:
      'A 220x140 rectangle with 22px corner radii -- how most people draw a box ' +
      'quickly by hand. A rounded corner is not one turn, it is three or four ' +
      'small ones spread over an arc, and judged individually none of them is ' +
      'square. This was refused until corners within CORNER_MERGE_FRACTION of ' +
      'each other were summed into one.',
    path: [
      [300, 272],
      [301, 266],
      [303, 261],
      [306, 256],
      [311, 253],
      [316, 251],
      [322, 250],
      [498, 250],
      [504, 251],
      [509, 253],
      [514, 256],
      [517, 261],
      [519, 266],
      [520, 272],
      [520, 368],
      [519, 374],
      [517, 379],
      [514, 384],
      [509, 387],
      [504, 389],
      [498, 390],
      [322, 390],
      [316, 389],
      [311, 387],
      [306, 384],
      [303, 379],
      [301, 374],
      [300, 368],
      [300, 272],
    ],
  },
  {
    name: 'bracket-round-two-things',
    expect: 'none',
    why:
      'A square bracket drawn to group two things. Its arms are short and its ' +
      'spine long, so its LENGTH is barely more than the straight run between ' +
      'its ends -- it passes the purposeful ratio comfortably -- and if its two ' +
      'ends land in two different nodes the client would convert it. A reviewer ' +
      'drew this and watched the bracket become a connection. It sets off AWAY ' +
      'from where it ends up, which is what a routed connection never does.',
    path: [
      [210, 160],
      [170, 160],
      [170, 285],
      [170, 410],
      [210, 410],
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
    expect: 'none',
    why:
      'RIGHT, DOWN, RIGHT. The pure classifier REFUSES it, and that is correct: ' +
      'it is a C-shaped path that does not fill its own bounding box, and the ' +
      'classifier cannot see that both its ends land in nodes. The client adapter ' +
      'is what converts it, on the strength of those two endpoints plus ' +
      'isPurposeful -- which is why FR-003 says the rule is outcome-shaped rather ' +
      'than order-shaped. This fixture pins the pure refusal so the override has ' +
      'something to override.',
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
  {
    name: 'refuse-pentagon',
    expect: 'none',
    why:
      'Closed, five corners of about 72 degrees -- inside CORNER_TOLERANCE and ' +
      'inside MAX_MEAN_CORNER_ERROR, so every corner test passes it. Only the ' +
      'bounding-box FILL refuses it: a rectangle fills its box, a pentagon fills ' +
      'about three quarters. A house, an arrow head or a cloud outline is this shape.',
    path: [
      [400, 240],
      [495, 309],
      [459, 421],
      [341, 421],
      [305, 309],
      [400, 240],
    ],
  },
]

test('capture the stroke corpus', async ({ page }) => {
  test.setTimeout(180_000)
  await openRoom(page, roomId('capture'))
  mkdirSync(OUT, { recursive: true })

  for (const [index, gesture] of GESTURES.entries()) {
    const points = await draw(page, densify(gesture.path, index + 1))
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
