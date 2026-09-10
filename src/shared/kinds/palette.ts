/**
 * WHAT A KIND LOOKS LIKE: the closed sets a user picks from.
 *
 * Moved here from `index.css`'s `--edge-kind-*` custom properties when SPEC-019
 * made the vocabulary user-authored. A custom property cannot be read by a unit
 * test and cannot be chosen at runtime, and both became requirements. The cost
 * is real and was taken deliberately: a dark canvas would have adapted through
 * the custom property and now will not. The app ships no dark canvas.
 *
 * CONTRAST. Every colour clears 3:1 against the light canvas token, which is
 * WCAG 1.4.11 for a meaningful graphic -- a strand IS the information, not
 * decoration. Measured against #fff, the lightest the token takes.
 *
 * NOT PAIRWISE CONTRAST. An earlier draft of SPEC-019 required 3:1 between any
 * two palette colours. That caps a palette at TWO colours for any hues
 * whatsoever -- a colour clearing 3:1 on white has luminance <= 0.30, and
 * pairwise 3:1 needs each `L + 0.05` to triple, so the third entry runs below
 * zero (3 -> 9 -> 27, and 27 > 21, black on white). It was also the wrong
 * reading: two strands are separated by a `KIND_STRAND_GAP` of BACKGROUND, so
 * each one's adjacent colour is the canvas, which the 3:1 rule already covers.
 *
 * What separates hues at similar lightness is PERCEPTUAL distance, so the
 * palette-level floor is dE 20 in CIE Lab (`palette.test.ts`). These eight sit
 * at 20.6 at their closest.
 *
 * WHERE THESE HUES CAME FROM. Orange and light-green are the two the project
 * owner reached for on the iPad without being asked -- orange for data
 * movement, light-green for permission. `sequence` had no colour of its own; he
 * drew it in black, which is the default pen, so it gets a neutral slate that
 * reads as structure rather than as an accent. Each is DARKER than the pen
 * colour it stands for, because 3:1 is the bar and his own orange was 2.89:1.
 *
 * These were `--edge-kind-*` custom properties in `index.css` until SPEC-019,
 * and this docblock is the only home of the three facts above -- it moved with
 * them rather than being deleted alongside them.
 *
 * COLOUR IS NOT THE ONLY CHANNEL (WCAG 1.4.1), because red-green colour
 * blindness is common and orange/green were the first two kinds the project
 * owner drew. The second channel is the DASH, which is why it lives here beside
 * the colour rather than in a table somewhere else, and why two kinds may share
 * a colour only if their dashes differ -- enforced at the write sites, since a
 * validator sees one record and cannot see the set.
 */

/**
 * The canvas token's lightest value. Contrast is asserted against this.
 *
 * `--tl-color-background` is what the canvas actually paints; #fff is its light
 * value and the worst case for a dark strand.
 */
export const CANVAS_BACKGROUND = '#ffffff'

/**
 * TWO EXCLUSIONS, both load-bearing.
 *
 * `#1a5fb4` is the scene-highlight accent (five sites in `index.css`), and a
 * kind painted in it is indistinguishable from a highlighted line.
 *
 * NO ENTRY MAPS TO THE BLACK PEN. Black is the default pen and records no
 * decision, so a black stroke means "no kind" -- SPEC-018's call, and it stays
 * true no matter what the user creates only because nothing here can claim
 * black. `pen: null` is a palette colour no pen can reach.
 */
export const KIND_PALETTE: Readonly<Record<string, { hex: string; pen: string | null }>> = {
  orange: { hex: '#b35c00', pen: 'orange' },
  green: { hex: '#2f8a2f', pen: 'light-green' },
  slate: { hex: '#5b6270', pen: null },
  violet: { hex: '#7239b3', pen: 'violet' },
  red: { hex: '#c01c28', pen: 'red' },
  teal: { hex: '#0d6b7d', pen: 'light-blue' },
  ochre: { hex: '#8a6d00', pen: 'yellow' },
  forest: { hex: '#1f7a5c', pen: 'green' },
}

/**
 * The second channel. `undefined` is a solid line -- the ABSENCE of the
 * attribute, not `'none'`, which SVG also accepts and which would put a literal
 * string in the DOM for the commonest case.
 */
export const KIND_DASHES: Readonly<Record<string, string | undefined>> = {
  solid: undefined,
  dashed: '7 4',
  dotted: '1.5 4',
  long: '12 5',
  'dash-dot': '9 4 2 4',
}

/**
 * How a label the vocabulary does not list is drawn.
 *
 * NEAR-BLACK, because SPEC-018 already means "no kind" by black. Not
 * `currentColor`: `index.css` sets `color` to the accent on a highlighted
 * connection and the halo is drawn in `currentColor` behind the strands, so a
 * `currentColor` strand would be the accent painted over the accent and would
 * vanish into its own highlight -- the same failure the `#1a5fb4` exclusion
 * above prevents, through the other door.
 *
 * In no palette entry, and clears the dE 20 floor against every one of them.
 */
export const KIND_UNRESOLVED: { hex: string; dash: string } = {
  hex: '#262626',
  dash: '3 3',
}

/**
 * The three kinds SPEC-018 shipped, IN CODE.
 *
 * They are not written to a room. A `diagramKind` record with one of these ids
 * OVERRIDES the seed; nothing creates one to make a seed exist. The alternative
 * -- writing three records into a room whose vocabulary is empty -- is unsound,
 * and SPEC-019's first review is what established it: undo, import and hydration
 * each reach an empty vocabulary, and each re-seeds `data` behind a user who had
 * renamed it to something else, splitting their connections across two words.
 * With no write there is nothing to undo, nothing for import to clear, and no
 * moment to pick.
 *
 * The colours and dashes are the ones SPEC-018 shipped, so no existing diagram
 * changes appearance.
 */
export const SEED_KINDS: readonly { id: string; label: string; colour: string; dash: string }[] = [
  { id: 'data', label: 'data', colour: 'orange', dash: 'solid' },
  { id: 'permission', label: 'permission', colour: 'green', dash: 'dashed' },
  { id: 'sequence', label: 'sequence', colour: 'slate', dash: 'dotted' },
]
