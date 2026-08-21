import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { addDays, format, parseISO } from 'date-fns'
import { CalendarDays, CircleAlert, Clock3, Flag, LoaderCircle, Mic, MicOff, Plus, Sparkles, Tag, WandSparkles, X } from 'lucide-react'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { getApiErrorMessage } from '../../services/api'
import { isQuickAddCancel, parseQuickAdd } from '../../services/smartInput'
import { createTask, TASK_PRIORITIES } from '../../services/tasks'
import type { TaskPriority } from '../../services/tasks'
import { useAppStore } from '../../store/useAppStore'

const CATEGORIES = ['Work', 'Personal', 'Finance', 'Health']

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

const DEFAULT_TIME = '09:00'

const EMPTY = {
  title: '',
  notes: '',
  category: '',
  dueDay: '',
  dueTime: '',
  priority: 'MEDIUM' as TaskPriority,
}

type FormState = typeof EMPTY

/** Overlays whatever the parser recognised onto a form, leaving the rest alone. */
function applyParsed(current: FormState, text: string): FormState {
  const parsed = parseQuickAdd(text)
  if (!parsed) return current

  let dueDay = current.dueDay
  let dueTime = current.dueTime
  if (parsed.dueDate) {
    const due = parseISO(parsed.dueDate)
    if (!Number.isNaN(due.getTime())) {
      dueDay = format(due, 'yyyy-MM-dd')
      dueTime = format(due, 'HH:mm')
    }
  }

  return {
    ...current,
    title: parsed.title,
    priority: parsed.priority,
    category: parsed.category ?? current.category,
    dueDay,
    dueTime,
  }
}

/** Combines the split day/time fields back into the ISO string the API wants. */
function toIsoDue(form: FormState): string | undefined {
  if (!form.dueDay && !form.dueTime) return undefined
  const day = form.dueDay || format(new Date(), 'yyyy-MM-dd')
  const time = form.dueTime || DEFAULT_TIME
  const combined = new Date(`${day}T${time}`)
  return Number.isNaN(combined.getTime()) ? undefined : combined.toISOString()
}

const DAY_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
]

export function QuickAddModal() {
  const open = useAppStore((state) => state.quickAddOpen)
  return open ? <QuickAddDialog /> : null
}

