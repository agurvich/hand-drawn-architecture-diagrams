/**
 * WHAT THE 276 STROKES ACTUALLY ARE. Test-only, like everything in this folder.
 *
 * Labelled by eye from a rendered contact sheet of the whole corpus, and that
 * provenance matters: every score SPEC-017 states is computed against these
 * indices, so a mislabelled stroke tunes the recogniser against the wrong
 * target and no test in the repo would notice. Re-render and re-check rather
 * than trusting the list.
 *
 * The denominator is the point. "276 strokes, 1 box" scores the classifier
 * against a population that is mostly handwriting; only twelve of these strokes
 * are rectangles at all, and the other 264 are correctly not boxes.
 */

/** The rectangles. Each must become a node. */
export const RECTANGLES = [0, 18, 54, 55, 67, 78, 84, 98, 162, 174, 207, 228] as const

/**
 * Strokes that must become connections once the rectangles are nodes.
 *
 * Orange and light-green in a corpus that is otherwise black: the colour
 * convention in `docs/corpus/README.md` is his own, applied unprompted, and it
 * marks transfers and permissions. These are the only three strokes whose two
 * ends land in two different rectangles.
 */
export const ARROWS = [80, 188, 259] as const

/** Straight marks promoted as `line` fixtures. */
export const LINES = [36, 69, 247] as const

/** Handwriting promoted as refusals. These must stay exactly as drawn. */
export const MARKS = [3, 12, 43, 107, 149, 220] as const

/**
 * The `why` for each promoted fixture, authored rather than generated.
 *
 * `recognise.test.ts` puts this in the test name, so it is what a failing run
 * tells you about the stroke. A generated placeholder would make every pencil
 * fixture's failure read the same.
 */
export const NOTES: Record<number, string> = {
  0: 'A wide, flat container drawn in one stroke, closing back over its own start.',
  18: 'The tallest container in the drawing, and one of the two largest strokes in the corpus.',
  54: 'A small square container; the only rectangle the squareness test already accepted.',
  55: 'A container whose corners are rounded enough that it fills least of its own bounding box.',
  67: 'The one box the whole iPad session produced, and the box he undid.',
  78: 'An ordinary container, drawn at a comfortable zoom.',
  84: 'A long, low container spanning most of an account boundary.',
  98: 'A tall container drawn at a zoomed-out camera, with a visible overshoot at the close.',
  162: 'The largest stroke in the corpus: an account boundary closing within 2.4% of its diagonal.',
  174: 'A small container, drawn quickly, with the fewest points of the twelve.',
  207: 'A wide container drawn around several children already on the page.',
  228: 'A container whose closing corner runs well past its own start.',
  36: 'A long horizontal rule, drawn left to right in one confident sweep.',
  69: 'A horizontal rule under a label, straight enough to be a connection.',
  247: 'A long horizontal, the straightest mark in the drawing.',
  3: 'Handwriting: a letter with two strokes of its own, which must stay a mark.',
  12: 'Handwriting: an open curve that closes nowhere near itself.',
  43: 'Handwriting: a digit with two bowls, closed enough to tempt the corner test.',
  107: 'Handwriting: a letter of three arches, which simplifies to many corners.',
  149: 'Handwriting: two joined letters, drawn without lifting the pencil.',
  220: 'Handwriting: a letter of four strokes in one, and the widest mark in the corpus.',
}
