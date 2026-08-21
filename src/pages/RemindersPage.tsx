import { useState } from 'react'
import { format } from 'date-fns'
import { AlarmClock, BellOff, CircleAlert, Plus, Zap } from 'lucide-react'
import { ScrollRow } from '../components/common/ScrollRow'
import { ReminderCard } from '../components/reminders/ReminderCard'
import { RingtonePicker } from '../components/reminders/RingtonePicker'
import { formatCountdown, matchesFilter, parseDue, sortByDue } from '../components/reminders/reminderTime'
import type { ReminderFilter } from '../components/reminders/reminderTime'
import { useNow } from '../hooks/useNow'
import { useReminders } from '../hooks/useReminders'
import { useAppStore } from '../store/useAppStore'
import './RemindersPage.scss'

const FILTERS: { value: ReminderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'repeating', label: 'Repeating' },
  { value: 'past', label: 'Past' },
]

const EMPTY_COPY: Record<ReminderFilter, string> = {
  all: 'No reminders yet. Set one and QuickPlan will nudge you.',
  today: 'Nothing left to be reminded of today.',
  upcoming: 'Nothing coming up.',
  repeating: 'No repeating reminders yet.',
  past: 'Nothing has passed.',
}

export function RemindersPage() {
  const { reminders, loading, error, busyId, retry, remove } = useReminders()
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)
  const setEditingReminder = useAppStore((state) => state.setEditingReminder)

  const [filter, setFilter] = useState<ReminderFilter>('all')
  const nowMs = useNow()
  const now = new Date(nowMs)

  const visible = sortByDue(reminders.filter((reminder) => matchesFilter(reminder, filter, now)))
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.value, reminders.filter((r) => matchesFilter(r, f.value, now)).length]),
  ) as Record<ReminderFilter, number>

  // the soonest future reminder gets its own banner
  const next = sortByDue(reminders.filter((r) => matchesFilter(r, 'upcoming', now)))[0]
  const nextDue = next ? parseDue(next) : null

  return (
    <section className="reminders-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Stay on time</p>
          <h1>Reminders</h1>
          <p className="muted">Keep important moments visible before they arrive.</p>
        </div>
        <div className="page-head-actions">
          <RingtonePicker />

          <button className="quick-add solid" onClick={() => setQuickAddOpen(true)}>
            <Plus size={18} strokeWidth={2.4} /> New reminder
          </button>
        </div>
      </div>

      {!loading && !error && next && (
        <div className="next-banner">
          <span className="next-pulse"><Zap size={20} /></span>
          <div>
            <p className="next-label">Next up</p>
            <strong>{next.title}</strong>
          </div>
          <div className="next-when">
            <em className="ticker">{formatCountdown(nextDue, nowMs).text}</em>
            {nextDue && <small>{format(nextDue, 'EEE d MMM, h:mm a')}</small>}
          </div>
        </div>
      )}

      <ScrollRow className="reminder-filters" role="tablist" label="Filter reminders">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            role="tab"
            aria-selected={filter === option.value}
            className={filter === option.value ? 'active' : ''}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
            <i>{counts[option.value]}</i>
          </button>
        ))}
      </ScrollRow>

      {loading && (
        <div className="reminder-grid">
          {[0, 1, 2].map((i) => <div className="reminder-skeleton" key={i} />)}
        </div>
      )}

      {!loading && error && (
        <div className="reminder-empty">
          <CircleAlert size={26} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="reminder-empty">
          <span className="empty-bell">{filter === 'past' ? <BellOff size={30} /> : <AlarmClock size={30} />}</span>
          <p>{EMPTY_COPY[filter]}</p>
          {filter === 'all' && (
            <button className="text-button" onClick={() => setQuickAddOpen(true)}>Set a reminder</button>
          )}
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="reminder-grid">
          {visible.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              busy={busyId === reminder.id}
              onEdit={setEditingReminder}
              onDelete={remove}
            />
          ))}
        </div>
      )}
    </section>
  )
}
