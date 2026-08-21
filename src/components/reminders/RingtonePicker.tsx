import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Music, Play } from 'lucide-react'
import { getRingtone, playRingtone, primeAudio, RINGTONES, stopAlert } from '../../services/chime'
import { useAppStore } from '../../store/useAppStore'
import './RingtonePicker.scss'

/**
 * Choose the alert sound, previewing each one before committing.
 *
 * Selecting plays the tone immediately — a name alone tells you nothing about
 * what it sounds like.
 */
export function RingtonePicker() {
  const ringtone = useAppStore((state) => state.ringtone)
  const setRingtone = useAppStore((state) => state.setRingtone)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = getRingtone(ringtone)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function preview(id: string) {
    primeAudio()
    stopAlert()   // cut any previous preview short
    playRingtone(id)
  }

  return (
    <div className="ringtone-picker" ref={rootRef}>
      <button
        type="button"
        className="ringtone-trigger"
        onClick={() => { primeAudio(); setOpen((value) => !value) }}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Choose the reminder sound"
      >
        <Music size={16} />
        <span>{current.label}</span>
        <ChevronDown size={15} className={open ? 'flip' : ''} />
      </button>

      {open && (
        <div className="ringtone-menu" role="listbox" aria-label="Reminder ringtone">
          <p className="ringtone-menu-title">Reminder sound</p>

          {RINGTONES.map((tone) => (
            <button
              key={tone.id}
              type="button"
              role="option"
              aria-selected={tone.id === ringtone}
              className={`ringtone-option ${tone.id === ringtone ? 'active' : ''}`}
              onClick={() => { setRingtone(tone.id); preview(tone.id) }}
            >
              <span className="ringtone-mark">
                {tone.id === ringtone ? <Check size={14} strokeWidth={3} /> : <Play size={12} />}
              </span>
              <span className="ringtone-copy">
                <strong>{tone.label}</strong>
                <small>{tone.hint}</small>
              </span>
            </button>
          ))}

          <button type="button" className="ringtone-replay" onClick={() => preview(ringtone)}>
            <Play size={13} /> Play {current.label} again
          </button>
        </div>
      )}
    </div>
  )
}
