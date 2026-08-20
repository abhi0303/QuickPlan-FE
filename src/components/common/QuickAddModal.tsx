import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, CircleAlert, Flag, LoaderCircle, Plus, Tag, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
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

const EMPTY = {
  title: '',
  notes: '',
  category: '',
  dueDate: '',
  priority: 'MEDIUM' as TaskPriority,
}

/**
 * Only mounts the dialog while it is open, so every open starts from a fresh
 * `useState(EMPTY)` — no reset-in-effect needed, and no stale draft carried over.
 */
export function QuickAddModal() {
  const open = useAppStore((state) => state.quickAddOpen)
  return open ? <QuickAddDialog /> : null
}

function QuickAddDialog() {
  const setOpen = useAppStore((state) => state.setQuickAddOpen)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)

  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

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

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

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
        // datetime-local gives a local wall-clock string; the API wants ISO 8601
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
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
        <div className="modal-head">
          <div>
            <h2 id="quick-add-title">Quick add</h2>
            <p className="muted">Capture it now, organize it later.</p>
          </div>
          <button className="dismiss-button" onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="task-title">
            What needs doing?
            <input
              id="task-title"
              ref={titleRef}
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="Call Rahul about the project"
              disabled={saving}
              autoComplete="off"
            />
          </label>

          <div className="modal-grid">
            <label htmlFor="task-due">
              <span className="field-top"><CalendarDays size={14} /> Due</span>
              <input
                id="task-due"
                type="datetime-local"
                value={form.dueDate}
                onChange={(event) => update('dueDate', event.target.value)}
                disabled={saving}
              />
            </label>

            <label htmlFor="task-category">
              <span className="field-top"><Tag size={14} /> Category</span>
              <select
                id="task-category"
                value={form.category}
                onChange={(event) => update('category', event.target.value)}
                disabled={saving}
              >
                <option value="">None</option>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </div>

          <div className="field-block">
            <span className="field-top"><Flag size={14} /> Priority</span>
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

          <label htmlFor="task-notes">
            Notes <span className="field-hint">optional</span>
            <textarea
              id="task-notes"
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="Anything worth remembering..."
              rows={2}
              disabled={saving}
            />
          </label>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <div className="modal-actions">
            <button type="button" className="text-button" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button className="auth-submit" disabled={saving}>
              {saving
                ? <><LoaderCircle size={18} className="spin" /> Adding...</>
                : <><Plus size={18} /> Add task</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
