import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { unlocksAt } from '../../data/unlocks'
import { rankIconUrl, rankTier } from '../../services/gamification'
import './Gamification.scss'

/**
 * The level-up celebration.
 *
 * The backend decides that a level was crossed; this only shows it, once, when
 * the user is next looking. Dismissing marks the level as seen so a reload does
 * not celebrate it again.
 */
export function LevelUpOverlay({
  from, to, rankName, onClose,
}: {
  from: number
  to: number
  rankName: string
  onClose: () => void
}) {
  /*
   * `onClose` is a new function on every render of the shell, and the shell
   * re-renders often. Holding it in a ref keeps the dismiss timer running from
   * when the celebration appeared instead of restarting under it.
   */
  const close = useRef(onClose)

  // assigned in an effect, never during render
  useEffect(() => {
    close.current = onClose
  }, [onClose])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKeyDown)
    // it is a celebration, not a decision — it clears itself
    const timer = window.setTimeout(() => close.current(), 9000)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(timer)
    }
  }, [])

  return createPortal(
    <div className="levelup-backdrop" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={`Level ${to}`}>
      <div className={`levelup tier-${rankTier(to)}`} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>

        <span className="levelup-rays" aria-hidden="true" />
        <img className="levelup-badge" src={rankIconUrl(to)} width="120" height="120" alt="" />

        <p className="levelup-kicker">Level up</p>
        <strong className="levelup-level">Level {to}</strong>
        <p className="levelup-rank">{rankName}</p>

        {/* a level that opens something should say so, not just count up */}
        {unlocksAt(to).map((unlock) => (
          <p className="levelup-unlock" key={unlock.id}>
            <unlock.icon size={15} /> <strong>{unlock.title}</strong> unlocked · {unlock.where}
          </p>
        ))}

        <p className="levelup-from">from level {from} · +100 XP</p>
      </div>
    </div>,
    document.body,
  )
}
