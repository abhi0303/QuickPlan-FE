import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { addDays, format, parseISO } from 'date-fns'
import { AlarmClock, CalendarDays, CircleAlert, Clock3, LoaderCircle, Repeat, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { updateReminder } from '../../services/reminders'
import type { Reminder, UpdateReminderPayload } from '../../services/reminders'
import { useAppStore } from '../../store/useAppStore'
import { AddToCalendar } from './AddToCalendar'
import './EditReminderModal.scss'

const OFFSETS = [
  { label: 'At time', value: 0 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
]

const REPEATS = [
  { label: 'Never', value: '' },
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekdays', value: 'WEEKDAYS' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
]

const DAY_PRESETS = [{ label: 'Today', days: 0 }, { label: 'Tomorrow', days: 1 }, { label: 'Next week', days: 7 }]

export function EditReminderModal() {
  const reminder = useAppStore((state) => state.editingReminder)
  return reminder ? <EditReminderDialog reminder={reminder} /> : null
}

function EditReminderDialog({ reminder }: { reminder: Reminder }) {
  const close = useAppStore((state) => state.setEditingReminder)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)

  const parsed = reminder.dueAt ? parseISO(reminder.dueAt) : null
  const valid = parsed && !Number.isNaN(parsed.getTime())

  const [title, setTitle] = useState(reminder.title)
  const [day, setDay] = useState(valid ? format(parsed as Date, 'yyyy-MM-dd') : '')
  const [time, setTime] = useState(valid ? format(parsed as Date, 'HH:mm') : '')
  const [offset, setOffset] = useState(reminder.offsetMinutes ?? 0)
  const [repeat, setRepeat] = useState(reminder.recurrenceRule ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.select()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [close])

  const activePreset = DAY_PRESETS.find((p) => day === format(addDays(new Date(), p.days), 'yyyy-MM-dd'))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setError('A reminder needs a title.')
      titleRef.current?.focus()
      return
    }
    if (!day || !time) {
      setError('A reminder needs a date and time to fire.')
      return
    }

    const dueAt = new Date(`${day}T${time}`)
    if (Number.isNaN(dueAt.getTime())) {
      setError('That date and time is not valid.')
      return
    }

    // UpdateReminderDto is a partial, so only send what actually changed.
    const iso = dueAt.toISOString()
    const patch: UpdateReminderPayload = {}
    if (trimmed !== reminder.title) patch.title = trimmed
    if (iso !== reminder.dueAt) patch.dueAt = iso
    if (offset !== (reminder.offsetMinutes ?? 0)) patch.offsetMinutes = offset
    if ((repeat || undefined) !== reminder.recurrenceRule) patch.recurrenceRule = repeat || undefined

    if (Object.keys(patch).length === 0) {
      close(null)
      return
    }

    setSaving(true)
    try {
      await updateReminder(reminder.id, patch)
      bumpTasksVersion()
      close(null)
      toast.success('Reminder updated')
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not save those changes.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => close(null)}>
      <div className="modal reminder-modal" role="dialog" aria-modal="true" aria-labelledby="edit-reminder-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="edit-reminder-title">Edit reminder</h2>
            <p className="muted">Change when and how often it nudges you.</p>
          </div>
          <button className="modal-close" onClick={() => close(null)} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="reminder-title">Remind me to</label>
            <input id="reminder-title" className="control" ref={titleRef} value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }} disabled={saving} autoComplete="off" />
          </div>

          <div className="field">
            <span className="field-label">When</span>
            <div className="chip-row">
              {DAY_PRESETS.map((preset) => (
                <button key={preset.label} type="button"
                  className={`chip ${activePreset?.label === preset.label ? 'active' : ''}`}
                  onClick={() => { setDay(format(addDays(new Date(), preset.days), 'yyyy-MM-dd')); setTime(time || '09:00') }}
                  disabled={saving}>{preset.label}</button>
              ))}
            </div>
            <div className="field-pair">
              <span className="control adorned">
                <CalendarDays size={17} />
                <input type="date" aria-label="Date" value={day} onChange={(e) => setDay(e.target.value)} disabled={saving} />
              </span>
              <span className="control adorned">
                <Clock3 size={17} />
                <input type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} disabled={saving} />
              </span>
            </div>
          </div>

          <div className="field">
            <span className="field-label"><AlarmClock size={14} /> Notify me</span>
            <div className="segmented">
              {OFFSETS.map((option) => (
                <button key={option.value} type="button" className={offset === option.value ? 'active' : ''}
                  onClick={() => setOffset(option.value)} disabled={saving}>{option.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label"><Repeat size={14} /> Repeat</span>
            <div className="chip-row">
              {REPEATS.map((option) => (
                <button key={option.label} type="button" className={`chip ${repeat === option.value ? 'active' : ''}`}
                  onClick={() => setRepeat(option.value)} disabled={saving}>{option.label}</button>
              ))}
            </div>
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            {/* the calendar copy is of what is saved, so it sits beside Cancel
                rather than pretending to be part of this form */}
            <AddToCalendar reminder={reminder} />
            <span className="modal-actions-gap" />
            <button type="button" className="voice-ghost" onClick={() => close(null)} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving ? <><LoaderCircle size={18} className="spin" /> Saving...</> : 'Save changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
