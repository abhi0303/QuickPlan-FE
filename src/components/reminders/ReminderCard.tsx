import { format } from 'date-fns'
import { BellRing, Infinity as InfinityIcon, Moon, Pencil, Repeat, Sun, Sunrise, Sunset, Trash2 } from 'lucide-react'
import type { Reminder } from '../../services/reminders'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, parseDue, SLOT_LABEL, slotOf } from './reminderTime'
import './ReminderCard.scss'

const SLOT_ICON = { dawn: Sunrise, day: Sun, dusk: Sunset, night: Moon }

const REPEAT_LABEL: Record<string, string> = {
  DAILY: 'Every day',
  WEEKDAYS: 'Weekdays',
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
}

type Props = {
  reminder: Reminder
  busy?: boolean
  onEdit: (reminder: Reminder) => void
  onDelete: (reminder: Reminder) => void
}

export function ReminderCard({ reminder, busy, onEdit, onDelete }: Props) {
  const nowMs = useNow()
  const now = new Date(nowMs)
  const due = parseDue(reminder)
  const ticker = formatCountdown(due, nowMs)
  const slot = slotOf(due)
  const SlotIcon = SLOT_ICON[slot]
  const isPast = Boolean(due && due.getTime() < now.getTime()) && !reminder.recurrenceRule

  return (
    <article className={`reminder-card slot-${slot} ${isPast ? 'is-past' : ''} ${busy ? 'is-busy' : ''}`}>
      {/* the sky band is the card's illustration — themed by the hour it fires */}
      <div className="reminder-sky">
        <SlotIcon size={26} strokeWidth={1.8} />
        <span className="reminder-slot">{SLOT_LABEL[slot]}</span>
        <i className="orb-a" />
        <i className="orb-b" />

        <div className="reminder-actions">
          <button onClick={() => onEdit(reminder)} disabled={busy} aria-label={`Edit "${reminder.title}"`}>
            <Pencil size={15} />
          </button>
          <button className="danger" onClick={() => onDelete(reminder)} disabled={busy} aria-label={`Delete "${reminder.title}"`}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="reminder-body">
        <time className="reminder-clock">
          {due ? format(due, 'h:mm') : '--:--'}
          <span>{due ? format(due, 'a') : ''}</span>
        </time>

        <p className={`reminder-countdown ${ticker.past ? 'is-past' : ''} ${ticker.imminent ? 'is-imminent' : ''}`}>
          <span className="ticker">{ticker.text}</span>
          {due && <em>{ticker.past ? 'ago' : 'to go'}</em>}
        </p>
        <h3>{reminder.title}</h3>

        <div className="reminder-tags">
          {due && <span className="reminder-tag"><BellRing size={12} /> {format(due, 'EEE d MMM')}</span>}
          {reminder.recurrenceRule && (
            <span className="reminder-tag repeat">
              <Repeat size={12} /> {REPEAT_LABEL[reminder.recurrenceRule] ?? reminder.recurrenceRule}
            </span>
          )}
          {typeof reminder.offsetMinutes === 'number' && reminder.offsetMinutes > 0 && (
            <span className="reminder-tag"><InfinityIcon size={12} /> {reminder.offsetMinutes}m before</span>
          )}
        </div>
      </div>
    </article>
  )
}
