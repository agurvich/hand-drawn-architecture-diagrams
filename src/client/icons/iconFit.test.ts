import { describe, it, expect } from 'vitest'
import { shouldDrawNodeIcon } from './iconFit'

/**
 * THE CASE THAT FORCED THIS FILE, first.
 *
 * The first attempt at "a small node drops its icon" was a size threshold,
 * `w >= 96 && h >= 56`. It fixed 60x40 and broke 96x56: at exactly the
 * threshold the icon came back and pushed a two-line label to three inside a
 * box with room for two, so a node one pixel bigger in each dimension showed a
 * sliced label. A threshold cannot ask the question; this asks it.
 */
describe('shouldDrawNodeIcon', () => {
  it('does not cost the label a line AT THE OLD THRESHOLD', () => {
    // Two lines fit in 56. Without the icon "Message broker" takes two; with it,
    // "Message" no longer fits beside the glyph, so it takes three.
    expect(shouldDrawNodeIcon(95, 55, 'Message broker')).toBe(false)
    expect(shouldDrawNodeIcon(96, 56, 'Message broker')).toBe(false)
    // ...and a longer one is worse, not better, as the node grows to that size.
    expect(shouldDrawNodeIcon(96, 56, 'Payment gateway service')).toBe(false)
  })

  it('draws the icon once there is room for both', () => {
    expect(shouldDrawNodeIcon(160, 90, 'Message broker')).toBe(true)
    expect(shouldDrawNodeIcon(220, 120, 'Payment gateway service')).toBe(true)
    expect(shouldDrawNodeIcon(200, 60, 'Postgres')).toBe(true)
  })

  it('drops the icon on a node too small for both', () => {
    // 40 is the sketch recogniser's own MIN_BOX_EXTENT, so this is reachable by
    // drawing a box rather than a contrived size.
    expect(shouldDrawNodeIcon(60, 40, 'DB')).toBe(false)
    expect(shouldDrawNodeIcon(40, 40, 'DB')).toBe(false)
    expect(shouldDrawNodeIcon(60, 40, 'Postgres')).toBe(false)
  })

  it('draws it on a SHORT label in a short wide node', () => {
    // The icon costs 24px of one line. Where the label is short and the line is
    // long, that is free -- and a rule keyed on height alone would refuse it.
    expect(shouldDrawNodeIcon(220, 40, 'DB')).toBe(true)
  })

  it('a label that ALREADY overflows does not get an icon too', () => {
    // The icon is not the cause here, but adding it to a label that is already
    // being clipped makes the clipping worse for no gain.
    expect(shouldDrawNodeIcon(60, 40, 'A very long name indeed for such a box')).toBe(false)
  })

  it('an empty label is all icon', () => {
    expect(shouldDrawNodeIcon(160, 90, '')).toBe(true)
    expect(shouldDrawNodeIcon(160, 90, '   ')).toBe(true)
    // ...unless there is no room for the glyph itself.
    expect(shouldDrawNodeIcon(30, 40, '')).toBe(false)
    expect(shouldDrawNodeIcon(160, 20, '')).toBe(false)
  })

  it('is a pure function of its three arguments', () => {
    // Same answer every time, on every client: it is read during render on both
    // sides of a sync room and two clients must draw the same node.
    for (let i = 0; i < 3; i++) {
      expect(shouldDrawNodeIcon(96, 56, 'Message broker')).toBe(false)
      expect(shouldDrawNodeIcon(160, 90, 'Message broker')).toBe(true)
    }
  })
})
