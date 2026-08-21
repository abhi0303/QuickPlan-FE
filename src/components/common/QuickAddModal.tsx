import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { addDays, format, parseISO } from 'date-fns'
import {
  AlarmClock, CalendarDays, CircleAlert, CircleCheckBig, Clock3, Flag, IndianRupee,
  LoaderCircle, Mic, MicOff, Plus, Repeat, Sparkles, Tag, Users, WandSparkles, X,
} from 'lucide-react'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { getApiErrorMessage } from '../../services/api'
import { isQuickAddCancel, parseNames, parseQuickAdd } from '../../services/smartInput'
import type { ParsedIntent } from '../../services/smartParser'
import { createIOU, createSplitExpense } from '../../services/expenses'
import { createReminder } from '../../services/reminders'
import { createTask, TASK_PRIORITIES } from '../../services/tasks'
import type { TaskPriority } from '../../services/tasks'
import { useAppStore } from '../../store/useAppStore'

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

/**
 * The money API has two distinct shapes, so the form asks which one up front
 * rather than inferring it from whichever field was left blank.
 *   self   -> /expenses/split, participantsCount 1  (your own spend)
 *   person -> /expenses/iou                          (one person owes, or is owed)
 *   split  -> /expenses/split with names             (shared bill)
 */
type ExpenseMode = 'self' | 'person' | 'split'

const EXPENSE_MODES: { value: ExpenseMode; label: string; hint: string }[] = [
  { value: 'self', label: 'Just me', hint: 'A personal expense — nobody owes anything.' },
  { value: 'person', label: 'One person', hint: 'A single IOU between you and one person.' },
  { value: 'split', label: 'Split', hint: 'Shared evenly between everyone listed, including you.' },
]

/** Opening Quick add from a section starts on that section's form. */
const ROUTE_INTENT: Record<string, ParsedIntent> = {
  '/reminders': 'reminder',
  '/expenses': 'expense',
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
  expenseMode: 'self' as ExpenseMode,
  direction: 'RECEIVABLE' as 'PAYABLE' | 'RECEIVABLE',
  personName: '',
  reason: '',
  participants: '',
}

type FormState = typeof EMPTY

