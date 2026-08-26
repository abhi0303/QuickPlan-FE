import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { addDays, format, parseISO } from 'date-fns'
import {
  AlarmClock, CalendarDays, CircleAlert, CircleCheckBig, Clock3, Flag, IndianRupee,
  LoaderCircle, Mic, MicOff, Plus, Repeat, Sparkles, Tag, Users, WandSparkles, X,
} from 'lucide-react'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { getApiErrorMessage } from '../../services/api'
import { isQuickAddCancel, parseQuickAdd } from '../../services/smartInput'
import type { ParsedIntent } from '../../services/smartParser'
import { createPersonalExpense } from '../../services/expenses'
import { createReminder } from '../../services/reminders'
import { createTask, TASK_PRIORITIES } from '../../services/tasks'
import type { TaskPriority } from '../../services/tasks'
import { useAppStore } from '../../store/useAppStore'
import './QuickAddModal.scss'

const CATEGORIES = ['Work', 'Personal', 'Finance', 'Health']
const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' }
const OFFSETS = [{ label: 'At time', value: '0' }, { label: '15 min', value: '15' }, { label: '30 min', value: '30' }, { label: '1 hour', value: '60' }]
const REPEATS = [{ label: 'Never', value: '' }, { label: 'Daily', value: 'DAILY' }, { label: 'Weekdays', value: 'WEEKDAYS' }, { label: 'Weekly', value: 'WEEKLY' }, { label: 'Monthly', value: 'MONTHLY' }]
const DAY_PRESETS = [{ label: 'Today', days: 0 }, { label: 'Tomorrow', days: 1 }, { label: 'Next week', days: 7 }]

const INTENT_TABS: { value: ParsedIntent; label: string; icon: typeof CircleCheckBig }[] = [
  { value: 'task', label: 'Task', icon: CircleCheckBig },
  { value: 'reminder', label: 'Reminder', icon: AlarmClock },
  { value: 'expense', label: 'Money', icon: IndianRupee },
]

const DEFAULT_TIME = '09:00'



/** Opening Quick add from a section starts on that section's form. */
const ROUTE_INTENT: Record<string, ParsedIntent> = {
  '/reminders': 'reminder',
  '/tasks': 'task',
}

const EMPTY = {
  intent: 'task' as ParsedIntent,
  title: '',
  notes: '',
  category: '',
  dueDay: '',
  dueTime: '',
  priority: 'MEDIUM' as TaskPriority,
  offsetMinutes: '15',
  recurrenceRule: '',
  amount: '',
  direction: 'RECEIVABLE' as 'PAYABLE' | 'RECEIVABLE',
  personName: '',
  reason: '',
}

type FormState = typeof EMPTY

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
    // Money that names another person is an IOU, and an IOU needs a group and
    // a split that a sentence cannot supply — so that one keeps the current tab
    // and the hint below points at Money. Everything else is your own spending.
    intent: parsed.intent === 'expense' && parsed.personName ? current.intent : parsed.intent,
    priority: parsed.priority,
    category: parsed.category ?? current.category,
    recurrenceRule: parsed.recurrenceRule ?? current.recurrenceRule,
    amount: parsed.amount !== undefined ? String(parsed.amount) : current.amount,
    direction: parsed.direction ?? current.direction,
    personName: parsed.personName ?? current.personName,
    dueDay,
    dueTime,
    // "Expense" is the parser's generic fallback — a title that says nothing,
    // so it is the one word worth discarding rather than prefilling.
    title: parsed.intent === 'expense' && parsed.title === 'Expense' ? current.title : parsed.title,
  }
}

function toIsoDue(form: FormState): string | undefined {
  if (!form.dueDay && !form.dueTime) return undefined
  const day = form.dueDay || format(new Date(), 'yyyy-MM-dd')
  const combined = new Date(`${day}T${form.dueTime || DEFAULT_TIME}`)
  return Number.isNaN(combined.getTime()) ? undefined : combined.toISOString()
}

export function QuickAddModal() {
  const open = useAppStore((state) => state.quickAddOpen)
  return open ? <QuickAddDialog /> : null
}

