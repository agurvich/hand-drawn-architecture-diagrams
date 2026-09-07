import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import {
  NODE_SHAPE_TYPE,
  resolveNodeIcon,
  ICON_NONE,
  guessIconKey,
  isAwsIconKey,
} from '@shared/shapes'
import { DRAWABLE_ICON_KEYS, awsIconSvg, generalIcon } from '../icons/registry'
import { shouldDrawNodeIcon } from '../icons/iconFit'

interface IconPickerProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
}

/** A readable name for a key, for the option's accessible name. */
function iconName(key: string): string {
  const aws = isAwsIconKey(key)
  const words = (aws ? key.slice(4) : key).replace(/-/g, ' ')
  return aws ? `AWS ${words}` : words
}

function Swatch({ iconKey }: { iconKey: string }) {
  const svg = awsIconSvg(iconKey)
  if (svg !== undefined) {
    return <span className="icon-picker__glyph" dangerouslySetInnerHTML={{ __html: svg }} />
  }
  const Glyph = generalIcon(iconKey)
  return <span className="icon-picker__glyph">{Glyph ? <Glyph size={20} /> : null}</span>
}

/**
 * Choosing a node's icon by hand, and getting back to automatic.
 *
 * ALL THREE STATES ARE REACHABLE from here, or two of them are states the record
 * can hold and nobody can produce: "Automatic" clears to `''`, "No icon" pins
 * `'none'`, and any icon pins itself.
 *
 * Appears only while exactly one node is selected — an icon control with nothing
 * to apply to is a permanent panel for an occasional act.
 *
 * @example
 * <IconPicker editor={editor} />
 */
export function IconPicker({ editor }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  const node = useValue(
    'selected node',
    () => {
      if (!editor) return null
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0]!)
      if (shape?.type !== NODE_SHAPE_TYPE) return null
      const props = shape.props as { icon: string; label: string; w: number; h: number }
      return {
        id: shape.id,
        icon: props.icon,
        label: props.label,
        // The node drops its icon when the label needs the room. Pinning one
        // there is legal and it takes effect the moment the node grows -- but a
        // picker that says nothing looks broken, so it says it.
        drawn: shouldDrawNodeIcon(props.w, props.h, props.label),
      }
    },
    [editor],
  )

  const close = useCallback(() => setOpen(false), [])

  // ESCAPE, like the other two dialogs in this app. A `role="dialog"` that
  // cannot be dismissed from the keyboard is the role without the behaviour.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // A DIFFERENT node selected is a different subject; re-presenting an already
  // open sheet over it is a sheet nobody opened. The component stays mounted
  // across the change, so `open` has to be reset explicitly.
  const nodeId = node?.id ?? null
  useEffect(() => {
    setOpen(false)
    // Not a close the user performed, so it must not pull focus (below).
    wasOpen.current = false
  }, [nodeId])

  // Opening unmounts nothing but puts 97 tab stops between the user and the
  // sheet; picking an icon unmounts the button their focus is ON, which drops
  // focus to <body> and leaves a keyboard user nowhere.
  //
  // Only for a close the USER performed. Tapping the canvas to select another
  // node also closes the sheet, and pulling focus into a floating panel from a
  // pointer gesture is a context change nobody asked for -- announced as one,
  // to anyone listening.
  useEffect(() => {
    if (open) sheet.current?.focus()
    else if (wasOpen.current) launcher.current?.focus()
    wasOpen.current = open
  }, [open])

  if (!editor || !node) return null

  const current = resolveNodeIcon(node.icon, node.label)
  const automatic = node.icon === ''
  const set = (icon: string) => {
    editor.markHistoryStoppingPoint()
    editor.run(() => {
      editor.updateShape({ id: node.id, type: NODE_SHAPE_TYPE, props: { icon } })
    })
    setOpen(false)
  }

  return (
    <div className="icon-picker" data-testid="icon-picker">
      <button
        type="button"
        ref={launcher}
        className="icon-picker__button"
        data-testid="icon-picker-open"
        aria-expanded={open}
        aria-label={
          automatic
            ? `Icon: ${current === null ? 'none' : iconName(current)}, chosen automatically. Choose a different one`
            : `Icon: ${current === null ? 'none' : iconName(current)}, chosen by hand. Change it`
        }
        onClick={() => setOpen((was) => !was)}
      >
        {current === null ? (
          <span className="icon-picker__glyph" aria-hidden="true">
            —
          </span>
        ) : (
          <Swatch iconKey={current} />
        )}
        <span className="icon-picker__state" aria-hidden="true">
          {automatic ? 'Auto' : 'Pinned'}
        </span>
      </button>

      {open && (
        <div
          ref={sheet}
          className="icon-picker__sheet"
          role="dialog"
          aria-label="Choose an icon"
          // Focusable so opening can land here rather than leaving focus on the
          // launcher with the whole grid to tab through; -1 so it is not itself
          // a tab stop on the way past.
          tabIndex={-1}
          data-testid="icon-picker-sheet"
        >
          <div className="icon-picker__row">
            <button
              type="button"
              className="icon-picker__choice"
              data-testid="icon-picker-auto"
              onClick={() => set('')}
            >
              Automatic{node.label.trim() === '' ? '' : ` (${iconName(guessIconKey(node.label))})`}
            </button>
            <button
              type="button"
              className="icon-picker__choice"
              data-testid="icon-picker-none"
              onClick={() => set(ICON_NONE)}
            >
              No icon
            </button>
          </div>
          {!node.drawn && (
            <p className="icon-picker__note" data-testid="icon-picker-too-small">
              This node is too small to show an icon beside its label. A choice here is kept, and
              appears when the node is bigger.
            </p>
          )}
          <div className="icon-picker__grid">
            {DRAWABLE_ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="icon-picker__cell"
                data-testid="icon-picker-cell"
                data-icon={key}
                // The NAME, not the glyph: a grid of unlabelled pictures is
                // unusable by anyone not looking at it, and unaskable by voice.
                aria-label={iconName(key)}
                aria-pressed={!automatic && current === key}
                onClick={() => set(key)}
              >
                <Swatch iconKey={key} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