function applyParsed(current: FormState, text: string): FormState {
  const parsed = parseQuickAdd(text)
  if (!parsed) return current

  const splitNames = parseNames(text.split(/\bwith\b/i).slice(1).join(' '))

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
    intent: parsed.intent,
    title: parsed.intent === 'expense' && parsed.title === 'Expense' ? current.title : parsed.title,
    priority: parsed.priority,
    category: parsed.category ?? current.category,
    recurrenceRule: parsed.recurrenceRule ?? current.recurrenceRule,
    amount: parsed.amount !== undefined ? String(parsed.amount) : current.amount,
    direction: parsed.direction ?? current.direction,
    personName: parsed.personName ?? current.personName,
    dueDay,
    dueTime,
    // the voice flow appends "with <names>" after the split question
    participants: splitNames.join(', ') || current.participants,
    expenseMode: parsed.personName ? 'person' : splitNames.length ? 'split' : current.expenseMode,
    // "Expense" is the parser's generic fallback; leave the field empty so the
    // placeholder shows instead of a meaningless pre-filled value
    reason: parsed.reason ?? (parsed.title === 'Expense' ? current.reason : parsed.title),
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
  const seed = useAppStore((state) => state.quickAddSeed)
  const { pathname } = useLocation()

  // The page sets the starting form; anything spoken or typed overrides it,
  // since applyParsed writes the detected intent.
  const [form, setForm] = useState<FormState>(() => {
    const base: FormState = { ...EMPTY, intent: ROUTE_INTENT[pathname] ?? 'task' }
    return seed ? applyParsed(base, seed) : base
  })
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
  const isReminder = form.intent === 'reminder'
  const isExpense = form.intent === 'expense'
  const splitNames = parseNames(form.participants)
  const amountValue = Number(form.amount)
  const perHead = Number.isFinite(amountValue) && amountValue > 0 && splitNames.length
    ? Math.round((amountValue / (splitNames.length + 1)) * 100) / 100
    : null

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

    if (isExpense) {
      const amount = Number(form.amount)
      if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount greater than zero.')
      if (form.expenseMode === 'person' && !form.personName.trim()) {
        return setError('Who is this with? Add a name, or switch to Just me.')
      }
      if (form.expenseMode === 'split' && splitNames.length === 0) {
        return setError('List who you are splitting with, or switch to Just me.')
      }
    } else if (!title) {
      setError('Give it a title.')
      titleRef.current?.focus()
      return
    }

    // A reminder with no time cannot fire, so the API requires dueAt.
    if (isReminder && !dueAt) return setError('A reminder needs a date and time.')

    setSaving(true)
    try {
      if (isReminder) {
        await createReminder({
          title,
          dueAt: dueAt as string,
          offsetMinutes: Number(form.offsetMinutes) || 0,
          recurrenceRule: form.recurrenceRule || undefined,
        })
        toast.success('Reminder set')
      } else if (isExpense) {
        const amount = Number(form.amount)
        const label = form.reason.trim() || title || 'Expense'

        if (form.expenseMode === 'person') {
          const person = form.personName.trim()
          await createIOU({ personName: person, amount, direction: form.direction, reason: form.reason.trim() || undefined })
          toast.success(form.direction === 'RECEIVABLE' ? `${person} owes you ₹${amount}` : `You owe ${person} ₹${amount}`)
        } else {
          const names = form.expenseMode === 'split' ? splitNames : []
          await createSplitExpense({
            title: label,
            totalAmount: amount,
            participantsCount: names.length + 1,
            paidByMe: true,
            names,
          })
          toast.success(names.length ? `Split between ${names.length + 1} people` : 'Expense saved')
        }
      } else {
        await createTask({
          title,
          notes: form.notes.trim() || undefined,
          category: form.category || undefined,
          priority: form.priority,
          dueDate: dueAt,
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
          {isExpense ? (
            <>
              <div className="field">
                <span className="field-label">Who is involved?</span>
                <div className="segmented">
                  {EXPENSE_MODES.map((mode) => (
                    <button key={mode.value} type="button" className={form.expenseMode === mode.value ? 'active' : ''}
                      onClick={() => update('expenseMode', mode.value)} disabled={saving}>{mode.label}</button>
                  ))}
                </div>
                <p className="field-hint">{EXPENSE_MODES.find((mode) => mode.value === form.expenseMode)?.hint}</p>
              </div>

              <div className="field-pair">
                <div className="field">
                  <label className="field-label" htmlFor="amount">Amount</label>
                  <span className="control adorned">
                    <IndianRupee size={17} />
                    <input id="amount" type="number" inputMode="decimal" min="0" step="any" value={form.amount}
                      onChange={(e) => update('amount', e.target.value)} placeholder="500" disabled={saving} />
                  </span>
                </div>

                {form.expenseMode === 'person' && (
                  <div className="field">
                    <span className="field-label">Direction</span>
                    <div className="segmented">
                      <button type="button" className={form.direction === 'RECEIVABLE' ? 'active' : ''}
                        onClick={() => update('direction', 'RECEIVABLE')} disabled={saving}>They owe me</button>
                      <button type="button" className={form.direction === 'PAYABLE' ? 'active' : ''}
                        onClick={() => update('direction', 'PAYABLE')} disabled={saving}>I owe them</button>
                    </div>
                  </div>
                )}
              </div>

              {form.expenseMode === 'person' && (
                <div className="field">
                  <label className="field-label" htmlFor="person">Who?</label>
                  <span className="control adorned">
                    <Users size={17} />
                    <input id="person" ref={titleRef} value={form.personName}
                      onChange={(e) => update('personName', e.target.value)}
                      placeholder="e.g. Rahul" disabled={saving} autoComplete="off" />
                  </span>
                </div>
              )}

              {form.expenseMode === 'split' && (
                <div className="field">
                  <label className="field-label" htmlFor="participants">
                    Split between
                    {splitNames.length > 0 && perHead && (
                      <span className="field-optional">{splitNames.length + 1} people · ₹{perHead} each</span>
                    )}
                  </label>
                  <span className="control adorned">
                    <Users size={17} />
                    <input id="participants" value={form.participants}
                      onChange={(e) => update('participants', e.target.value)}
                      placeholder="Rahul, Ravina and Suraj" disabled={saving} autoComplete="off" />
                  </span>
                  <p className="field-hint">You are counted automatically — just list the others.</p>
                </div>
              )}

              <div className="field">
                <label className="field-label" htmlFor="reason">What for?</label>
                <input id="reason" className="control" value={form.reason}
                  onChange={(e) => { update('reason', e.target.value); update('title', e.target.value) }}
                  placeholder="Pizza" disabled={saving} autoComplete="off" />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label className="field-label" htmlFor="task-title">{isReminder ? 'Remind me to' : 'What needs doing?'}</label>
                <input id="task-title" className="control" ref={titleRef} value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder={isReminder ? 'Take medicine' : 'Call Rahul about the project'} disabled={saving} autoComplete="off" />
              </div>

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
                  <div className="field">
                    <span className="field-label"><Flag size={14} /> Priority</span>
                    <div className="segmented">
                      {TASK_PRIORITIES.map((priority) => (
                        <button key={priority} type="button" className={form.priority === priority ? 'active' : ''}
                          onClick={() => update('priority', priority)} disabled={saving}>{PRIORITY_LABELS[priority]}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="task-notes">Notes <span className="field-optional">optional</span></label>
                    <textarea id="task-notes" className="control" value={form.notes} onChange={(e) => update('notes', e.target.value)}
                      placeholder="Anything worth remembering..." rows={2} disabled={saving} />
                  </div>
                </>
              )}
            </>
          )}

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving ? <><LoaderCircle size={18} className="spin" /> Saving...</>
                : <><Plus size={18} /> {isReminder ? 'Set reminder' : isExpense ? 'Save expense' : 'Add task'}</>}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
