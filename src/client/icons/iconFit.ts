/**
 * Does a node have room for its icon *and* its label?
 *
 * A SIZE THRESHOLD CANNOT ANSWER THIS, which is the whole reason this file
 * exists. The first attempt was `w >= 96 && h >= 56` and it moved the bug rather
 * than fixing it: at exactly 96x56 the icon came back and pushed "Message
 * broker" from two lines to three inside a box with room for two, so growing a
 * node by one pixel in each dimension took a legible label to a sliced one. The
 * question is not how big the node is, it is whether the icon costs the label a
 * line it does not have.
 *
 * So this models the wrap. Greedy, word by word, with the icon occupying the
 * front of the first line -- which is what makes the difference: at a width
 * where "Message" alone fits and "[icon] Message" does not, the icon does not
 * merely take 24px, it takes a whole line.
 *
 * APPROXIMATE, deliberately. Measuring is exact and costs a layout pass per node
 * on every render, plus a second pass to act on it -- on an iPad, on a canvas
 * whose whole point is many nodes. An approximation that is a pure function of
 * (w, h, label) is testable without a DOM, identical on every client, and cannot
 * oscillate. It errs toward DROPPING the icon: a missing glyph is a smaller loss
 * than a clipped name.
 */

/** `.diagram-node`: 2px border + 0.5rem padding on each side. */
const CHROME = 20
/** ...but `overflow: hidden` clips at the BORDER box, and the label is centred,
 *  so vertically the label may use the padding. Only the border is a hard edge. */
const VERTICAL_CHROME = 4
/** `font: 500 15px/1.3` -> 19.5px per line. */
const LINE_HEIGHT = 19.5
/** 18px glyph + 6px margin. */
const ICON_WIDTH = 24
/*
 * Advance widths at 15px system-ui, by class of character.
 *
 * A single average is not good enough here, and the failing case says why: "DB"
 * beside an icon in a 60px box turns on whether two capitals are 16px or 21px
 * wide. Capitals and `m`/`w` are far wider than the mean and `i`/`l`/`t` far
 * narrower, so a mean puts the boundary in the wrong place for exactly the short
 * labels that live in small nodes.
 *
 * Rounded UP: over-estimating the label drops the icon a little early, and a
 * missing glyph is a smaller loss than a clipped name.
 */
const SPACE_WIDTH = 4.2
const NARROW = "ijlft.,;:'!|[]()"
const WIDE = 'mw'
const CHAR_WIDTH = 8.6
const CAP_WIDTH = 10.4
const CAP_WIDE_WIDTH = 14

function charWidth(c: string): number {
  if (c === ' ') return SPACE_WIDTH
  if (NARROW.includes(c)) return 5
  if (c >= 'A' && c <= 'Z') return WIDE.includes(c.toLowerCase()) ? CAP_WIDE_WIDTH : CAP_WIDTH
  if (WIDE.includes(c)) return 12
  return CHAR_WIDTH
}

function textWidth(text: string): number {
  let total = 0
  for (const c of text) total += charWidth(c)
  return total
}

/**
 * How many lines this label takes, greedily wrapped, with `indent` reserved at
 * the front of the first line.
 *
 * A single word wider than the line is broken across lines rather than
 * overflowing -- `.diagram-node__label` sets `word-break: break-word`, so that
 * is what the browser does too.
 */
function lineCount(label: string, width: number, indent: number): number {
  if (width <= 0) return Number.POSITIVE_INFINITY
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 0
  let lines = 1
  let used = indent
  for (const word of words) {
    const w = textWidth(word)
    // No space after the icon -- its 6px margin is already in ICON_WIDTH.
    const separator = used > 0 && used !== indent ? SPACE_WIDTH : 0
    if (used + separator + w <= width) {
      used += separator + w
    } else {
      lines += 1
      used = w
    }
    // A word too wide for a line of its own is broken across lines --
    // `.diagram-node__label` sets `word-break: break-word`, so that is what the
    // browser does too.
    if (used > width) {
      const spill = Math.ceil(used / width) - 1
      lines += spill
      used -= spill * width
    }
  }
  return lines
}

/**
 * Whether a node of this size should draw an icon beside this label.
 *
 * THE LABEL WINS. The icon is a second channel for something the text already
 * says, so when only one fits it is the one that goes.
 *
 * @example
 * shouldDrawNodeIcon(160, 90, 'Message broker') // true
 * shouldDrawNodeIcon(96, 56, 'Message broker')  // false -- it would cost a line
 * shouldDrawNodeIcon(60, 40, 'DB')              // false -- no room beside it
 */
export function shouldDrawNodeIcon(w: number, h: number, label: string): boolean {
  const width = w - CHROME
  const available = Math.floor((h - VERTICAL_CHROME) / LINE_HEIGHT)
  if (available < 1) return false
  // Room for the glyph and at least a couple of characters beside it, or the
  // icon is the whole line and the label starts on the next one.
  if (width < ICON_WIDTH + 2 * CHAR_WIDTH) return false
  // An EMPTY label is a node with nothing but its icon, which is fine.
  if (label.trim() === '') return true
  /*
   * THE LABEL MUST STILL FIT WITH THE ICON IN FRONT OF IT. Not "the icon must
   * not cost a line" -- costing a line is fine where there is a spare one, and
   * that stricter rule refuses the icon on a roomy node whose label happens to
   * wrap. A label that already overflows without the icon fails this too, which
   * is right: the icon is not the cause there, but adding it makes the clipping
   * worse for no gain.
   */
  return lineCount(label, width, ICON_WIDTH) <= available
}