function QuickAddDialog() {
  const setOpen = useAppStore((state) => state.setQuickAddOpen)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)
  const seed = useAppStore((state) => state.quickAddSeed)

  const [form, setForm] = useState<FormState>(() => (seed ? applyParsed(EMPTY, seed) : EMPTY))
  const [smartText, setSmartText] = useState(seed)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const speech = useSpeechRecognition({
    onResult: (transcript) => {
      if (isQuickAddCancel(transcript)) {
        setOpen(false)
        toast('Okay, cancelled', { icon: '\u{1F44C}' })
        return
      }
      setSmartText(transcript)
      applySmart(transcript)
    },
  })

  const preview = smartText.trim() ? parseQuickAdd(smartText) : null

  function applySmart(text: string) {
    setForm((current) => applyParsed(current, text))
    setError('')
  }

  useEffect(() => {
    titleRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [setOpen])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function setPresetDay(days: number) {
    setForm((current) => ({
      ...current,
      dueDay: format(addDays(new Date(), days), 'yyyy-MM-dd'),
      dueTime: current.dueTime || DEFAULT_TIME,
    }))
  }

  function clearDue() {
    setForm((current) => ({ ...current, dueDay: '', dueTime: '' }))
  }

  const activePreset = DAY_PRESETS.find(
    (preset) => form.dueDay === format(addDays(new Date(), preset.days), 'yyyy-MM-dd'),
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setError('Give your task a title.')
      titleRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      await createTask({
        title,
        notes: form.notes.trim() || undefined,
        category: form.category || undefined,
        priority: form.priority,
        dueDate: toIsoDue(form),
        status: 'PENDING',
        isCompleted: false,
      })
      bumpTasksVersion()
      setOpen(false)
      toast.success('Task added')
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not add that task. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 id="quick-add-title">Quick add</h2>
            <p className="muted">Capture it now, organize it later.</p>
          </div>
          <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="smart-row">
          <label className="smart-field" htmlFor="smart-input">
            <WandSparkles size={18} />
            <input
              id="smart-input"
              value={speech.listening && speech.interim ? speech.interim : smartText}
              onChange={(event) => {
                setSmartText(event.target.value)
                applySmart(event.target.value)
              }}
              placeholder={speech.listening ? 'Listening...' : 'Try "client call at 3:30pm today"'}
              disabled={saving}
              autoComplete="off"
            />
          </label>

          {speech.supported && (
            <button
              type="button"
              className={`mic-button ${speech.listening ? 'is-listening' : ''}`}
              onClick={speech.toggle}
              disabled={saving}
              aria-label={speech.listening ? 'Stop listening' : 'Speak your task'}
            >
              {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
        </div>

        {speech.error && <p className="smart-note warn"><CircleAlert size={13} /> {speech.error}</p>}

        {preview && (
          <div className="smart-preview">
            <Sparkles size={15} />
            <div>
              <strong>{preview.title}</strong>
              <div className="smart-chips">
                {preview.dueDate && <span><CalendarDays size={12} /> {format(parseISO(preview.dueDate), 'EEE d MMM, h:mm a')}</span>}
                {preview.category && <span><Tag size={12} /> {preview.category}</span>}
                <span><Flag size={12} /> {preview.priority.toLowerCase()}</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="task-title">What needs doing?</label>
            <input
              id="task-title"
              className="control"
              ref={titleRef}
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="Call Rahul about the project"
              disabled={saving}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <span className="field-label">When</span>

            <div className="chip-row">
              {DAY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`chip ${activePreset?.label === preset.label ? 'active' : ''}`}
                  onClick={() => setPresetDay(preset.days)}
                  disabled={saving}
                >
                  {preset.label}
                </button>
              ))}
              {(form.dueDay || form.dueTime) && (
                <button type="button" className="chip clear" onClick={clearDue} disabled={saving}>
                  <X size={13} /> Clear
                </button>
              )}
            </div>

            <div className="field-pair">
              <span className="control adorned">
                <CalendarDays size={17} />
                <input
                  type="date"
                  aria-label="Due date"
                  value={form.dueDay}
                  onChange={(event) => update('dueDay', event.target.value)}
                  disabled={saving}
                />
              </span>
              <span className="control adorned">
                <Clock3 size={17} />
                <input
                  type="time"
                  aria-label="Due time"
                  value={form.dueTime}
                  onChange={(event) => update('dueTime', event.target.value)}
                  disabled={saving}
                />
              </span>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Category</span>
            <div className="chip-row">
              <button
                type="button"
                className={`chip ${form.category === '' ? 'active' : ''}`}
                onClick={() => update('category', '')}
                disabled={saving}
              >
                None
              </button>
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`chip ${form.category === category ? 'active' : ''}`}
                  onClick={() => update('category', category)}
                  disabled={saving}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Priority</span>
            <div className="segmented">
              {TASK_PRIORITIES.map((priority) => (
                <button
                  key={priority}
                  type="button"
                  className={form.priority === priority ? 'active' : ''}
                  onClick={() => update('priority', priority)}
                  disabled={saving}
                >
                  {PRIORITY_LABELS[priority]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="task-notes">
              Notes <span className="field-optional">optional</span>
            </label>
            <textarea
              id="task-notes"
              className="control"
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="Anything worth remembering..."
              rows={2}
              disabled={saving}
            />
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button className="modal-submit" disabled={saving}>
              {saving
                ? <><LoaderCircle size={18} className="spin" /> Adding...</>
                : <><Plus size={18} /> Add task</>}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
