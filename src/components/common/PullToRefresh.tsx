import { RotateCw } from 'lucide-react'
import { PULL_THRESHOLD } from '../../hooks/usePullToRefresh'
import type { PullState } from '../../hooks/usePullToRefresh'
import './PullToRefresh.scss'

/**
 * What the pull looks like while it happens.
 *
 * It follows the finger and turns with it, so the gesture reports its own
 * progress: the arrow has come round a full turn at exactly the point letting
 * go would refresh. Nothing here is decoration — the rotation *is* the
 * threshold, which is why no "pull further" copy is needed.
 */
export function PullToRefresh({ distance, state }: { distance: number, state: PullState }) {
  if (state === 'idle' && distance === 0) return null

  const progress = Math.min(1, distance / PULL_THRESHOLD)

  return (
    <div
      className={`pull-refresh is-${state}`}
      style={{ transform: `translate(-50%, ${distance}px)`, opacity: Math.min(1, progress * 1.6) }}
      aria-hidden="true"
    >
      <span
        className="pull-mark"
        style={{ transform: state === 'refreshing' ? undefined : `rotate(${progress * 360}deg)` }}
      >
        <RotateCw size={17} />
      </span>
    </div>
  )
}
