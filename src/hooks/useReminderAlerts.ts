import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { primeAudio, startAlert } from '../services/chime'
import { useAppStore } from '../store/useAppStore'
import type { Reminder } from '../services/reminders'
import { alertMomentsOf } from '../components/reminders/reminderTime'
import { useNow } from './useNow'

/** Alerts still sound if a tab was briefly backgrounded and ticks were missed. */
const GRACE_MS = 90_000

/**
 * Sounds an alert as each reminder moment arrives.
 *
 * A reminder has up to two moments: the lead-in (dueAt minus offsetMinutes) and
 * the due time itself. They are tracked separately so a missed lead-in never
 * suppresses the alert at the time printed on the card.
 */
export function useReminderAlerts(reminders: Reminder[]) {
  const now = useNow()
  const ringtone = useAppStore((state) => state.ringtone)
  const firedRef = useRef(new Set<string>())
  const openedAtRef = useRef<number | null>(null)

  // audio is blocked until the page has seen a gesture
  useEffect(() => {
    if (openedAtRef.current === null) openedAtRef.current = Date.now()
    const prime = () => primeAudio()
    document.addEventListener('pointerdown', prime, { once: true })
    document.addEventListener('keydown', prime, { once: true })
    return () => {
      document.removeEventListener('pointerdown', prime)
      document.removeEventListener('keydown', prime)
    }
  }, [])

  useEffect(() => {
    const openedAt = openedAtRef.current ?? now

    for (const reminder of reminders) {
      for (const moment of alertMomentsOf(reminder)) {
        const at = moment.at.getTime()

        if (firedRef.current.has(moment.key)) continue
        if (at > now) continue
        // Skip a backlog from before the app opened, but allow a short grace
        // window so a moment that passed seconds ago still sounds.
        if (at <= openedAt - GRACE_MS) continue

        firedRef.current.add(moment.key)
        // rings until the user clicks or types anywhere
        startAlert(ringtone)
        toast(reminder.title, {
          icon: moment.kind === 'lead' ? '\u{1F514}' : '\u{23F0}',
          duration: 12_000,
        })
      }
    }
  }, [reminders, now, ringtone])
}
