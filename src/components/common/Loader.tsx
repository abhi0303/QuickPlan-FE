import { Sparkles } from 'lucide-react'
import './Loader.scss'

type Props = {
  /** Fills the viewport — for the first paint and route changes. */
  full?: boolean
  label?: string
  /** Smaller ring, for a panel waiting on its own request. */
  compact?: boolean
}

/**
 * The app's waiting state: the brand mark inside an orbiting ring, in the
 * theme's own gradient. Used wherever there is nothing yet to lay out — where
 * the shape of the answer is known, a skeleton is the better wait.
 */
export function Loader({ full, label, compact }: Props) {
  return (
    <div className={`loader ${full ? 'is-full' : ''} ${compact ? 'is-compact' : ''}`} role="status" aria-live="polite">
      <span className="loader-orb">
        <i className="loader-ring" />
        <i className="loader-ring alt" />
        <span className="loader-mark">
          <Sparkles size={compact ? 15 : 21} strokeWidth={2.4} />
        </span>
      </span>
      {label && <p className="loader-label">{label}</p>}
      <span className="sr-only">Loading</span>
    </div>
  )
}
