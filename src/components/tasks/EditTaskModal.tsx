import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { addDays, format, parseISO } from 'date-fns'
import { CalendarDays, CircleAlert, Clock3, Flag, LoaderCircle, Tag, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { TASK_PRIORITIES, updateTask } from '../../services/tasks'
import type { CreateTaskPayload, Task, TaskPriority } from '../../services/tasks'
import { useAppStore } from '../../store/useAppStore'
import './EditTaskModal.scss'

const CATEGORIES = ['Work', 'Personal', 'Finance', 'Health']

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}
const DAY_PRESETS = [{ label: 'Today', days: 0 }, { label: 'Tomorrow', days: 1 }, { label: 'Next week', days: 7 }]
const DEFAULT_TIME = '09:00'

function splitDue(dueDate?: string) {
  if (!dueDate) return { day: '', time: '' }
  const parsed = parseISO(dueDate)
  if (Number.isNaN(parsed.getTime())) return { day: '', time: '' }
  return { day: format(parsed, 'yyyy-MM-dd'), time: format(parsed, 'HH:mm') }
}

export function EditTaskModal() {
  const task = useAppStore((state) => state.editingTask)
  return task ? <EditTaskDialog task={task} /> : null
}

function EditTaskDialog({ task }: { task: Task }) {
  const close = useAppStore((state) => state.setEditingTask)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)

  const initial = splitDue(task.dueDate)
  const [title, setTitle] = useState(task.title)
  const [category, setCategory] = useState(task.category ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [day, setDay] = useState(initial.day)
  const [time, setTime] = useState(initial.time)
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

  function toIso() {
    if (!day && !time) return undefined
    const combined = new Date(`${day || format(new Date(), 'yyyy-MM-dd')}T${time || DEFAULT_TIME}`)
    return Number.isNaN(combined.getTime()) ? undefined : combined.toISOString()
  }

  const activePreset = DAY_PRESETS.find((preset) => day === format(addDays(new Date(), preset.days), 'yyyy-MM-dd'))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setError('A task needs a title.')
      titleRef.current?.focus()
      return
    }

    // Send only what actually changed — UpdateTaskDto is a partial, and an
    // untouched field should not be overwritten.
    const patch: Partial<CreateTaskPayload> = {}
    if (trimmed !== task.title) patch.title = trimmed
    if ((category || undefined) !== task.category) patch.category = category || undefined
    if (priority !== task.priority) patch.priority = priority
    const nextDue = toIso()
    if (nextDue !== task.dueDate) patch.dueDate = nextDue

    if (Object.keys(patch).length === 0) {
      close(null)
      return
    }

    setSaving(true)
    try {
      await updateTask(task.id, patch)
      bumpTasksVersion()
      close(null)
      toast.success('Task updated')
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not save those changes.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => close(null)}>
      <div className="modal edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-task-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="edit-task-title">Edit task</h2>
            <p className="muted">Change the details — the type stays a task.</p>
          </div>
          <button className="modal-close" onClick={() => close(null)} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="edit-title">Title</label>
            <input id="edit-title" className="control" ref={titleRef} value={title}
              onChange={(event) => { setTitle(event.target.value); setError('') }}
              disabled={saving} autoComplete="off" />
          </div>

          <div className="field">
            <span className="field-label"><Tag size={14} /> Category</span>
            <div className="chip-row">
              <button type="button" className={`chip ${category === '' ? 'active' : ''}`}
                onClick={() => setCategory('')} disabled={saving}>None</button>
              {CATEGORIES.map((option) => (
                <button key={option} type="button" className={`chip ${category === option ? 'active' : ''}`}
                  onClick={() => setCategory(option)} disabled={saving}>{option}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label"><Flag size={14} /> Priority</span>
            <div className="segmented">
              {TASK_PRIORITIES.map((option) => (
                <button key={option} type="button" className={priority === option ? 'active' : ''}
                  onClick={() => setPriority(option)} disabled={saving}>{PRIORITY_LABELS[option]}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">When</span>
            <div className="chip-row">
              {DAY_PRESETS.map((preset) => (
                <button key={preset.label} type="button"
                  className={`chip ${activePreset?.label === preset.label ? 'active' : ''}`}
                  onClick={() => { setDay(format(addDays(new Date(), preset.days), 'yyyy-MM-dd')); setTime(time || DEFAULT_TIME) }}
                  disabled={saving}>{preset.label}</button>
              ))}
              {(day || time) && (
                <button type="button" className="chip clear" onClick={() => { setDay(''); setTime('') }} disabled={saving}>
                  <X size={13} /> Clear
                </button>
              )}
            </div>
            <div className="field-pair">
              <span className="control adorned">
                <CalendarDays size={17} />
                <input type="date" aria-label="Due date" value={day} onChange={(e) => setDay(e.target.value)} disabled={saving} />
              </span>
              <span className="control adorned">
                <Clock3 size={17} />
                <input type="time" aria-label="Due time" value={time} onChange={(e) => setTime(e.target.value)} disabled={saving} />
              </span>
            </div>
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
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
