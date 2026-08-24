import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, Lock, X } from 'lucide-react'
import { UNLOCKS } from '../../data/unlocks'
import { rankIconUrl, rankTier } from '../../services/gamification'
import './Gamification.scss'

/**
 * The reward ladder.
 *
 * A rail rather than a list: the perks are a sequence, and where the user
 * stands on it is the thing worth seeing at a glance. Everything earned is in
 * colour above the marker; everything ahead is quiet, with the distance to it
 * spelled out.
 */
export function UnlocksModal({ level, onClose }: { level: number, onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const earned = UNLOCKS.filter((unlock) => level >= unlock.level).length
  const next = UNLOCKS.find((unlock) => unlock.level > level)

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal unlocks-modal" role="dialog" aria-modal="true" aria-labelledby="unlocks-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="unlocks-title">Rewards</h2>
            <p className="muted">
              {next
                ? <>Next up at level {next.level} — {next.level - level} to go</>
                : 'Everything is unlocked.'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="unlock-summary">
          <div className="unlock-count">
            <strong>{earned}</strong>
            <span>of {UNLOCKS.length}<br />unlocked</span>
          </div>
          <div className="unlock-meter">
            <i style={{ width: `${(earned / UNLOCKS.length) * 100}%` }} />
          </div>
          <span className="unlock-here">Level {level}</span>
        </div>

        <ol className="unlock-list">
          {UNLOCKS.map((unlock) => {
            const open = level >= unlock.level
            const isNext = unlock.id === next?.id
            const Icon = unlock.icon
            const away = unlock.level - level

            return (
              <li
                key={unlock.id}
                className={`unlock tier-${rankTier(unlock.level)} ${open ? 'is-open' : ''} ${isNext ? 'is-next' : ''}`}
              >
                <span className="unlock-rail" aria-hidden="true" />

                <span className="unlock-mark">
                  <img src={rankIconUrl(unlock.level)} width="34" height="34" alt="" />
                  <i>{open ? <Check size={11} strokeWidth={3} /> : <Lock size={10} strokeWidth={2.6} />}</i>
                </span>

                <div className="unlock-copy">
                  <p className="unlock-level">
                    Level {unlock.level}
                    {open && <em>Unlocked</em>}
                    {isNext && <em className="soon">{away} level{away === 1 ? '' : 's'} away</em>}
                  </p>

                  <strong className="unlock-title"><Icon size={15} /> {unlock.title}</strong>
                  <p className="unlock-desc">{unlock.description}</p>
                  <p className="unlock-where">{unlock.where}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>,
    document.body,
  )
}