function QuickAddDialog() {
  const setOpen = useAppStore((state) => state.setQuickAddOpen)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)
  const bumpExpensesVersion = useAppStore((state) => state.bumpExpensesVersion)
  const seed = useAppStore((state) => state.quickAddSeed)
  const openedByVoice = useAppStore((state) => state.quickAddViaVoice)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // The page sets the starting form; anything spoken or typed overrides it,
  // since applyParsed writes the detected intent.
  const [form, setForm] = useState<FormState>(() => {
    const base: FormState = { ...EMPTY, intent: ROUTE_INTENT[pathname] ?? 'task' }
    return seed ? applyParsed(base, seed) : base
  })
  const [smartText, setSmartText] = useState(seed)
  /**
   * Spoken here, or spoken before the dialog opened. Editing the draft
   * afterwards does not make it typed — the thing was still created by voice,
   * which is what the mission counts.
   */
  const [spoken, setSpoken] = useState(openedByVoice)
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
      setSpoken(true)
      setSmartText(transcript)
      applySmart(transcript)
    },
  })

  const preview = smartText.trim() ? parseQuickAdd(smartText) : null
  // Money owed between people still belongs in a group — a sentence cannot say
  // who is in the split, so that case points at Money instead of guessing.
  const looksLikeIou = preview?.intent === 'expense' && Boolean(preview.personName)
  const isReminder = form.intent === 'reminder'
  const isExpense = form.intent === 'expense'

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

  const activePreset = DAY_PRESETS.find(
    (preset) => form.dueDay === format(addDays(new Date(), preset.days), 'yyyy-MM-dd'),
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = form.title.trim()
    const dueAt = toIsoDue(form)

    if (!title) {
      setError('Give it a title.')
      titleRef.current?.focus()
      return
    }

    // A reminder with no time cannot fire, so the API requires dueAt.
    if (isReminder && !dueAt) return setError('A reminder needs a date and time.')
    if (isExpense && !(Number(form.amount) > 0)) return setError('How much was it?')

    setSaving(true)
    try {
      if (isExpense) {
        await createPersonalExpense({
          title,
          totalAmount: Number(form.amount),
          category: form.category || undefined,
          // undated means "just now", which is what the API assumes too
          date: dueAt,
          notes: form.notes.trim() || undefined,
          createdVia: spoken ? 'VOICE' : 'MANUAL',
        })
        toast.success('Expense recorded')
        bumpExpensesVersion()
      } else if (isReminder) {
        await createReminder({
          title,
          dueAt: dueAt as string,
          offsetMinutes: Number(form.offsetMinutes) || 0,
          recurrenceRule: form.recurrenceRule || undefined,
          createdVia: spoken ? 'VOICE' : 'MANUAL',
        })
        toast.success('Reminder set')
      } else {
        await createTask({
          title,
          notes: form.notes.trim() || undefined,
          category: form.category || undefined,
          priority: form.priority,
          dueDate: dueAt,
          createdVia: spoken ? 'VOICE' : 'MANUAL',
          status: 'PENDING',
          isCompleted: false,
        })
        toast.success('Task added')
      }
      bumpTasksVersion()
      setOpen(false)
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not save that. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="quick-add-title">Quick add</h2>
            <p className="muted">Capture it now, organize it later.</p>
          </div>
          <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="smart-row">
          <label className="smart-field" htmlFor="smart-input">
            <WandSparkles size={18} />
            <input
              id="smart-input"
              value={speech.listening && speech.interim ? speech.interim : smartText}
              onChange={(event) => { setSmartText(event.target.value); applySmart(event.target.value) }}
              placeholder={speech.listening ? 'Listening...' : 'Try "I paid 500 for pizza"'}
              disabled={saving}
              autoComplete="off"
            />
          </label>
          {speech.supported && (
            <button type="button" className={`mic-button ${speech.listening ? 'is-listening' : ''}`} onClick={speech.toggle} disabled={saving}
              aria-label={speech.listening ? 'Stop listening' : 'Speak'}>
              {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
        </div>

        {speech.error && <p className="smart-note warn"><CircleAlert size={13} /> {speech.error}</p>}

        {looksLikeIou && (
          <p className="smart-note money">
            <IndianRupee size={13} />
            Money between you and someone else lives in a group, where it can be split.
            <button type="button" onClick={() => { setOpen(false); navigate('/expenses') }}>Open Money</button>
          </p>
        )}

        {preview && (
          <div className="smart-preview">
            <Sparkles size={15} />
            <div>
              <strong>{preview.title}</strong>
              <div className="smart-chips">
                <span>{INTENT_TABS.find((tab) => tab.value === preview.intent)?.label}</span>
                {preview.amount !== undefined && <span><IndianRupee size={12} />{preview.amount}</span>}
                {preview.personName && <span><Users size={12} /> {preview.personName}</span>}
                {preview.dueDate && <span><CalendarDays size={12} /> {format(parseISO(preview.dueDate), 'EEE d MMM, h:mm a')}</span>}
              </div>
            </div>
          </div>
        )}

        {/* the detected intent is always correctable */}
        <div className="intent-tabs" role="tablist" aria-label="What are you adding?">
          {INTENT_TABS.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" role="tab" aria-selected={form.intent === value}
              className={form.intent === value ? 'active' : ''} onClick={() => update('intent', value)} disabled={saving}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
                <label className="field-label" htmlFor="task-title">
                  {isReminder ? 'Remind me to' : isExpense ? 'What was it for?' : 'What needs doing?'}
                </label>
                <input id="task-title" className="control" ref={titleRef} value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder={isReminder ? 'Take medicine' : isExpense ? 'Petrol' : 'Call Rahul about the project'}
                  disabled={saving} autoComplete="off" />
              </div>

              {isExpense && (
                <div className="field">
                  <label className="field-label" htmlFor="quick-amount">How much?</label>
                  <span className="control adorned">
                    <IndianRupee size={17} />
                    <input id="quick-amount" type="number" min="0" step="any" inputMode="decimal"
                      value={form.amount} onChange={(e) => update('amount', e.target.value)}
                      placeholder="400" disabled={saving} />
                  </span>
                </div>
              )}

              <div className="field">
                <span className="field-label">When {isReminder && <span className="field-optional">required</span>}</span>
                <div className="chip-row">
                  {DAY_PRESETS.map((preset) => (
                    <button key={preset.label} type="button" className={`chip ${activePreset?.label === preset.label ? 'active' : ''}`}
                      onClick={() => setPresetDay(preset.days)} disabled={saving}>{preset.label}</button>
                  ))}
                  {(form.dueDay || form.dueTime) && (
                    <button type="button" className="chip clear" onClick={() => setForm((c) => ({ ...c, dueDay: '', dueTime: '' }))} disabled={saving}>
                      <X size={13} /> Clear
                    </button>
                  )}
                </div>
                <div className="field-pair">
                  <span className="control adorned">
                    <CalendarDays size={17} />
                    <input type="date" aria-label="Date" value={form.dueDay} onChange={(e) => update('dueDay', e.target.value)} disabled={saving} />
                  </span>
                  <span className="control adorned">
                    <Clock3 size={17} />
                    <input type="time" aria-label="Time" value={form.dueTime} onChange={(e) => update('dueTime', e.target.value)} disabled={saving} />
                  </span>
                </div>
              </div>

              {isReminder ? (
                <>
                  <div className="field">
                    <span className="field-label"><AlarmClock size={14} /> Notify me</span>
                    <div className="segmented">
                      {OFFSETS.map((offset) => (
                        <button key={offset.value} type="button" className={form.offsetMinutes === offset.value ? 'active' : ''}
                          onClick={() => update('offsetMinutes', offset.value)} disabled={saving}>{offset.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span className="field-label"><Repeat size={14} /> Repeat</span>
                    <div className="chip-row">
                      {REPEATS.map((repeat) => (
                        <button key={repeat.label} type="button" className={`chip ${form.recurrenceRule === repeat.value ? 'active' : ''}`}
                          onClick={() => update('recurrenceRule', repeat.value)} disabled={saving}>{repeat.label}</button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <span className="field-label"><Tag size={14} /> Category</span>
                    <div className="chip-row">
                      <button type="button" className={`chip ${form.category === '' ? 'active' : ''}`} onClick={() => update('category', '')} disabled={saving}>None</button>
                      {CATEGORIES.map((category) => (
                        <button key={category} type="button" className={`chip ${form.category === category ? 'active' : ''}`}
                          onClick={() => update('category', category)} disabled={saving}>{category}</button>
                      ))}
                    </div>
                  </div>
                  {!isExpense && (
                  <div className="field">
                    <span className="field-label"><Flag size={14} /> Priority</span>
                    <div className="segmented">
                      {TASK_PRIORITIES.map((priority) => (
                        <button key={priority} type="button" className={form.priority === priority ? 'active' : ''}
                          onClick={() => update('priority', priority)} disabled={saving}>{PRIORITY_LABELS[priority]}</button>
                      ))}
                    </div>
                  </div>
                  )}
                  <div className="field">
                    <label className="field-label" htmlFor="task-notes">Notes <span className="field-optional">optional</span></label>
                    <textarea id="task-notes" className="control" value={form.notes} onChange={(e) => update('notes', e.target.value)}
                      placeholder="Anything worth remembering..." rows={2} disabled={saving} />
                  </div>
                </>
              )}

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving ? <><LoaderCircle size={18} className="spin" /> Saving...</>
                : <><Plus size={18} /> {isReminder ? 'Set reminder' : isExpense ? 'Add expense' : 'Add task'}</>}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
