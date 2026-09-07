import { resolveNodeIcon } from '@shared/shapes'
import { awsIconSvg, generalIcon } from './registry'

interface NodeIconProps {
  /** The node's raw `icon` prop: a key, `'none'`, or `''` for automatic. */
  icon: string
  /** The node's label — what an automatic icon is guessed from. */
  label: string
}

/**
 * A node's icon, resolved and drawn.
 *
 * `aria-hidden` throughout: the node's accessible name is its LABEL, and an
 * icon announcing "database" beside a node called "Postgres" is noise. It is a
 * visual channel for something the text already says.
 *
 * Never intercepts pointer events — a tap on the icon has to reach the node.
 */
export function NodeIcon({ icon, label }: NodeIconProps) {
  const key = resolveNodeIcon(icon, label)
  if (key === null) return null

  const svg = awsIconSvg(key)
  if (svg !== undefined) {
    return (
      <span
        className="diagram-node__icon"
        data-testid="diagram-node-icon"
        data-icon={key}
        aria-hidden="true"
        // The AWS set is vendored SVG rather than components. The markup is a
        // build-time asset from this repository, not anything a user supplied.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  const Glyph = generalIcon(key)
  if (!Glyph) return null
  return (
    <span
      className="diagram-node__icon"
      data-testid="diagram-node-icon"
      data-icon={key}
      aria-hidden="true"
    >
      <Glyph size={18} />
    </span>
  )
}
