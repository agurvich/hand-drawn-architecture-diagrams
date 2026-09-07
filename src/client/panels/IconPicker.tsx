import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { NODE_SHAPE_TYPE, resolveNodeIcon, ICON_NONE, guessIconKey } from '@shared/shapes'
import { DRAWABLE_ICON_KEYS, awsIconSvg, generalIcon } from '../icons/registry'

interface IconPickerProps {
  /** The mounted editor, or null before `onMount` has run. */
  editor: Editor | null
}

/** A readable name for a key, for the option's accessible name. */
function iconName(key: string): string {
  const bare = key.startsWith('aws:') ? key.slice(4) : key
  const words = bare.replace(/-/g, ' ')
  return key.startsWith('aws:') ? `AWS ${words}` : words
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

  const node = useValue(
    'selected node',
    () => {
      if (!editor) return null
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0]!)
      if (shape?.type !== NODE_SHAPE_TYPE) return null
      const props = shape.props as { icon: string; label: string }
      return { id: shape.id, icon: props.icon, label: props.label }
    },
    [editor],
  )

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
        <div className="icon-picker__sheet" role="dialog" aria-label="Choose an icon">
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
