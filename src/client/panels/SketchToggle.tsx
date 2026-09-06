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
 * A switch rather than a button, because the state IS the meaning: a control
 * that silently rewrites what you draw has to say which way it is set without
 * being pressed to find out. `aria-pressed` carries that to assistive tech, and
 * the label changes with it so a voice-control user can ask for the thing they
 * want rather than the thing it is called.
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
        <span className="sketch-toggle__state">{on ? 'On' : 'Off'}</span>
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
