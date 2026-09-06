import { useValue, type Editor } from 'tldraw'
import { sketchModeOn, setSketchMode } from '../sketch/sketchMode'
import { SKETCH_ANNOUNCE_ID } from '../sketch/recogniseOnDraw'

interface SketchToggleProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
}

/**
 * Turn sketch recognition on and off.
 *
 * A TOGGLE BUTTON -- a `<button>` carrying `aria-pressed` -- because the state IS
 * the meaning: a control that silently rewrites what you draw has to say which
 * way it is set without being pressed to find out.
 *
 * The visible "On"/"Off" is `aria-hidden`, and deliberately so. It duplicates
 * what `aria-pressed` already announces, and left visible to AT it would put
 * text in the accessible name that is not in the label a voice-control user
 * reads -- WCAG 2.5.3, which is the exact user this control's naming is for.
 *
 * @example
 * <SketchToggle editor={editor} />
 */
export function SketchToggle({ editor }: SketchToggleProps) {
  const on = useValue('sketch mode', () => (editor ? sketchModeOn(editor) : false), [editor])

  if (!editor) return null

  return (
    <div className="sketch-toggle">
      <button
        type="button"
        className={`sketch-toggle__button${on ? ' sketch-toggle__button--on' : ''}`}
        data-testid="sketch-toggle"
        aria-pressed={on}
        // What it DOES, not what it is called: "turn sketches into shapes" is
        // askable; "sketch mode" is a thing you have to already know.
        aria-label={
          on ? 'Stop turning sketches into shapes' : 'Turn sketches into shapes as you draw them'
        }
        onClick={() => setSketchMode(editor, !on)}
      >
        <span aria-hidden="true">✎→▢</span>
        <span className="sketch-toggle__state" aria-hidden="true">
          {on ? 'On' : 'Off'}
        </span>
      </button>
      {/*
       * The canvas changing under you with no visible cause is exactly what a
       * screen-reader user cannot see. Permanently mounted with its text
       * swapped -- a region added at announce time is often missed entirely.
       */}
      <p id={SKETCH_ANNOUNCE_ID} className="sketch-toggle__status" role="status" />
    </div>
  )
}
