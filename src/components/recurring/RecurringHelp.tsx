import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Pause, Pencil, Repeat, SkipForward, Trash2, X, Zap } from 'lucide-react'
import './RecurringHelp.scss'

/**
 * What each control does.
 *
 * The buttons carry labels, which answers "what is this". This answers the
 * harder question — what happens to the schedule if I press it — which a word
 * like "skip" cannot say on its own.
 */

const ACTIONS = [
  {
    icon: Pause,
    name: 'Pause',
    what: 'Stops it running without losing it. Nothing is recorded while it is paused, and pressing play starts it again from the next date.',
  },
  {
    icon: SkipForward,
    name: 'Skip',
    what: 'Misses the next turn only, then carries on as normal. Useful when you have already paid this one by hand.',
  },
  {
    icon: Zap,
    name: 'Now',
    what: 'Records this period’s expense straight away instead of waiting for the date it was due.',
  },
  {
    icon: Pencil,
    name: 'Edit',
    what: 'Changes the name, the amount, the category or when it stops. How often it repeats is fixed once it is running.',
  },
  {
    icon: Trash2,
    name: 'Stop',
    what: 'Ends the schedule for good. The expenses it already created stay where they are.',
  },
]

export function RecurringHelp({ open, onClose }: { open: boolean, onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="recurring-help-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="recurring-help-title">What these controls do</h2>
            <p className="muted">A recurring expense records itself on a date you choose, so you never type rent in again.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="help-list">
          {ACTIONS.map(({ icon: Icon, name, what }) => (
            <div className="help-row" key={name}>
              <span className="help-icon"><Icon size={17} /></span>
              <div>
                <strong>{name}</strong>
                <p>{what}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="help-foot">
          <Repeat size={14} />
          {/* one flex child, or the chip becomes its own column and splits the sentence */}
          <span>
            Anything a schedule creates appears in your expenses with an <em>auto</em> tag, so you
            can always tell what you typed from what the app did for you.
          </span>
        </p>

        <footer className="modal-actions">
          <button type="button" className="modal-submit" onClick={onClose}>Got it</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
